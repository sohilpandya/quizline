"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/ui";

const STEPS = [
  "Reading the fandom…",
  "Quiz Master is writing questions…",
  "Merch agent is designing the catalog…",
  "Tagging eras and albums…",
  "Almost ready…",
];

export default function Home() {
  const router = useRouter();
  const [artist, setArtist] = useState("");
  const [wait, setWait] = useState(10);
  const [fresh, setFresh] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 4000);
    try {
      const res = await fetch("/api/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist, waitMinutes: wait, fresh }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      router.push(`/stage/${data.code}`);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    } finally {
      clearInterval(t);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div>
        <Logo className="text-5xl" />
        <p className="mt-4 text-lg text-violet-200/80">
          Millions of fans wait an hour for tickets staring at a number. Quizline turns that dead hour into a live game,
          and agents turn it into a storefront.
        </p>
      </div>

      <form onSubmit={create} className="flex flex-col gap-5 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-violet-200">Artist or event</span>
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="e.g. Justin Bieber"
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-lg outline-none focus:border-fuchsia-400"
            disabled={loading}
            required
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-violet-200">
            Expected queue wait: <span className="text-white">{wait} min</span>
          </span>
          <input
            type="range"
            min={2}
            max={30}
            value={wait}
            onChange={(e) => setWait(Number(e.target.value))}
            disabled={loading}
            className="accent-fuchsia-400"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-violet-200/80">
          <input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} disabled={loading} />
          Regenerate with fresh research (uses Grok credits; otherwise reuses a cached quiz)
        </label>
        <button
          disabled={loading || !artist.trim()}
          className="rounded-xl bg-fuchsia-500 px-4 py-4 text-lg font-bold text-white transition hover:bg-fuchsia-400 disabled:opacity-60"
        >
          {loading ? STEPS[step] : "Generate live quiz"}
        </button>
        {error && <p className="text-sm text-rose-300">{error}</p>}
      </form>
    </main>
  );
}
