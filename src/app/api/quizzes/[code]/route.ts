import { bad, getQuiz } from "@/lib/api";
import { serverSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/quizzes/[code]">) {
  const { code } = await ctx.params;
  const quiz = await getQuiz(code);
  if (!quiz) return bad("Quiz not found", 404);

  const db = serverSupabase();
  let question = null;
  let distribution: number[] | null = null;
  let answered = 0;

  if (quiz.current_index >= 0 && quiz.phase !== "lobby") {
    const { data: q } = await db
      .from("questions")
      .select("idx,prompt,options,difficulty,tags,answer_index")
      .eq("quiz_id", quiz.id)
      .eq("idx", quiz.current_index)
      .single();
    if (q) {
      const reveal = quiz.phase === "reveal" || quiz.phase === "ended";
      question = reveal ? q : { ...q, answer_index: undefined };
      const { data: ans } = await db
        .from("answers")
        .select("choice")
        .eq("quiz_id", quiz.id)
        .eq("question_idx", quiz.current_index);
      answered = ans?.length ?? 0;
      if (reveal) {
        distribution = [0, 0, 0, 0];
        for (const a of ans ?? []) distribution[a.choice]++;
      }
    }
  }

  return Response.json({ quiz, question, distribution, answered, now: Date.now() });
}
