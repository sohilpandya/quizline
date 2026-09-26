import { serverSupabase } from "./supabase";
import type { Quiz } from "./game";

export async function getQuiz(code: string) {
  const db = serverSupabase();
  const { data } = await db.from("quizzes").select("*").eq("code", code.toUpperCase()).single();
  return data as Quiz | null;
}

export async function log(quizId: string, agent: "quiz" | "merch" | "fan", summary: string) {
  await serverSupabase().from("agent_log").insert({ quiz_id: quizId, agent, summary });
}

export const bad = (msg: string, status = 400) => Response.json({ error: msg }, { status });
