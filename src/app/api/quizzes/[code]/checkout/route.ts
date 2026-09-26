import { bad, getQuiz, log } from "@/lib/api";
import { TICKET_PRICE_GBP, type Bundle } from "@/lib/game";
import { serverSupabase } from "@/lib/supabase";

// The fan's own decision on their agent's suggestions: tickets are never conditional on merch.
export async function POST(req: Request, ctx: RouteContext<"/api/quizzes/[code]/checkout">) {
  const { code } = await ctx.params;
  const { playerId, itemIds, freeItem } = await req.json().catch(() => ({}));
  const quiz = await getQuiz(code);
  if (!quiz) return bad("Quiz not found", 404);

  const db = serverSupabase();
  const { data: player } = await db.from("players").select("name,bundle").eq("id", playerId).eq("quiz_id", quiz.id).single();
  if (!player) return bad("Unknown player", 404);
  const b = player.bundle as Bundle | null;
  if (!b) return bad("Nothing to check out", 409);

  const chosen = (b.items ?? []).filter((i) => (itemIds ?? []).includes(i.id));
  const merch = Math.round(chosen.reduce((s, i) => s + Number(i.price_gbp), 0) * (1 - (b.discount_pct ?? 0) / 100) * 100) / 100;
  const gift = freeItem && b.free_item ? b.free_item : null;
  const total = (b.ticket ? TICKET_PRICE_GBP : 0) + merch;
  const order = { ticket: b.ticket, items: chosen.map((i) => i.id), free_item: gift?.id ?? null, total_gbp: total, at: new Date().toISOString() };
  await db.from("players").update({ bundle: { ...b, order } }).eq("id", playerId);

  const skipped = (b.items?.length ?? 0) - chosen.length;
  const parts = [
    b.ticket ? "tickets" : null,
    gift ? `free ${gift.title}` : null,
    chosen.length ? `${chosen.length} merch item${chosen.length > 1 ? "s" : ""}` : null,
  ].filter(Boolean);
  await log(
    quiz.id,
    "fan",
    parts.length
      ? `🛒 ${player.name} bought ${parts.join(" + ")} (£${total.toFixed(2)})${skipped ? `, skipped ${skipped} suggestion${skipped > 1 ? "s" : ""}` : ""}.`
      : `${player.name} declined the basket.`,
  );
  return Response.json({ ok: true, total });
}
