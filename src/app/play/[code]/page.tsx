"use client";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo, OPTION_STYLES, TimerBar } from "@/components/ui";
import { QUESTION_MS, QUEUE_SIZE, startPosition, type Bundle, type PublicQuestion, type Quiz } from "@/lib/game";
import { useCountdown, usePlayers, useQuizState } from "@/lib/hooks";

const AUTO_NEXT_MS = 900;

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

type Feedback = { choice: number; correct: boolean; points: number };

export default function Play() {
  const { code } = useParams<{ code: string }>();
  const key = `quizline:${code.toUpperCase()}`;
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const { state, error } = useQuizState(code);
  const quiz = state?.quiz;
  const players = usePlayers(quiz?.id);

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

  if (error) return <Shell>{error}</Shell>;
  if (!state || !quiz) return <Shell>Loading…</Shell>;

  if (!playerId) {
    return (
      <Shell>
        <form onSubmit={join} className="flex w-full flex-col gap-4">
          <p className="text-center text-violet-200">
            The {quiz.artist} quiz · play while you wait in the queue
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

  const meIndex = players.findIndex((p) => p.id === playerId);
  const me = meIndex >= 0 ? players[meIndex] : null;
  return <Game code={code} storeKey={key} playerId={playerId} quiz={quiz} rank={meIndex + 1} me={me} fans={players.length} />;
}

function Game({
  code,
  storeKey,
  playerId,
  quiz,
  rank,
  me,
  fans,
}: {
  code: string;
  storeKey: string;
  playerId: string;
  quiz: Quiz;
  rank: number;
  me: { name: string; score: number; correct: number; bundle: Bundle | null } | null;
  fans: number;
}) {
  const queue = useQueue(storeKey, playerId, quiz);
  const atFront = queue.pos <= 0;
  const [questions, setQuestions] = useState<PublicQuestion[] | null>(null);
  const [idx, setIdx] = useState(() => Number(storageGet(`${storeKey}:idx`) ?? 0));
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [tally, setTally] = useState(() => JSON.parse(storageGet(`${storeKey}:tally`) ?? '{"correct":0,"points":0}'));
  const [qStart, setQStart] = useState(() => Date.now());
  const finishSent = useRef(false);

  const live = quiz.phase !== "lobby";

  useEffect(() => {
    if (!live || questions) return;
    fetch(`/api/quizzes/${code}/questions`)
      .then((r) => r.json())
      .then((d) => {
        setQuestions(d.questions ?? []);
        setQStart(Date.now());
      });
  }, [live, questions, code]);

  // Reaching the front hands over to the Basket agent.
  useEffect(() => {
    if (!atFront || finishSent.current) return;
    finishSent.current = true;
    fetch(`/api/quizzes/${code}/finish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
  }, [atFront, code, playerId]);

  const next = useCallback(() => {
    setFeedback(null);
    setIdx((i) => {
      storageSet(`${storeKey}:idx`, String(i + 1));
      return i + 1;
    });
    setQStart(Date.now());
  }, [storeKey]);

  const q = questions?.[idx];

  const answer = useCallback(
    (choice: number) => {
      if (!q || feedback) return;
      const ms = Date.now() - qStart;
      const correct = choice === q.answer_index;
      const points = correct ? 100 * q.difficulty + Math.round(50 * (1 - Math.min(ms, QUESTION_MS) / QUESTION_MS)) : 0;
      setFeedback({ choice, correct, points });
      setTally((t: { correct: number; points: number }) => {
        const n = { correct: t.correct + (correct ? 1 : 0), points: t.points + points };
        storageSet(`${storeKey}:tally`, JSON.stringify(n));
        return n;
      });
      queue.bump(correct);
      // Fire and forget: the server records it for the leaderboard and the Basket agent.
      fetch(`/api/quizzes/${code}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, choice, questionIdx: q.idx, ms }),
      });
    },
    [q, feedback, qStart, queue, code, playerId, storeKey],
  );

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(next, AUTO_NEXT_MS);
    return () => clearTimeout(t);
  }, [feedback, next]);

  const left = useCountdown(q && !feedback ? new Date(qStart + QUESTION_MS).toISOString() : null, 0);
  useEffect(() => {
    if (q && !feedback && left <= 0 && Date.now() - qStart > 500) answer(-1);
  }, [left, q, feedback, qStart, answer]);

  const header = (
    <div className="flex w-full flex-col gap-3">
      <QueueBar queue={queue} />
      <div className="flex w-full items-center justify-between text-sm text-violet-200">
        <span className="font-semibold">{me?.name}</span>
        <span>
          {rank > 0 ? `Quiz rank #${rank} · ` : ""}
          {Math.max(me?.score ?? 0, tally.points)} pts
        </span>
      </div>
    </div>
  );

  if (atFront) {
    const b = me?.bundle && !me.bundle.pending ? me.bundle : null;
    return (
      <Shell>
        {header}
        <div className="flex w-full flex-col gap-4">
          <div className="text-center">
            <p className="text-sm uppercase tracking-wider text-emerald-300">It&apos;s your turn to buy tickets</p>
            <p className="text-violet-200">
              {tally.correct} correct · quiz rank #{rank || "–"}
            </p>
          </div>
          {b ? <BasketCard b={b} /> : <AgentWorking />}
        </div>
      </Shell>
    );
  }

  if (!live) {
    return (
      <Shell>
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="text-5xl">🎟️</div>
          <p className="text-2xl font-bold">You&apos;re in the queue!</p>
          <p className="text-violet-200">The quiz starts in a moment. {fans} {fans === 1 ? "fan" : "fans"} here.</p>
        </div>
      </Shell>
    );
  }

  if (!questions) return <Shell>{header}Loading questions…</Shell>;

  if (!q) {
    return (
      <Shell>
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="text-5xl">🏁</div>
          <p className="text-2xl font-black">
            {tally.correct}/{questions.length} correct
          </p>
          <p className="text-violet-200">
            Quiz done. Your Basket agent will shop for you the moment you reach the front of the queue.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {header}
      <div className="flex w-full items-center justify-between text-xs text-violet-300">
        <span>
          Question {idx + 1} / {questions.length}
        </span>
        <span>{q.tags.join(" · ")}</span>
      </div>
      <TimerBar left={feedback ? 0 : left} total={QUESTION_MS / 1000} />
      <p key={q.idx} className="animate-pop w-full text-center text-xl font-bold leading-snug">
        {q.prompt}
      </p>
      <div className="grid w-full grid-cols-1 gap-3">
        {q.options.map((opt, i) => {
          const isAnswer = i === q.answer_index;
          const picked = feedback?.choice === i;
          const dim = feedback && !isAnswer && !picked;
          return (
            <button
              key={i}
              onClick={() => answer(i)}
              disabled={!!feedback}
              className={`flex min-h-16 items-center gap-3 rounded-2xl px-5 py-4 text-left text-lg font-semibold transition active:scale-[0.98] ${
                OPTION_STYLES[i].bg
              } ${dim ? "opacity-25" : ""} ${feedback && isAnswer ? "ring-4 ring-white" : ""} ${
                picked && !feedback?.correct ? "ring-4 ring-rose-200" : ""
              }`}
            >
              <span className="text-2xl">{OPTION_STYLES[i].shape}</span>
              <span className="flex-1">{opt}</span>
              {feedback && isAnswer && <span>✓</span>}
              {picked && !feedback?.correct && <span>✗</span>}
            </button>
          );
        })}
      </div>
      {feedback && (
        <button
          onClick={next}
          className={`animate-pop flex w-full items-center justify-between rounded-2xl px-5 py-4 text-lg font-black ${
            feedback.correct ? "bg-emerald-500" : feedback.choice < 0 ? "bg-white/15" : "bg-rose-500"
          }`}
        >
          <span>{feedback.correct ? `Correct! +${feedback.points}` : feedback.choice < 0 ? "Time's up" : "Not quite"}</span>
          <span>Next →</span>
        </button>
      )}
    </Shell>
  );
}

type Queue = { pos: number; start: number; rate: number; moved: number; surge: boolean; bump: (correct: boolean) => void };

/**
 * Fake ticket queue: moves forward on its own the whole time (like real queues), with random surges.
 * Answering nudges you forward a little faster. Reaches the front in roughly the quiz's wait time.
 */
function useQueue(storeKey: string, playerId: string, quiz: Quiz): Queue {
  const start = startPosition(playerId);
  const rate = start / (quiz.wait_minutes * 60); // places per second
  const k = `${storeKey}:queue`;
  const posRef = useRef<number | null>(null);
  if (posRef.current === null) {
    const saved = JSON.parse(storageGet(k) ?? "null");
    posRef.current = saved ? Math.max(0, saved.pos - ((Date.now() - saved.t) / 1000) * rate) : start;
  }
  const [pos, setPos] = useState(posRef.current);
  const [moved, setMoved] = useState(0);
  const [surge, setSurge] = useState(false);
  const flash = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ended = quiz.phase === "ended";
  const lobby = quiz.phase === "lobby";

  const move = useCallback(
    (by: number, isSurge = false) => {
      const p = posRef.current ?? start;
      // Before the quiz opens the queue still moves, but never lets you reach the front.
      const floor = lobby ? Math.min(p, start * 0.25) : 0;
      const n = Math.max(floor, p - by);
      posRef.current = n;
      setPos(n);
      storageSet(k, JSON.stringify({ pos: n, t: Date.now() }));
      if (by >= 3 && n < p) {
        setMoved(Math.round(p - n));
        setSurge(isSurge);
        if (flash.current) clearTimeout(flash.current);
        flash.current = setTimeout(() => setMoved(0), 1800);
      }
    },
    [k, lobby, start],
  );

  useEffect(() => {
    if (ended) return;
    let last = Date.now();
    const t = setInterval(() => {
      const dt = (Date.now() - last) / 1000;
      last = Date.now();
      if (Math.random() < 0.05) move((posRef.current ?? 0) * (0.03 + Math.random() * 0.05) + 5, true);
      else move(rate * dt * (0.4 + Math.random() * 1.2));
    }, 700);
    return () => clearInterval(t);
  }, [ended, rate, move]);

  const bump = useCallback(
    (correct: boolean) => move(correct ? (posRef.current ?? 0) * 0.03 + 8 : (posRef.current ?? 0) * 0.01 + 3),
    [move],
  );

  return { pos: ended ? 0 : Math.round(pos), start, rate, moved, surge, bump };
}

function QueueBar({ queue }: { queue: Queue }) {
  const { pos, start, rate, moved, surge } = queue;
  const done = pos <= 0;
  const secsLeft = Math.round(pos / Math.max(0.1, rate));
  const eta = secsLeft >= 60 ? `~${Math.ceil(secsLeft / 60)} min` : `~${secsLeft}s`;
  return (
    <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider text-violet-300">
          {done ? "Ticket queue" : "Your place in the ticket queue"}
        </span>
        {moved > 0 && !done && (
          <span className="animate-pop text-xs font-bold text-emerald-300">
            {surge ? "Queue surge! " : ""}▲ {moved} places
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline justify-between">
        <span className="font-mono text-3xl font-black tabular-nums">
          {done ? "You're at the front 🎟️" : `#${pos.toLocaleString("en-GB")}`}
          {!done && <span className="ml-1 text-sm font-normal text-violet-300">of {QUEUE_SIZE.toLocaleString("en-GB")}</span>}
        </span>
        {!done && <span className="text-sm text-violet-200">{eta} to go</span>}
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-emerald-400 transition-[width] duration-700"
          style={{ width: `${done ? 100 : Math.max(2, 100 - (pos / start) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function AgentWorking() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-fuchsia-400 border-t-transparent" />
      <p className="font-bold">Your Basket agent is shopping for you…</p>
      <p className="text-sm text-violet-200">Reading how you played, your reward and the £50 budget.</p>
    </div>
  );
}

function BasketCard({ b }: { b: Bundle }) {
  const [claimed, setClaimed] = useState(false);
  return (
    <div className="animate-pop flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center justify-between">
        <span className="font-bold">Your agent&apos;s basket</span>
        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">{b.tier}</span>
      </div>
      <p className="text-sm text-violet-100/90">{b.explanation}</p>
      <ul className="flex flex-col gap-3">
        {b.free_item && (
          <li className="flex items-center gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-3">
            <span className="text-3xl">{b.free_item.emoji}</span>
            <span className="flex-1">
              <span className="block font-semibold leading-tight">{b.free_item.title}</span>
              <span className="text-xs text-emerald-300">
                Earned with {b.correct}/{b.asked} correct
              </span>
            </span>
            <span className="font-mono text-emerald-300">FREE</span>
          </li>
        )}
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
        disabled={claimed}
        className="rounded-2xl bg-emerald-500 py-4 text-lg font-bold disabled:opacity-80"
      >
        {claimed ? "✓ Added to your ticket order" : "Add basket to my ticket order"}
      </button>
      <details className="rounded-2xl bg-black/20 p-3 text-sm" open>
        <summary className="cursor-pointer font-semibold text-violet-200">How your agent built this</summary>
        <ol className="mt-2 flex flex-col gap-1.5">
          {b.trace.map((t, i) => (
            <li
              key={i}
              className={t.kind === "guardrail" ? "text-amber-300" : t.kind === "think" ? "text-violet-100/90" : "text-emerald-300"}
            >
              {t.kind === "guardrail" ? "🛡️ " : t.kind === "think" ? "💭 " : "✓ "}
              {t.text}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center gap-4 px-4 py-6">
      <Logo className="text-2xl" />
      {children}
    </main>
  );
}
