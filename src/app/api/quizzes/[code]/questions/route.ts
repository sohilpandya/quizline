import { bad, getQuiz } from "@/lib/api";
import { serverSupabase } from "@/lib/supabase";

// Self-paced play: the phone gets the whole set (with answers) so feedback is instant, with no round trip.
export async function GET(_req: Request, ctx: RouteContext<"/api/quizzes/[code]/questions">) {
  const { code } = await ctx.params;
  const quiz = await getQuiz(code);
  if (!quiz) return bad("Quiz not found", 404);
  if (quiz.phase === "lobby") return bad("Quiz has not started", 409);
  const { data } = await serverSupabase()
    .from("questions")
    .select("idx,prompt,options,answer_index,difficulty,tags")
    .eq("quiz_id", quiz.id)
    .order("idx");
  return Response.json({ questions: data ?? [] });
}
