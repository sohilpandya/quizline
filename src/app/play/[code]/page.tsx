"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo, OPTION_STYLES, TimerBar } from "@/components/ui";
import { QUESTION_MS } from "@/lib/game";
import { useCountdown, usePlayers, useQuizState } from "@/lib/hooks";

function storageGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export default function Play() {
  const { code } = useParams<{ code: string }>();
  const key = `quizline:${code.toUpperCase()}`;
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [choices, setChoices] = useState<Record<number, number>>({});
  const { state, error, skew } = useQuizState(code);
  const quiz = state?.quiz;
  const players = usePlayers(quiz?.id);
  const left = useCountdown(quiz?.phase_ends_at, skew);

  useEffect(() => setPlayerId(storageGet(key)), [key]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setJoining(true);
    const res = await fetch(`/api/quizzes/${code}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setJoining(false);
    if (res.ok) {
      storageSet(key, data.playerId);
      setPlayerId(data.playerId);
    }
  }

  async function answer(choice: number) {
    if (!quiz || choices[quiz.current_index] !== undefined) return;
    const idx = quiz.current_index;
    setChoices((c) => ({ ...c, [idx]: choice }));
    await fetch(`/api/quizzes/${code}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, choice, questionIdx: idx }),
    });
  }

  if (error) return <Shell>{error}</Shell>;
  if (!state || !quiz) return <Shell>Loading…</Shell>;

  const meIndex = players.findIndex((p) => p.id === playerId);
  const me = meIndex >= 0 ? players[meIndex] : null;

  if (!playerId) {
    return (
      <Shell>
        <form onSubmit={join} className="flex w-full flex-col gap-4">
          <p className="text-center text-violet-200">
            The {quiz.artist} quiz · {quiz.wait_minutes} min queue
          </p>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={20}
            className="rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-center text-2xl outline-none focus:border-fuchsia-400"
          />
          <button
            disabled={joining || !name.trim()}
            className="rounded-2xl bg-fuchsia-500 py-4 text-xl font-bold disabled:opacity-60"
          >
            {joining ? "Joining…" : "Join the queue game"}
          </button>
        </form>
      </Shell>
    );
  }

  const header = (
    <div className="flex w-full items-center justify-between text-sm text-violet-200">
      <span className="font-semibold">{me?.name}</span>
      <span>
        {me ? `#${meIndex + 1} · ${me.score} pts` : ""}
      </span>
    </div>
  );

  if (quiz.phase === "lobby") {
    return (
      <Shell>
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="text-5xl">🎟️</div>
          <p className="text-2xl font-bold">You&apos;re in!</p>
          <p className="text-violet-200">Waiting for the quiz to start. {players.length} fans here.</p>
        </div>
      </Shell>
    );
  }

  if (quiz.phase === "ended") {
    const b = me?.bundle;
    return (
      <Shell>
        {header}
        <div className="flex w-full flex-col gap-4">
          <div className="text-center">
            <p className="text-sm uppercase tracking-wider text-emerald-300">You reached the front of the queue</p>
            <p className="mt-1 text-4xl font-black">#{meIndex + 1}</p>
            <p className="text-violet-200">{me?.correct ?? 0} correct · {me?.score ?? 0} pts</p>
          </div>
          {b ? (
            <div className="animate-pop flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between">
                <span className="font-bold">Your Fan agent&apos;s bundle</span>
                <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">
                  {b.tier}
                </span>
              </div>
              <p className="text-sm text-violet-100/90">{b.explanation}</p>
              <ul className="flex flex-col gap-3">
                {b.items.map((it) => (
                  <li key={it.id} className="flex items-center gap-3 rounded-2xl bg-black/20 p-3">
                    <span className="text-3xl">{it.emoji}</span>
                    <span className="flex-1">
                      <span className="block font-semibold leading-tight">{it.title}</span>
                      <span className="text-xs text-violet-300">{it.tags.join(" · ")}</span>
                    </span>
                    <span className="font-mono">£{Number(it.price_gbp).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-end justify-between border-t border-white/10 pt-3">
                <span className="text-sm text-violet-300">
                  <s>£{b.subtotal_gbp.toFixed(2)}</s> · {b.discount_pct}% off
                </span>
                <span className="text-3xl font-black">£{b.total_gbp.toFixed(2)}</span>
              </div>
              <button
                onClick={() => setClaimed(true)}
                className="rounded-2xl bg-emerald-500 py-4 text-lg font-bold disabled:opacity-80"
                disabled={claimed}
              >
                {claimed ? "✓ Added to your ticket order" : "Claim bundle with my tickets"}
              </button>
            </div>
          ) : (
            <p className="text-center text-violet-200">Your Fan agent is building your bundle…</p>
          )}
        </div>
      </Shell>
    );
  }

  const q = state.question;
  if (!q) return <Shell>{header}Get ready…</Shell>;
  const mine = choices[q.idx];

  if (quiz.phase === "reveal") {
    const right = mine !== undefined && mine === q.answer_index;
    return (
      <Shell>
        {header}
        <div
          className={`animate-pop flex w-full flex-1 flex-col items-center justify-center gap-3 rounded-3xl p-8 text-center ${
            mine === undefined ? "bg-white/5" : right ? "bg-emerald-500/30" : "bg-rose-500/30"
          }`}
        >
          <div className="text-6xl">{mine === undefined ? "⏱️" : right ? "✅" : "❌"}</div>
          <p className="text-3xl font-black">{mine === undefined ? "Too slow!" : right ? "Correct!" : "Not quite"}</p>
          <p className="text-violet-100">Answer: {q.options[q.answer_index ?? 0]}</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {header}
      <TimerBar left={left} total={QUESTION_MS / 1000} />
      <p className="w-full text-center text-xl font-bold leading-snug">{q.prompt}</p>
      {mine === undefined ? (
        <div className="grid w-full flex-1 grid-cols-1 gap-3">
          {q.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => answer(i)}
              disabled={left <= 0}
              className={`flex min-h-16 items-center gap-3 rounded-2xl px-5 py-4 text-left text-lg font-semibold active:scale-[0.98] ${OPTION_STYLES[i].bg}`}
            >
              <span className="text-2xl">{OPTION_STYLES[i].shape}</span>
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <div className={`rounded-2xl px-6 py-3 text-lg font-semibold ${OPTION_STYLES[mine].bg}`}>
            {OPTION_STYLES[mine].shape} {q.options[mine]}
          </div>
          <p className="text-violet-200">Locked in. Waiting for the room…</p>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center gap-5 px-4 py-6">
      <Logo className="text-2xl" />
      {children}
    </main>
  );
}
