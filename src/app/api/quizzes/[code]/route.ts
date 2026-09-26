import { bad, getQuiz } from "@/lib/api";
import { serverSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/quizzes/[code]">) {
  const { code } = await ctx.params;
  const quiz = await getQuiz(code);
  if (!quiz) return bad("Quiz not found", 404);

  // Per-fan progress for the stage board.
  const { data: ans } = await serverSupabase().from("answers").select("player_id").eq("quiz_id", quiz.id);
  const progress: Record<string, number> = {};
  for (const a of ans ?? []) progress[a.player_id] = (progress[a.player_id] ?? 0) + 1;

  return Response.json({ quiz, progress, answered: ans?.length ?? 0, now: Date.now() });
}
