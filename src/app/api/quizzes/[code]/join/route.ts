import { bad, getQuiz } from "@/lib/api";
import { serverSupabase } from "@/lib/supabase";

export async function POST(req: Request, ctx: RouteContext<"/api/quizzes/[code]/join">) {
  const { code } = await ctx.params;
  const { name } = await req.json().catch(() => ({}));
  const clean = String(name ?? "").trim().slice(0, 20);
  if (!clean) return bad("Name is required");
  const quiz = await getQuiz(code);
  if (!quiz) return bad("Quiz not found", 404);

  const { data, error } = await serverSupabase()
    .from("players")
    .insert({ quiz_id: quiz.id, name: clean })
    .select("id")
    .single();
  if (error || !data) return bad(error?.message ?? "Could not join", 500);
  return Response.json({ playerId: data.id });
}
