import { runBasketAgent, type TagStats } from "@/agents/basket";
import { log } from "./api";
import { QUESTION_MS, REVEAL_MS, type Item, type Phase, type Player, type Quiz } from "./game";
import { serverSupabase } from "./supabase";

const at = (ms: number) => new Date(Date.now() + ms).toISOString();

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

export async function advance(quiz: Quiz, from: { phase: Phase; index: number }) {
  if (quiz.phase !== from.phase || quiz.current_index !== from.index) return false;

  if (quiz.phase === "lobby") {
    return transition(quiz, { status: "live", phase: "question", current_index: 0, phase_ends_at: at(QUESTION_MS) });
  }
  if (quiz.phase === "question") {
    const ok = await transition(quiz, { phase: "reveal", phase_ends_at: at(REVEAL_MS) });
    if (ok) await roundInsight(quiz);
    return ok;
  }
  if (quiz.phase === "reveal") {
    const next = quiz.current_index + 1;
    if (next >= quiz.question_count) return finish(quiz);
    return transition(quiz, { phase: "question", current_index: next, phase_ends_at: at(QUESTION_MS) });
  }
  return false;
}

async function roundInsight(quiz: Quiz) {
  const db = serverSupabase();
  const [{ data: ans }, { data: players }] = await Promise.all([
    db.from("answers").select("correct").eq("quiz_id", quiz.id).eq("question_idx", quiz.current_index),
    db.from("players").select("profile").eq("quiz_id", quiz.id),
  ]);
  const total = ans?.length ?? 0;
  const right = ans?.filter((a) => a.correct).length ?? 0;
  const room: Record<string, number> = {};
  for (const p of players ?? []) for (const [t, v] of Object.entries(p.profile ?? {})) room[t] = (room[t] ?? 0) + (v as number);
  const top = Object.entries(room).sort((a, b) => b[1] - a[1])[0]?.[0];

  await log(
    quiz.id,
    "quiz",
    `Q${quiz.current_index + 1}: ${right}/${total} correct${total ? ` (${Math.round((right / total) * 100)}%)` : ""}.`,
  );
  if (top) await log(quiz.id, "merch", `Room is strongest on "${top}" so far. Weighting ${top} items up in bundles.`);
}

export async function finish(quiz: Quiz) {
  const ok = await transition(quiz, { status: "ended", phase: "ended", phase_ends_at: null });
  if (!ok) return false;

  const db = serverSupabase();
  const [{ data: players }, { data: items }, { data: answers }, { data: questions }] = await Promise.all([
    db.from("players").select("*").eq("quiz_id", quiz.id).order("score", { ascending: false }).order("created_at"),
    db.from("items").select("*").eq("quiz_id", quiz.id),
    db.from("answers").select("player_id,question_idx,correct").eq("quiz_id", quiz.id),
    db.from("questions").select("idx,tags").eq("quiz_id", quiz.id),
  ]);
  const catalog = (items ?? []) as Item[];
  const ranked = (players ?? []) as Player[];
  const asked = Math.max(0, quiz.current_index + 1);

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

  await log(quiz.id, "fan", `Queue reached the front. Launching ${ranked.length} Basket agents over a ${catalog.length}-item catalog.`);

  // One agent per fan, all in parallel (small batches to stay polite to the API).
  for (let i = 0; i < ranked.length; i += 10) {
    await Promise.all(
      ranked.slice(i, i + 10).map(async (player, j) => {
        const rank = i + j + 1;
        const bundle = await runBasketAgent({
          artist: quiz.artist,
          player,
          rank,
          asked,
          tagStats: stats.get(player.id) ?? {},
          catalog,
        });
        await db.from("players").update({ bundle }).eq("id", player.id);
        if (rank <= 5) {
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
  return true;
}
