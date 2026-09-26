import { buildBundle } from "@/agents/fan";
import { log } from "./api";
import { QUESTION_MS, REVEAL_MS, type Item, type Phase, type Player, type Quiz } from "./game";
import { serverSupabase } from "./supabase";

const at = (ms: number) => new Date(Date.now() + ms).toISOString();

/** Compare-and-set transition so two stage tabs can't double-advance. Returns false if state moved on. */
async function transition(quiz: Quiz, patch: Partial<Quiz>) {
  const { data } = await serverSupabase()
    .from("quizzes")
    .update(patch)
    .eq("id", quiz.id)
    .eq("phase", quiz.phase)
    .eq("current_index", quiz.current_index)
    .select("id");
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
  const [{ data: players }, { data: items }] = await Promise.all([
    db.from("players").select("*").eq("quiz_id", quiz.id).order("score", { ascending: false }).order("created_at"),
    db.from("items").select("*").eq("quiz_id", quiz.id),
  ]);
  const catalog = (items ?? []) as Item[];
  const ranked = (players ?? []) as Player[];

  await log(quiz.id, "fan", `Queue reached the front. Building ${ranked.length} personalised bundles from ${catalog.length} items.`);

  // Fan agents run in parallel, in small batches to stay polite to the API.
  for (let i = 0; i < ranked.length; i += 8) {
    await Promise.all(
      ranked.slice(i, i + 8).map(async (player, j) => {
        const rank = i + j + 1;
        const bundle = await buildBundle(quiz.artist, player, rank, catalog);
        await db.from("players").update({ bundle }).eq("id", player.id);
        if (rank <= 3) {
          await log(
            quiz.id,
            "fan",
            `${player.name} (#${rank}): ${bundle.items.map((x) => x.title).join(", ")}, £${bundle.total_gbp.toFixed(2)} after ${bundle.discount_pct}% off.`,
          );
        }
      }),
    );
  }
  return true;
}
