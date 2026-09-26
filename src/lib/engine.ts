import { after } from "next/server";
import { runBasketAgent, type TagStats } from "@/agents/basket";
import { log } from "./api";
import { ticketCapacity, type Bundle, type Item, type Player, type Quiz } from "./game";
import { serverSupabase } from "./supabase";

/** Compare-and-set transition so two stage tabs can't double-advance. Returns false if state moved on. */
async function transition(quiz: Quiz, patch: Partial<Quiz>) {
  const { data, error } = await serverSupabase()
    .from("quizzes")
    .update(patch)
    .eq("id", quiz.id)
    .eq("phase", quiz.phase)
    .eq("current_index", quiz.current_index)
    .select("id");
  if (error) console.error("transition failed", error);
  return (data?.length ?? 0) > 0;
}

/** Self-paced play: the host only opens the quiz; each fan then moves through questions on their own phone. */
export async function start(quiz: Quiz) {
  if (quiz.phase !== "lobby") return false;
  return transition(quiz, { status: "live", phase: "question", current_index: 0, phase_ends_at: null });
}

/** Every 10 answers the Merch agent reads the room: which fan tags are strongest right now. */
export async function roomInsight(quiz: Quiz, answerCount: number) {
  if (answerCount % 10 !== 0) return;
  const { data: players } = await serverSupabase().from("players").select("profile").eq("quiz_id", quiz.id);
  const room: Record<string, number> = {};
  for (const p of players ?? []) for (const [t, v] of Object.entries(p.profile ?? {})) room[t] = (room[t] ?? 0) + (v as number);
  const top = Object.entries(room).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top) await log(quiz.id, "merch", `${answerCount} answers in. Room is strongest on "${top}", so agents will favour ${top} merch.`);
}

/** Host fast-forward: everyone reaches the front of the queue at once. */
export async function finish(quiz: Quiz) {
  const ok = await transition(quiz, { status: "ended", phase: "ended", phase_ends_at: null });
  if (!ok) return false;
  after(() => runBasketAgents(quiz));
  return true;
}

/** One fan reached the front of their queue: run just their Basket agent (idempotent). */
export async function finishPlayer(quiz: Quiz, playerId: string) {
  after(() => runBasketAgents(quiz, playerId));
}

async function runBasketAgents(quiz: Quiz, onlyPlayerId?: string) {
  const db = serverSupabase();
  const [{ data: players }, { data: items }, { data: answers }, { data: questions }] = await Promise.all([
    db.from("players").select("*").eq("quiz_id", quiz.id).order("score", { ascending: false }).order("created_at"),
    db.from("items").select("*").eq("quiz_id", quiz.id),
    db.from("answers").select("player_id,question_idx,correct").eq("quiz_id", quiz.id),
    db.from("questions").select("idx,tags").eq("quiz_id", quiz.id),
  ]);
  const catalog = (items ?? []) as Item[];
  const ranked = (players ?? []) as Player[];

  // Per-player, per-tag right/wrong: the signal each Basket agent shops from.
  const tagsByIdx = new Map((questions ?? []).map((q) => [q.idx as number, q.tags as string[]]));
  const stats = new Map<string, TagStats>();
  for (const a of answers ?? []) {
    const s = stats.get(a.player_id) ?? {};
    for (const t of tagsByIdx.get(a.question_idx) ?? []) {
      s[t] ??= { right: 0, wrong: 0 };
      s[t][a.correct ? "right" : "wrong"]++;
    }
    stats.set(a.player_id, s);
  }

  // Each fan was asked however many questions they reached; unanswered ones don't count against them.
  const answeredBy = new Map<string, number>();
  for (const a of answers ?? []) answeredBy.set(a.player_id, (answeredBy.get(a.player_id) ?? 0) + 1);
  const todo = ranked
    .map((player, i) => ({ player, rank: i + 1 }))
    .filter(({ player }) => !player.bundle && (!onlyPlayerId || player.id === onlyPlayerId));
  if (todo.length === 0) return;

  // Tickets: first to the front wins. A fan arriving alone gets one if any are left;
  // the host fast-forward hands the remainder out by quiz rank.
  const capacity = ticketCapacity(ranked.length);
  let left = capacity - ranked.filter((p) => p.bundle?.ticket).length;
  const tickets = new Map(todo.map((t) => [t.player.id, left-- > 0]));

  // Claim each fan first so a double trigger can't run two agents for one fan.
  const work: typeof todo = [];
  for (const t of todo) {
    const pending = { rank: t.rank, pending: true, ticket: tickets.get(t.player.id) } as unknown as Bundle;
    const { data } = await db.from("players").update({ bundle: pending }).eq("id", t.player.id).is("bundle", null).select("id");
    if (data?.length) work.push(t);
  }
  if (work.length === 0) return;

  let sold = ranked.filter((p) => p.bundle?.ticket).length;
  for (const { player } of work) {
    const got = tickets.get(player.id);
    if (got) sold++;
    await log(
      quiz.id,
      "fan",
      got
        ? `🎟️ ${player.name} reached the front and got tickets (${Math.min(sold, capacity)}/${capacity} sold). Their Basket agent is shopping.`
        : `❌ ${player.name} reached the front but tickets are sold out. Their agent is building a merch basket instead.`,
    );
  }

  // One agent per fan, all in parallel (small batches to stay polite to the API).
  for (let i = 0; i < work.length; i += 10) {
    await Promise.all(
      work.slice(i, i + 10).map(async ({ player, rank }) => {
        const asked = answeredBy.get(player.id) ?? 0;
        const bundle = await runBasketAgent({
          artist: quiz.artist,
          player,
          rank,
          asked,
          tagStats: stats.get(player.id) ?? {},
          catalog,
          ticket: tickets.get(player.id) ?? false,
        });
        await db.from("players").update({ bundle }).eq("id", player.id);
        if (rank <= 5 || onlyPlayerId) {
          const revisions = bundle.trace.filter((t) => t.kind === "guardrail").length;
          await log(
            quiz.id,
            "fan",
            `${player.name}'s agent (${bundle.correct}/${asked}, ${bundle.tier}): ${[...bundle.items.map((x) => x.title), ...(bundle.free_item ? [`FREE ${bundle.free_item.title}`] : [])].join(", ")} · £${bundle.total_gbp.toFixed(2)} of £${bundle.budget_gbp}${revisions ? ` · ${revisions} draft${revisions > 1 ? "s" : ""} blocked by guardrails` : ""}.`,
          );
        }
      }),
    );
  }
}
