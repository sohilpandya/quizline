import { z } from "zod";
import { grokJson } from "@/lib/grok";
import { rewardFor, type Bundle, type Item, type Player, type TraceStep } from "@/lib/game";

const BASKET_MODEL = process.env.XAI_BASKET_MODEL ?? process.env.XAI_MODEL ?? "grok-4.3";
const MAX_ATTEMPTS = 2;
const MAX_ITEMS = 4;

export type TagStats = Record<string, { right: number; wrong: number }>;

const ProposalSchema = z.object({
  steps: z.array(z.string().max(300)).min(1).max(6),
  paid_item_ids: z.array(z.string()).min(1).max(MAX_ITEMS),
  free_item_id: z.string().nullable(),
  message: z.string().max(400),
});
type Proposal = z.infer<typeof ProposalSchema>;

const round2 = (n: number) => Math.round(n * 100) / 100;
const price = (i: Item) => Number(i.price_gbp);

type Ctx = { artist: string; player: Player; rank: number; asked: number; tagStats: TagStats; catalog: Item[]; ticket: boolean };

/** Deterministic guardrails: the agent proposes, code decides whether the basket is allowed. */
function check(p: Proposal, ctx: Ctx, discount: number, freeCap: number) {
  const byId = new Map(ctx.catalog.map((i) => [i.id, i]));
  const violations: string[] = [];
  const paid = [...new Set(p.paid_item_ids)].map((id) => byId.get(id));
  if (paid.some((i) => !i)) violations.push("One or more paid_item_ids are not in the catalog.");
  const items = paid.filter((i): i is Item => !!i);
  const free = p.free_item_id ? byId.get(p.free_item_id) ?? null : null;
  if (p.free_item_id && !free) violations.push("free_item_id is not in the catalog.");
  if (free && freeCap <= 0) violations.push("This fan has not earned a free item; free_item_id must be null.");
  if (free && price(free) > freeCap) violations.push(`Free item costs £${price(free)} but the free allowance is £${freeCap}.`);
  if (free && items.some((i) => i.id === free.id)) violations.push("The free item cannot also be a paid item.");
  const subtotal = round2(items.reduce((s, i) => s + price(i), 0));
  const total = round2(subtotal * (1 - discount / 100));
  if (total > ctx.player.budget_gbp)
    violations.push(`Paid items cost £${total.toFixed(2)} after discount, over the fan's £${ctx.player.budget_gbp} budget.`);
  return { violations, items, free, subtotal, total };
}

function topTags(stats: TagStats, n = 2) {
  return Object.entries(stats)
    .filter(([, s]) => s.right > 0)
    .sort((a, b) => b[1].right - a[1].right || a[1].wrong - b[1].wrong)
    .slice(0, n)
    .map(([t]) => t);
}

export async function runBasketAgent(ctx: Ctx): Promise<Bundle> {
  const { player, rank, asked, tagStats, catalog } = ctx;
  const reward = rewardFor(player.correct, asked, rank);
  const trace: TraceStep[] = [
    {
      kind: "action",
      text: `${player.correct}/${asked} correct → ${reward.tier}: ${reward.discount_pct}% off${
        reward.free_cap_gbp ? ` + free item up to £${reward.free_cap_gbp}` : ""
      }. Budget £${player.budget_gbp}.`,
    },
  ];

  const system =
    `You are ${player.name}'s personal Basket agent inside Quizline, a trivia game fans play while waiting in a ticket queue for ${ctx.artist}. ` +
    "The fan's quiz answers tell you which eras and themes they love. Build them the merch basket they would actually want: favour tags they answered correctly, avoid tags they got wrong, vary categories, and make good use of their reward. " +
    "If got_tickets is false, the fan just missed out because tickets sold out: acknowledge it kindly in the message and make the basket a consolation they'll love. " +
    "Hard rules checked by code: the SUM of price_after_discount_gbp over paid items must be <= budget_gbp (add it up carefully); at most one free item and only if its price is within the free allowance; 1-4 paid items; only use ids from the catalog. " +
    'Reply as JSON: {"steps": string[] (2-4 short first-person reasoning steps, e.g. "You nailed every Purpose era question, so…"), "paid_item_ids": string[], "free_item_id": string|null, "message": string (2 warm sentences to the fan, second person, no emoji)}.';

  const input = JSON.stringify({
    artist: ctx.artist,
    fan: player.name,
    rank,
    got_tickets: ctx.ticket,
    quiz: { correct: player.correct, asked, by_tag: tagStats },
    reward: { tier: reward.tier, discount_pct: reward.discount_pct, free_item_allowance_gbp: reward.free_cap_gbp },
    budget_gbp: player.budget_gbp,
    catalog: catalog.map((i) => ({
      id: i.id,
      title: i.title,
      category: i.category,
      price_gbp: price(i),
      price_after_discount_gbp: round2(price(i) * (1 - reward.discount_pct / 100)),
      tags: i.tags,
    })),
  });

  let feedback = "";
  let last: Proposal | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const proposal = await grokJson(ProposalSchema, system, input + feedback, BASKET_MODEL);
    if (!proposal) break;
    if (attempt === 1) for (const s of proposal.steps.slice(0, 3)) trace.push({ kind: "think", text: s });

    const result = check(proposal, ctx, reward.discount_pct, reward.free_cap_gbp);
    if (result.violations.length === 0) {
      trace.push({
        kind: "action",
        text: `Basket approved: ${result.items.length} item${result.items.length > 1 ? "s" : ""}, £${result.total.toFixed(2)} of £${player.budget_gbp}${result.free ? `, free ${result.free.title}` : ""}.`,
      });
      return {
        rank,
        ...reward,
        budget_gbp: player.budget_gbp,
        correct: player.correct,
        asked,
        items: result.items,
        free_item: result.free,
        subtotal_gbp: result.subtotal,
        total_gbp: result.total,
        explanation: proposal.message,
        top_tags: topTags(tagStats),
        trace,
        source: "agent",
        ticket: ctx.ticket,
      };
    }
    trace.push({ kind: "guardrail", text: `Guardrail rejected draft ${attempt}: ${result.violations[0]}` });
    last = proposal;
    const over = round2(result.total - player.budget_gbp);
    feedback =
      `\n\nYour previous proposal ${JSON.stringify({ paid: proposal.paid_item_ids, free: proposal.free_item_id })} was rejected:\n- ${result.violations.join("\n- ")}` +
      (over > 0 ? `\nYou must cut at least £${over.toFixed(2)} of discounted price: drop or swap an item for a cheaper one.` : "") +
      "\nFix it and reply with a new JSON proposal.";
  }

  // Out of drafts: keep the agent's choices but let the guardrail trim the priciest items until it fits.
  if (last) {
    const byId = new Map(catalog.map((i) => [i.id, i]));
    const repaired: Proposal = {
      ...last,
      free_item_id:
        last.free_item_id && (byId.get(last.free_item_id)?.price_gbp ?? Infinity) <= reward.free_cap_gbp ? last.free_item_id : null,
      paid_item_ids: [...new Set(last.paid_item_ids)].filter((id) => byId.has(id) && id !== last!.free_item_id),
    };
    const removed: string[] = [];
    while (repaired.paid_item_ids.length > 1 && check(repaired, ctx, reward.discount_pct, reward.free_cap_gbp).violations.length) {
      const priciest = repaired.paid_item_ids.reduce((a, b) => (price(byId.get(a)!) >= price(byId.get(b)!) ? a : b));
      removed.push(byId.get(priciest)!.title);
      repaired.paid_item_ids = repaired.paid_item_ids.filter((id) => id !== priciest);
    }
    const result = check(repaired, ctx, reward.discount_pct, reward.free_cap_gbp);
    if (result.violations.length === 0) {
      trace.push({ kind: "guardrail", text: `Guardrail removed ${removed.join(", ")} to fit the £${player.budget_gbp} budget.` });
      trace.push({ kind: "action", text: `Basket approved: £${result.total.toFixed(2)} of £${player.budget_gbp}.` });
      return {
        rank,
        ...reward,
        budget_gbp: player.budget_gbp,
        correct: player.correct,
        asked,
        items: result.items,
        free_item: result.free,
        subtotal_gbp: result.subtotal,
        total_gbp: result.total,
        explanation: last.message,
        top_tags: topTags(tagStats),
        trace,
        source: "agent",
        ticket: ctx.ticket,
      };
    }
  }

  return fallbackBasket(ctx, reward, trace);
}

/** If Grok is unavailable, pick greedily by tag affinity within budget so the demo still completes. */
function fallbackBasket(ctx: Ctx, reward: ReturnType<typeof rewardFor>, trace: TraceStep[]): Bundle {
  const { player, rank, asked, tagStats, catalog } = ctx;
  const affinity = (i: Item) => i.tags.reduce((s, t) => s + (tagStats[t]?.right ?? 0) - 0.5 * (tagStats[t]?.wrong ?? 0), 0);
  const sorted = [...catalog].sort((a, b) => affinity(b) - affinity(a) || price(a) - price(b));
  const free = reward.free_cap_gbp > 0 ? sorted.find((i) => price(i) <= reward.free_cap_gbp) ?? null : null;
  const items: Item[] = [];
  const cats = new Set<string>();
  for (const i of sorted) {
    if (i.id === free?.id || cats.has(i.category)) continue;
    const next = round2([...items, i].reduce((s, x) => s + price(x), 0) * (1 - reward.discount_pct / 100));
    if (next > player.budget_gbp) continue;
    items.push(i);
    cats.add(i.category);
    if (items.length === 3) break;
  }
  const subtotal = round2(items.reduce((s, i) => s + price(i), 0));
  const tags = topTags(tagStats);
  trace.push({
    kind: "action",
    text: trace.some((t) => t.kind === "guardrail")
      ? "Agent couldn't fit the rules after 3 drafts, so guardrails fell back to rule-based picks within budget."
      : "Agent unavailable, used rule-based picks within budget.",
  });
  return {
    rank,
    ...reward,
    budget_gbp: player.budget_gbp,
    correct: player.correct,
    asked,
    items,
    free_item: free,
    subtotal_gbp: subtotal,
    total_gbp: round2(subtotal * (1 - reward.discount_pct / 100)),
    explanation: `You scored ${player.correct}/${asked}${tags.length ? ` and clearly know your ${tags.join(" and ")}` : ""}, so these picks match what you love, within your £${player.budget_gbp} budget.`,
    top_tags: tags,
    trace,
    source: "fallback",
    ticket: ctx.ticket,
  };
}
