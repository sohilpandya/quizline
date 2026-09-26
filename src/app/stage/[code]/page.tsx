"use client";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { AgentBadge, Logo, OPTION_STYLES, TimerBar } from "@/components/ui";
import { QUESTION_MS, REVEAL_MS } from "@/lib/game";
import { useAgentLog, useCountdown, usePlayers, useQuizState } from "@/lib/hooks";

export default function Stage() {
  const { code } = useParams<{ code: string }>();
  const { state, error, refresh, skew } = useQuizState(code);
  const quiz = state?.quiz;
  const players = usePlayers(quiz?.id);
  const log = useAgentLog(quiz?.id);
  const left = useCountdown(quiz?.phase_ends_at, skew);
  const [joinUrl, setJoinUrl] = useState("");
  const [ending, setEnding] = useState(false);
  const advancing = useRef("");

  useEffect(() => setJoinUrl(`${window.location.origin}/play/${code}`), [code]);

  async function advance() {
    if (!quiz) return;
    const key = `${quiz.phase}:${quiz.current_index}`;
    if (advancing.current === key) return;
    advancing.current = key;
    await fetch(`/api/quizzes/${code}/advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase: quiz.phase, index: quiz.current_index }),
    });
    refresh();
  }

  async function end() {
    setEnding(true);
    await fetch(`/api/quizzes/${code}/end`, { method: "POST" });
    refresh();
  }

  // The stage drives the clock: advance when time runs out, or early when everyone has answered.
  // Reads the deadline directly (not the rendered countdown) so a stale 0 never skips a question.
  const everyoneAnswered = quiz?.phase === "question" && players.length > 0 && (state?.answered ?? 0) >= players.length;
  useEffect(() => {
    if (!quiz?.phase_ends_at || (quiz.phase !== "question" && quiz.phase !== "reveal")) return;
    const end = new Date(quiz.phase_ends_at).getTime();
    const check = () => {
      const remaining = end - (Date.now() + skew);
      if (remaining <= 0) advance();
      else if (everyoneAnswered && remaining < QUESTION_MS - 2000) advance();
    };
    check();
    const t = setInterval(check, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz?.phase, quiz?.current_index, quiz?.phase_ends_at, everyoneAnswered, skew]);

  if (error) return <Center>{error}</Center>;
  if (!state || !quiz) return <Center>Loading…</Center>;

  const q = state.question;

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
            {(quiz.phase === "question" || quiz.phase === "reveal") && (
              <>
                <button onClick={advance} className="rounded-xl bg-white/10 px-4 py-2 font-semibold hover:bg-white/20">
                  Skip ›
                </button>
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

        {(quiz.phase === "question" || quiz.phase === "reveal") && q && (
          <div className="flex flex-1 flex-col gap-6">
            <div className="flex items-center justify-between text-violet-200">
              <span className="text-xl">
                Question {q.idx + 1} / {quiz.question_count}
                <span className="ml-3 text-sm text-violet-300/70">{q.tags.join(" · ")}</span>
              </span>
              <span className="text-xl">
                {quiz.phase === "question" ? `${state.answered} / ${players.length} answered` : "Answer"}
              </span>
            </div>
            <TimerBar left={left} total={(quiz.phase === "question" ? QUESTION_MS : REVEAL_MS) / 1000} />
            <h2 key={q.idx} className="animate-pop text-4xl font-bold leading-tight lg:text-5xl">
              {q.prompt}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {q.options.map((opt, i) => {
                const reveal = quiz.phase === "reveal";
                const correct = reveal && q.answer_index === i;
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-4 rounded-2xl p-6 text-2xl font-semibold transition ${OPTION_STYLES[i].bg} ${
                      reveal && !correct ? "opacity-30" : ""
                    } ${correct ? "ring-4 ring-white" : ""}`}
                  >
                    <span className="text-3xl">{OPTION_STYLES[i].shape}</span>
                    <span className="flex-1">{opt}</span>
                    {reveal && state.distribution && <span className="font-mono">{state.distribution[i]}</span>}
                  </div>
                );
              })}
            </div>
            {quiz.phase === "question" && (
              <div className="text-center font-mono text-6xl font-black tabular-nums">{Math.ceil(left)}</div>
            )}
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
                  <div className="text-violet-300">{p.score} pts</div>
                  {p.bundle ? (
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
