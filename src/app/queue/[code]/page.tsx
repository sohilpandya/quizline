"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuizState } from "@/lib/hooks";

// A fictional ticketing site's waiting room, showing how a queue platform embeds Quizline as an iframe.
export default function QueueHost() {
  const { code } = useParams<{ code: string }>();
  const { state } = useQuizState(code);
  const quiz = state?.quiz;
  const [position, setPosition] = useState(84213);

  useEffect(() => {
    const t = setInterval(() => setPosition((p) => Math.max(1, p - Math.floor(20 + Math.random() * 60))), 1000);
    return () => clearInterval(t);
  }, []);

  const done = quiz?.phase === "ended";
  const shown = done ? 0 : position;

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900">
      <header className="bg-slate-900 px-6 py-4 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="text-xl font-black tracking-tight">
            tix<span className="text-sky-400">queue</span>
          </span>
          <span className="text-sm text-slate-300">Official ticket partner · Demo</span>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[1fr_420px]">
        <section className="flex flex-col gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">Waiting room</p>
            <h1 className="mt-1 text-3xl font-black">{quiz?.artist ?? "…"}: The 2026 Tour</h1>
            <p className="text-slate-600">London · Presale</p>
          </div>

          <div className="rounded-2xl bg-white p-8 shadow-sm">
            {done ? (
              <div className="flex flex-col gap-3">
                <p className="text-2xl font-black text-emerald-600">It&apos;s your turn!</p>
                <p className="text-slate-600">You have 10 minutes to choose your tickets.</p>
                <button className="w-fit rounded-xl bg-sky-600 px-6 py-3 font-bold text-white">Choose tickets</button>
              </div>
            ) : (
              <>
                <p className="text-slate-500">Your number in the queue</p>
                <p className="mt-1 font-mono text-6xl font-black tabular-nums">{shown.toLocaleString("en-GB")}</p>
                <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full bg-sky-600 transition-all" style={{ width: `${100 - (shown / 84213) * 100}%` }} />
                </div>
                <p className="mt-3 text-sm text-slate-500">
                  Estimated wait: {quiz?.wait_minutes ?? 10} minutes. Do not refresh this page.
                </p>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
            <p className="font-semibold text-slate-700">For platforms: one line to integrate</p>
            <code className="mt-2 block overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-sky-200">
              {`<iframe src="https://quizline.app/play/${code}" allow="clipboard-write" />`}
            </code>
          </div>
        </section>

        <aside className="overflow-hidden rounded-3xl shadow-xl ring-1 ring-slate-900/10">
          <div className="bg-slate-900 px-4 py-2 text-xs text-slate-300">While you wait · powered by Quizline</div>
          <iframe src={`/play/${code}`} className="h-[720px] w-full bg-[#0b0714]" title="Quizline" />
        </aside>
      </main>
    </div>
  );
}
