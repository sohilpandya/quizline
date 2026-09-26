import { bad, getQuiz } from "@/lib/api";
import { QUESTION_MS } from "@/lib/game";
import { serverSupabase } from "@/lib/supabase";

const GRACE_MS = 1_000;

export async function POST(req: Request, ctx: RouteContext<"/api/quizzes/[code]/answer">) {
  const { code } = await ctx.params;
  const { playerId, choice, questionIdx } = await req.json().catch(() => ({}));
  const quiz = await getQuiz(code);
  if (!quiz) return bad("Quiz not found", 404);
  if (quiz.phase !== "question" || quiz.current_index !== questionIdx || !quiz.phase_ends_at) {
    return bad("Question is closed", 409);
  }
  const endsAt = new Date(quiz.phase_ends_at).getTime();
  const now = Date.now();
  if (now > endsAt + GRACE_MS) return bad("Too late", 409);

  const db = serverSupabase();
  const [{ data: q }, { data: player }] = await Promise.all([
    db.from("questions").select("answer_index,difficulty,tags").eq("quiz_id", quiz.id).eq("idx", questionIdx).single(),
    db.from("players").select("*").eq("id", playerId).eq("quiz_id", quiz.id).single(),
  ]);
  if (!q || !player) return bad("Unknown player or question", 404);

  const ms = Math.max(0, Math.min(QUESTION_MS, QUESTION_MS - (endsAt - now)));
  const correct = Number(choice) === q.answer_index;

  const { error } = await db
    .from("answers")
    .insert({ quiz_id: quiz.id, player_id: playerId, question_idx: questionIdx, choice: Number(choice), correct, ms });
  if (error) return bad("Already answered", 409);

  let points = 0;
  if (correct) {
    points = 100 * q.difficulty + Math.round(50 * (1 - ms / QUESTION_MS));
    // Profile building is deterministic: every correct answer boosts affinity for the question's tags.
    const profile: Record<string, number> = { ...(player.profile ?? {}) };
    for (const t of q.tags as string[]) profile[t] = (profile[t] ?? 0) + q.difficulty;
    await db
      .from("players")
      .update({ score: player.score + points, correct: player.correct + 1, profile })
      .eq("id", playerId);
  }

  return Response.json({ correct, points, answer_index: q.answer_index });
}
