import { z } from "zod";
import { grokJson } from "@/lib/grok";
import { FALLBACK_QUESTIONS, FALLBACK_TAGS, fallbackCatalog } from "./fallback";

const TagsSchema = z.object({ tags: z.array(z.string().min(2).max(40)).min(4).max(10) });

const QuestionSchema = z.object({
  prompt: z.string().min(5).max(200),
  options: z.array(z.string().min(1).max(80)).length(4),
  answer_index: z.number().int().min(0).max(3),
  difficulty: z.number().int().min(1).max(3),
  tags: z.array(z.string()).min(1).max(3),
});
const QuizSchema = z.object({ questions: z.array(QuestionSchema).min(3) });

const ItemSchema = z.object({
  title: z.string().min(3).max(80),
  category: z.string().min(2).max(30),
  description: z.string().max(160),
  price_gbp: z.number().min(3).max(300),
  emoji: z.string().max(8),
  tags: z.array(z.string()).min(1).max(3),
});
const CatalogSchema = z.object({ items: z.array(ItemSchema).min(20) });

export type GeneratedQuiz = {
  tags: string[];
  questions: z.infer<typeof QuestionSchema>[];
  items: z.infer<typeof ItemSchema>[];
  source: "grok" | "fallback";
};

const SYSTEM =
  "You are the Quiz Master agent for Quizline, a live trivia game that runs inside online ticket queues for music fans. " +
  "You only use well-known, verifiable facts you are highly confident about. Keep questions fun, short and readable on a phone.";

function shuffleOptions<T extends { options: string[]; answer_index: number }>(q: T): T {
  const correct = q.options[q.answer_index];
  const options = [...q.options].sort(() => Math.random() - 0.5);
  return { ...q, options, answer_index: options.indexOf(correct) };
}

function keepKnownTags(tags: string[], vocab: string[]) {
  const lower = new Map(vocab.map((t) => [t.toLowerCase(), t]));
  const kept = tags.map((t) => lower.get(t.toLowerCase())).filter((t): t is string => !!t);
  return kept.length ? kept : [vocab[0]];
}

export async function generateQuiz(artist: string, count: number): Promise<GeneratedQuiz> {
  const tagResult = await grokJson(
    TagsSchema,
    SYSTEM,
    `Artist: ${artist}\nList 6-8 short fan-facing "affinity tags" that segment this artist's fandom, mostly albums/eras (e.g. "Purpose era"), plus themes like "Live shows", "Early days", "Collabs". JSON: {"tags": string[]}`,
  );

  if (!tagResult) return fallback(artist, count);
  const vocab = tagResult.tags;

  const [quiz, catalog] = await Promise.all([
    grokJson(
      QuizSchema,
      SYSTEM,
      `Artist: ${artist}\nWrite ${count} multiple-choice trivia questions, ordered from easy to hard (difficulty 1-3).\n` +
        `Each has exactly 4 options and one correct answer_index (0-3). Tag each question with 1-2 tags chosen ONLY from: ${JSON.stringify(vocab)}.\n` +
        `Cover a spread of the tags. JSON: {"questions":[{"prompt","options","answer_index","difficulty","tags"}]}`,
    ),
    grokJson(
      CatalogSchema,
      SYSTEM +
        " You also act as the merchandiser, designing a mock merch catalog. Items are fictional mock products for a demo.",
      `Artist: ${artist}\nDesign 40 mock merch items for the tour store: tees, hoodies, caps, posters, vinyl, tote bags, pins, lanyards, phone cases, bucket hats, etc.\n` +
        `Each item title references this artist's OWN songs, albums, tours or lyrics (never other artists' songs), and a specific era/album/theme and has 1-2 tags chosen ONLY from: ${JSON.stringify(vocab)}. Cover every tag with several items.\n` +
        `Realistic GBP prices (£8-£90). One emoji per item. JSON: {"items":[{"title","category","description","price_gbp","emoji","tags"}]}`,
    ),
  ]);

  if (!quiz) return fallback(artist, count);

  return {
    tags: vocab,
    questions: quiz.questions.slice(0, count).map((q) => shuffleOptions({ ...q, tags: keepKnownTags(q.tags, vocab) })),
    items: (catalog?.items ?? fallbackCatalog(artist, vocab)).slice(0, 50).map((i) => ({ ...i, tags: keepKnownTags(i.tags, vocab) })),
    source: "grok",
  };
}

function fallback(artist: string, count: number): GeneratedQuiz {
  return {
    tags: FALLBACK_TAGS,
    questions: FALLBACK_QUESTIONS.slice(0, count).map(shuffleOptions),
    items: fallbackCatalog("Nova Rae", FALLBACK_TAGS),
    source: "fallback",
  };
}
