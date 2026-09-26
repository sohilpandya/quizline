import { bad, getQuiz } from "@/lib/api";
import { start } from "@/lib/engine";

export async function POST(_req: Request, ctx: RouteContext<"/api/quizzes/[code]/advance">) {
  const { code } = await ctx.params;
  const quiz = await getQuiz(code);
  if (!quiz) return bad("Quiz not found", 404);
  return Response.json({ moved: await start(quiz) });
}
