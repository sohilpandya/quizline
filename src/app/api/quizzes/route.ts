import { generateQuiz } from "@/agents/quizMaster";
import { bad, log } from "@/lib/api";
import { makeCode, questionCountForWait } from "@/lib/game";
import { serverSupabase } from "@/lib/supabase";

export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const artist = String(body.artist ?? "").trim().slice(0, 60);
  const waitMinutes = Math.max(2, Math.min(60, Number(body.waitMinutes) || 10));
  if (!artist) return bad("Artist is required");

  const count = questionCountForWait(waitMinutes);
  const started = Date.now();
  const gen = await generateQuiz(artist, count);
  const displayArtist = gen.source === "fallback" ? "Nova Rae" : artist;

  const db = serverSupabase();
  const { data: quiz, error } = await db
    .from("quizzes")
    .insert({
      code: makeCode(),
      artist: displayArtist,
      wait_minutes: waitMinutes,
      tags: gen.tags,
      question_count: gen.questions.length,
      source: gen.source,
    })
    .select()
    .single();
  if (error || !quiz) return bad(error?.message ?? "Could not create quiz", 500);

  await Promise.all([
    db.from("questions").insert(gen.questions.map((q, idx) => ({ ...q, idx, quiz_id: quiz.id }))),
    db.from("items").insert(gen.items.map((i) => ({ ...i, quiz_id: quiz.id }))),
  ]);

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (gen.source === "fallback") {
    await log(quiz.id, "quiz", `Grok was unavailable, so I loaded the Nova Rae demo quiz instead of ${artist}.`);
  } else {
    if (gen.researched) await log(quiz.id, "quiz", `Searched the live web for the latest on ${artist} (lineup, releases, tours) before writing questions.`);
    await log(
      quiz.id,
      "quiz",
      `Generated ${gen.questions.length} questions about ${artist} for a ${waitMinutes}-minute wait in ${secs}s, tagged by ${gen.tags.join(", ")}.`,
    );
    await log(quiz.id, "merch", `Designed a ${gen.items.length}-item mock merch catalog mapped to the same fan tags.`);
  }

  return Response.json({ code: quiz.code });
}
