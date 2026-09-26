# Map: Quizline hackathon MVP

Label: wayfinder:map

## Destination

A deployed, public URL by 16:00 on 26 Sep 2026 where a host types any artist (e.g. "Justin Bieber") and a wait time (e.g. 10 min), Grok generates a quiz sized to that wait plus a mocked 30–50 item merch catalog, the room joins by QR and plays live with a realtime leaderboard, and when the quiz ends every player gets a personalised bundle from that catalog with an agent-written explanation.

## Notes

- Hackathon: Grok Bot Commerce London, code freeze 16:30, top-5 demo 3 min. Source brief: ~/Downloads/QUEUE_QUEST_BRIEF.md (product renamed Quizline).
- **Override: execution is carried on this map.** Time left at charting (12:15) is ~4h, so tickets are build slices, not decisions. User said "just go ahead": recommended answers are accepted.
- Stack: Next.js App Router + TS + Tailwind, Supabase (Postgres + Realtime), xAI Grok via OpenAI-compatible fetch, Vercel.
- Guardrail: every LLM output is zod-validated, retried once, then falls back to a seeded fictional-artist quiz/catalog (Nova Rae) so the demo never breaks.

## Decisions so far

- [Destination](map.md): live room quiz + personalised mock bundle is the must-land demo; real Shopify, Merch agent approvals and Fan-agent auto-buy are cut.
- [Quiz sizing](map.md): question count = wait_seconds / 30 (10 min → 20 questions); 15s answer window + 5s reveal; host can end early for the 3-min demo.
- [Catalog](map.md): Grok generates 40 mock items per quiz (title, category, price £, era/album tags, emoji) stored in Supabase; no real Shopify.
- [Reward ladder](map.md): accuracy sets the tier in code (≥80% Superfan 30% + free ≤£30; ≥60% Gold 20% + free ≤£15; ≥30% Silver 15%; else Fan 10%); #1 gets +£20 free allowance.
- [Basket agent](map.md): per fan, grok-4.3 gets per-tag right/wrong, the reward, a budget the fan chose on join (£30/60/100) and the catalog; it proposes a basket, code guardrails validate (budget, free cap, ids); it gets 2 drafts, then the guardrail trims the priciest item. Trace shown on phone + stage log. Replaces the deterministic bundle.
- [Product framing](map.md): B2B2C: queue platforms embed Quizline as an iframe; `/queue/[code]` is a fictional "tixqueue" waiting room demonstrating it.
- [Identity](map.md): no auth; player id in localStorage, all writes via server routes with service role, clients read + subscribe with anon key.

## Not yet specified

- Queue flavour: whether to show a simulated ticket-queue position / fake host page (brief P1 `/host-embed-demo`) — only if build lands early.
- Merch agent flash drops mid-quiz (merchant side of agent-to-agent commerce): only if time after 15:00.

## Out of scope

- Real Shopify discounts, carts and draft orders — user: goods need not be real for this MVP.
- Merch agent offer proposals + merchant approval console — not in user's must-land demo.
- Wassist WhatsApp, Grok Bot admin clip, quiz boost.
