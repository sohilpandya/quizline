import { bad, getQuiz } from "@/lib/api";
import { finishPlayer } from "@/lib/engine";

export async function POST(req: Request, ctx: RouteContext<"/api/quizzes/[code]/finish">) {
  const { code } = await ctx.params;
  const { playerId } = await req.json().catch(() => ({}));
  const quiz = await getQuiz(code);
  if (!quiz) return bad("Quiz not found", 404);
  if (!playerId) return bad("playerId required");
  await finishPlayer(quiz, String(playerId));
  return Response.json({ ok: true });
}
