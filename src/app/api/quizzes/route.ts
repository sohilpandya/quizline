import { generateQuiz } from "@/agents/quizMaster";
import { bad, log } from "@/lib/api";
import { makeCode, questionCountForWait } from "@/lib/game";
import { serverSupabase } from "@/lib/supabase";

export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const artist = String(body.artist ?? "").trim().slice(0, 60);
  const waitMinutes = Math.max(1, Math.min(60, Number(body.waitMinutes) || 1));
  if (!artist) return bad("Artist is required");

  const count = questionCountForWait(waitMinutes);
  const db = serverSupabase();

  if (!body.fresh) {
    const cached = await fromCache(artist, waitMinutes);
    if (cached) return Response.json({ code: cached, cached: true });
  }

  const started = Date.now();
  const gen = await generateQuiz(artist, count);
  const displayArtist = gen.source === "fallback" ? "Nova Rae" : artist;

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

/** Reuse the richest earlier Grok-generated quiz for the same subject: no LLM calls, no credits. */
async function fromCache(artist: string, waitMinutes: number) {
  const db = serverSupabase();
  const { data: sources } = await db
    .from("quizzes")
    .select("id,artist,tags,question_count")
    .ilike("artist", artist)
    .eq("source", "grok")
    .order("question_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  const src = sources?.[0];
  if (!src) return null;

  const [{ data: questions }, { data: items }] = await Promise.all([
    db.from("questions").select("prompt,options,answer_index,difficulty,tags,idx").eq("quiz_id", src.id).order("idx"),
    db.from("items").select("title,category,description,price_gbp,emoji,tags").eq("quiz_id", src.id),
  ]);
  if (!questions?.length || !items?.length) return null;

  const { data: quiz, error } = await db
    .from("quizzes")
    .insert({
      code: makeCode(),
      artist: src.artist,
      wait_minutes: waitMinutes,
      tags: src.tags,
      question_count: questions.length,
      source: "grok",
    })
    .select()
    .single();
  if (error || !quiz) return null;

  await Promise.all([
    db.from("questions").insert(questions.map((q, idx) => ({ ...q, idx, quiz_id: quiz.id }))),
    db.from("items").insert(items.map((i) => ({ ...i, quiz_id: quiz.id }))),
  ]);
  await log(
    quiz.id,
    "quiz",
    `Loaded ${questions.length} researched questions and ${items.length} catalog items about ${src.artist} from the cache (no new Grok calls).`,
  );
  return quiz.code as string;
}
