import { bad, getQuiz } from "@/lib/api";
import { serverSupabase } from "@/lib/supabase";

export async function POST(req: Request, ctx: RouteContext<"/api/quizzes/[code]/join">) {
  const { code } = await ctx.params;
  const { name, budget } = await req.json().catch(() => ({}));
  const budgetGbp = Math.max(10, Math.min(500, Math.round(Number(budget) || 60)));
  const clean = String(name ?? "").trim().slice(0, 20);
  if (!clean) return bad("Name is required");
  const quiz = await getQuiz(code);
  if (!quiz) return bad("Quiz not found", 404);

  const { data, error } = await serverSupabase()
    .from("players")
    .insert({ quiz_id: quiz.id, name: clean, budget_gbp: budgetGbp })
    .select("id")
    .single();
  if (error || !data) return bad(error?.message ?? "Could not join", 500);
  return Response.json({ playerId: data.id });
}
