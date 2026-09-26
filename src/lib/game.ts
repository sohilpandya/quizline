export const QUESTION_MS = 10_000;
export const REVEAL_MS = 3_000;
export const QUEUE_SIZE = 1_000;

export type Phase = "lobby" | "question" | "reveal" | "ended";

export type Quiz = {
  id: string;
  code: string;
  artist: string;
  wait_minutes: number;
  tags: string[];
  status: string;
  phase: Phase;
  current_index: number;
  question_count: number;
  phase_ends_at: string | null;
  source: string;
};

export type PublicQuestion = {
  idx: number;
  prompt: string;
  options: string[];
  difficulty: number;
  tags: string[];
  answer_index?: number; // only present during reveal / ended
};

export type Item = {
  id: string;
  title: string;
  category: string;
  description: string;
  price_gbp: number;
  emoji: string;
  tags: string[];
};

export type TraceStep = { kind: "think" | "guardrail" | "action"; text: string };

export type Bundle = {
  rank: number;
  tier: string;
  discount_pct: number;
  free_cap_gbp: number;
  budget_gbp: number;
  correct: number;
  asked: number;
  items: Item[];
  free_item: Item | null;
  subtotal_gbp: number;
  total_gbp: number;
  explanation: string;
  top_tags: string[];
  trace: TraceStep[];
  source: "agent" | "fallback";
  pending?: boolean;
  ticket: boolean;
};

export type Player = {
  id: string;
  name: string;
  score: number;
  correct: number;
  profile: Record<string, number>;
  bundle: Bundle | null;
  budget_gbp: number;
};

/** One question per answer window + reveal across the wait, clamped for sanity. */
export function questionCountForWait(waitMinutes: number) {
  return Math.max(5, Math.min(30, Math.round((waitMinutes * 60 * 1000) / (QUESTION_MS + REVEAL_MS))));
}

/** Fake queue: each fan starts somewhere in a 1,000-person queue and moves forward with every question. */
export function startPosition(playerId: string) {
  let h = 0;
  for (const c of playerId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return QUEUE_SIZE - 350 + (h % 350);
}

/** Only about half the room can get tickets: first to the front wins, the rest hit "sold out". */
export const TICKET_SHARE = 0.5;
export function ticketCapacity(players: number) {
  return Math.max(1, Math.ceil(players * TICKET_SHARE));
}

export function queuePosition(playerId: string, quiz: Pick<Quiz, "phase" | "current_index" | "question_count">) {
  if (quiz.phase === "ended") return 0;
  const start = startPosition(playerId);
  const done = quiz.phase === "lobby" ? 0 : quiz.current_index + (quiz.phase === "reveal" ? 1 : 0);
  return Math.max(1, Math.round(start * (1 - done / quiz.question_count)));
}

export function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export type Reward = { tier: string; discount_pct: number; free_cap_gbp: number };

/** The quiz earns the reward: accuracy sets the discount and free-item allowance, #1 gets a bonus. */
export function rewardFor(correct: number, asked: number, rank: number): Reward {
  const acc = asked > 0 ? correct / asked : 0;
  let r: Reward =
    acc >= 0.8
      ? { tier: "Superfan", discount_pct: 30, free_cap_gbp: 30 }
      : acc >= 0.6
        ? { tier: "Gold", discount_pct: 20, free_cap_gbp: 15 }
        : acc >= 0.3
          ? { tier: "Silver", discount_pct: 15, free_cap_gbp: 0 }
          : { tier: "Fan", discount_pct: 10, free_cap_gbp: 0 };
  if (rank === 1 && correct > 0) r = { ...r, tier: `${r.tier} · #1 in queue`, free_cap_gbp: r.free_cap_gbp + 20 };
  return r;
}
