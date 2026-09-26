"use client";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { AgentBadge, Logo } from "@/components/ui";
import { useAgentLog, usePlayers, useQuizState } from "@/lib/hooks";

export default function Stage() {
  const { code } = useParams<{ code: string }>();
  const { state, error, refresh } = useQuizState(code);
  const quiz = state?.quiz;
  const players = usePlayers(quiz?.id);
  const log = useAgentLog(quiz?.id);
  const [joinUrl, setJoinUrl] = useState("");
  const [ending, setEnding] = useState(false);

  useEffect(() => setJoinUrl(`${window.location.origin}/play/${code}`), [code]);

  async function advance() {
    await fetch(`/api/quizzes/${code}/advance`, { method: "POST" });
    refresh();
  }

  async function end() {
    setEnding(true);
    await fetch(`/api/quizzes/${code}/end`, { method: "POST" });
    refresh();
  }

  if (error) return <Center>{error}</Center>;
  if (!state || !quiz) return <Center>Loading…</Center>;

  const progress = state.progress;
  const baskets = players.filter((p) => p.bundle && !p.bundle.pending);

  return (
    <main className="grid min-h-dvh grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_380px] lg:p-10">
      <section className="flex flex-col gap-6">
        <header className="flex items-center justify-between">
          <div className="flex items-baseline gap-4">
            <Logo className="text-3xl" />
            <span className="text-xl text-violet-200/80">
              {quiz.artist} · {quiz.wait_minutes} min queue
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-white/10 px-3 py-1 font-mono text-lg">{code}</span>
            {quiz.phase === "lobby" && (
              <button onClick={advance} className="rounded-xl bg-fuchsia-500 px-5 py-2 font-bold hover:bg-fuchsia-400">
                Start quiz
              </button>
            )}
            {quiz.phase === "question" && (
              <>
                <button
                  onClick={end}
                  disabled={ending}
                  className="rounded-xl bg-emerald-500 px-4 py-2 font-bold hover:bg-emerald-400 disabled:opacity-60"
                >
                  {ending ? "Agents shopping…" : "Reach front of queue"}
                </button>
              </>
            )}
          </div>
        </header>

        {quiz.phase === "lobby" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
            <h1 className="text-5xl font-black">You&apos;re in the queue. Let&apos;s play.</h1>
            <div className="rounded-3xl bg-white p-5">
              {joinUrl && <QRCodeSVG value={joinUrl} size={300} />}
            </div>
            <p className="text-2xl text-violet-200">
              Scan or go to <span className="font-mono text-white">{joinUrl.replace(/^https?:\/\//, "")}</span>
            </p>
            <p className="text-lg text-violet-300/80">
              {quiz.question_count} questions about {quiz.artist} · {players.length} fans joined
            </p>
            <div className="flex max-w-3xl flex-wrap justify-center gap-2">
              {players.map((p) => (
                <span key={p.id} className="animate-pop rounded-full bg-white/10 px-4 py-1.5 text-lg">
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {quiz.phase === "question" && (
          <div className="flex flex-1 flex-col gap-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-4xl font-black">Live in the queue</h2>
              <span className="text-xl text-violet-200">
                🎟️ {Math.max(0, state.tickets.capacity - state.tickets.sold)} / {state.tickets.capacity} tickets left ·{" "}
                {state.answered} answers · {baskets.length} baskets
              </span>
            </div>
            <div className="grid gap-3">
              {players.slice(0, 10).map((p, i) => {
                const done = progress[p.id] ?? 0;
                const pct = (done / quiz.question_count) * 100;
                const b = p.bundle && !p.bundle.pending ? p.bundle : null;
                return (
                  <div key={p.id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-3">
                    <span className="w-8 text-2xl font-black text-violet-300">{i + 1}</span>
                    <span className="w-40 truncate text-xl font-semibold">{p.name}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-fuchsia-400 transition-[width] duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-28 text-right font-mono text-lg tabular-nums">
                      {p.correct}/{done} ✓
                    </span>
                    <span className="w-24 text-right font-mono text-xl font-bold tabular-nums">{p.score}</span>
                    <span className="w-44 truncate text-right text-sm">
                      {b ? (
                        <span className={b.ticket ? "text-emerald-300" : "text-rose-300"}>
                          {b.ticket ? "🎟️" : "❌ sold out"} · 🛍️ £{b.total_gbp.toFixed(2)}
                        </span>
                      ) : p.bundle?.pending ? (
                        <span className={p.bundle.ticket ? "text-emerald-300" : "text-rose-300"}>
                          {p.bundle.ticket ? "🎟️ Got tickets" : "❌ Sold out"} · agent shopping…
                        </span>
                      ) : (
                        <span className="text-violet-300/60">in queue</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {quiz.phase === "ended" && (
          <div className="flex flex-1 flex-col gap-6">
            <h1 className="text-5xl font-black">You reached the front of the queue 🎟️</h1>
            <p className="text-xl text-violet-200">Every fan&apos;s Basket agent just built them a personalised basket from how they played.</p>
            <div className="grid gap-4 md:grid-cols-3">
              {players.slice(0, 3).map((p, i) => (
                <div key={p.id} className="animate-pop rounded-3xl border border-white/10 bg-white/5 p-5">
                  <div className="text-4xl">{["🥇", "🥈", "🥉"][i]}</div>
                  <div className="mt-2 text-2xl font-bold">{p.name}</div>
                  <div className="text-violet-300">
                    {p.score} pts · {p.bundle?.ticket ? "🎟️ got tickets" : p.bundle ? "❌ sold out" : ""}
                  </div>
                  {p.bundle && !p.bundle.pending ? (
                    <div className="mt-4 flex flex-col gap-2">
                      {p.bundle.free_item && (
                        <div className="flex items-center gap-2 text-sm text-emerald-300">
                          <span className="text-xl">{p.bundle.free_item.emoji}</span>
                          <span className="flex-1">{p.bundle.free_item.title}</span>
                          <span>FREE</span>
                        </div>
                      )}
                      {p.bundle.items.map((it) => (
                        <div key={it.id} className="flex items-center gap-2 text-sm">
                          <span className="text-xl">{it.emoji}</span>
                          <span className="flex-1">{it.title}</span>
                        </div>
                      ))}
                      <div className="mt-2 text-sm text-emerald-300">
                        {p.bundle.correct}/{p.bundle.asked} correct · {p.bundle.tier} · £{p.bundle.total_gbp.toFixed(2)} of £{p.bundle.budget_gbp}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 text-sm text-violet-300/70">Fan agent is building…</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <aside className="flex flex-col gap-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-violet-300">Leaderboard</h3>
          <ol className="flex flex-col gap-2">
            {players.slice(0, 8).map((p, i) => (
              <li key={p.id} className="flex items-center gap-3 text-lg">
                <span className="w-6 text-violet-300">{i + 1}</span>
                <span className="flex-1 truncate">{p.name}</span>
                <span className="font-mono tabular-nums">{p.score}</span>
              </li>
            ))}
            {players.length === 0 && <li className="text-violet-300/70">Waiting for fans…</li>}
          </ol>
        </div>
        <div className="flex min-h-0 flex-1 flex-col rounded-3xl border border-white/10 bg-white/5 p-5">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-violet-300">Agent activity</h3>
          <ul className="flex flex-col gap-3 overflow-y-auto">
            {log.map((e) => (
              <li key={e.id} className="animate-pop flex flex-col gap-1 text-sm">
                <AgentBadge agent={e.agent} />
                <span className="text-violet-100/90">{e.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </main>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh items-center justify-center text-2xl">{children}</main>;
}
