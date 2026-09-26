import { grokText } from "@/lib/grok";
import { tierForRank, type Bundle, type Item, type Player } from "@/lib/game";

const BUNDLE_SIZE = 3;

function topTags(profile: Record<string, number>, n = 2) {
  return Object.entries(profile)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([t]) => t);
}

/** Deterministic pick: highest tag-affinity items, one per category, so bundles feel varied. */
export function pickItems(profile: Record<string, number>, catalog: Item[]): Item[] {
  const scored = catalog
    .map((item) => ({
      item,
      score: item.tags.reduce((s, t) => s + (profile[t] ?? 0), 0) + Math.random() * 0.5,
    }))
    .sort((a, b) => b.score - a.score);

  const picked: Item[] = [];
  const categories = new Set<string>();
  for (const { item } of scored) {
    if (categories.has(item.category.toLowerCase())) continue;
    picked.push(item);
    categories.add(item.category.toLowerCase());
    if (picked.length === BUNDLE_SIZE) break;
  }
  return picked;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function buildBundle(artist: string, player: Player, rank: number, catalog: Item[]): Promise<Bundle> {
  const { tier, discount_pct } = tierForRank(rank);
  const items = pickItems(player.profile, catalog);
  const subtotal = round2(items.reduce((s, i) => s + Number(i.price_gbp), 0));
  const total = round2(subtotal * (1 - discount_pct / 100));
  const tags = topTags(player.profile);

  const explanation =
    (await grokText(
      "You are the player's personal Fan agent in Quizline. You just built them a merch bundle based on how they played a trivia quiz while waiting in a ticket queue. " +
        "Write 2 short, warm sentences in second person explaining why these items suit them and the reward they earned. No hashtags, no emoji, under 50 words.",
      JSON.stringify({
        artist,
        player: player.name,
        rank,
        tier,
        discount_pct,
        correct_answers: player.correct,
        strongest_tags: tags,
        items: items.map((i) => ({ title: i.title, tags: i.tags, price_gbp: i.price_gbp })),
      }),
    )) ??
    `You finished #${rank}${tags.length ? ` and you clearly know your ${tags.join(" and ")}` : ""}, so I picked these to match. Your ${tier} reward takes ${discount_pct}% off the bundle.`;

  return { rank, tier, discount_pct, items, subtotal_gbp: subtotal, total_gbp: total, explanation, top_tags: tags };
}
