export const QUESTION_MS = 15_000;
export const REVEAL_MS = 6_000;

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

export type Bundle = {
  rank: number;
  tier: string;
  discount_pct: number;
  items: Item[];
  subtotal_gbp: number;
  total_gbp: number;
  explanation: string;
  top_tags: string[];
};

export type Player = {
  id: string;
  name: string;
  score: number;
  correct: number;
  profile: Record<string, number>;
  bundle: Bundle | null;
};

/** ~30s per question (15s answer + reveal + breathing room), clamped for sanity. */
export function questionCountForWait(waitMinutes: number) {
  return Math.max(5, Math.min(30, Math.round((waitMinutes * 60) / 30)));
}

export function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export function tierForRank(rank: number): { tier: string; discount_pct: number } {
  if (rank === 1) return { tier: "Gold · #1 fan", discount_pct: 30 };
  if (rank <= 3) return { tier: "Silver · top 3", discount_pct: 20 };
  if (rank <= 10) return { tier: "Bronze · top 10", discount_pct: 15 };
  return { tier: "Fan", discount_pct: 10 };
}
