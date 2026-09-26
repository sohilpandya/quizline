import { bad, getQuiz } from "@/lib/api";
import { advance } from "@/lib/engine";

export const maxDuration = 120;

export async function POST(req: Request, ctx: RouteContext<"/api/quizzes/[code]/advance">) {
  const { code } = await ctx.params;
  const { phase, index } = await req.json().catch(() => ({}));
  const quiz = await getQuiz(code);
  if (!quiz) return bad("Quiz not found", 404);
  const moved = await advance(quiz, { phase, index });
  return Response.json({ moved });
}
