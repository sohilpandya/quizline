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

/** ~30s per question (15s answer + reveal + breathing room), clamped for sanity. */
export function questionCountForWait(waitMinutes: number) {
  return Math.max(5, Math.min(30, Math.round((waitMinutes * 60) / 30)));
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
