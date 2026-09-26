import { bad, getQuiz } from "@/lib/api";
import { finish } from "@/lib/engine";

export const maxDuration = 120;

export async function POST(_req: Request, ctx: RouteContext<"/api/quizzes/[code]/end">) {
  const { code } = await ctx.params;
  const quiz = await getQuiz(code);
  if (!quiz) return bad("Quiz not found", 404);
  return Response.json({ ended: await finish(quiz) });
}
