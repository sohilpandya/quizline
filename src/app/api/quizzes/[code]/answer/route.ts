import { bad, getQuiz } from "@/lib/api";
import { roomInsight } from "@/lib/engine";
import { QUESTION_MS } from "@/lib/game";
import { serverSupabase } from "@/lib/supabase";

// The phone already showed right/wrong instantly; this records it for score, profile and the Basket agent.
export async function POST(req: Request, ctx: RouteContext<"/api/quizzes/[code]/answer">) {
  const { code } = await ctx.params;
  const { playerId, choice, questionIdx, ms } = await req.json().catch(() => ({}));
  const quiz = await getQuiz(code);
  if (!quiz) return bad("Quiz not found", 404);
  if (quiz.phase === "lobby") return bad("Quiz has not started", 409);

  const db = serverSupabase();
  const [{ data: q }, { data: player }] = await Promise.all([
    db.from("questions").select("answer_index,difficulty,tags").eq("quiz_id", quiz.id).eq("idx", questionIdx).single(),
    db.from("players").select("*").eq("id", playerId).eq("quiz_id", quiz.id).single(),
  ]);
  if (!q || !player) return bad("Unknown player or question", 404);

  const elapsed = Math.max(0, Math.min(QUESTION_MS, Number(ms) || QUESTION_MS));
  const timedOut = Number(choice) < 0;
  const correct = !timedOut && Number(choice) === q.answer_index;

  const { error } = await db
    .from("answers")
    .insert({ quiz_id: quiz.id, player_id: playerId, question_idx: questionIdx, choice: timedOut ? -1 : Number(choice), correct, ms: elapsed });
  if (error) return bad("Already answered", 409);

  let points = 0;
  if (correct) {
    points = 100 * q.difficulty + Math.round(50 * (1 - elapsed / QUESTION_MS));
    // Profile building is deterministic: every correct answer boosts affinity for the question's tags.
    const profile: Record<string, number> = { ...(player.profile ?? {}) };
    for (const t of q.tags as string[]) profile[t] = (profile[t] ?? 0) + q.difficulty;
    await db
      .from("players")
      .update({ score: player.score + points, correct: player.correct + 1, profile })
      .eq("id", playerId);
  }

  const { count } = await db.from("answers").select("id", { count: "exact", head: true }).eq("quiz_id", quiz.id);
  await roomInsight(quiz, count ?? 0);
  return Response.json({ correct, points });
}
