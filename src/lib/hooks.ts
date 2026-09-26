"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { browserSupabase } from "./supabase";
import type { Player, PublicQuestion, Quiz } from "./game";

export type QuizState = {
  quiz: Quiz;
  question: PublicQuestion | null;
  distribution: number[] | null;
  answered: number;
  now: number;
};

/** Server state for a quiz, refetched whenever the quiz row or its answers change in realtime. */
export function useQuizState(code: string) {
  const [state, setState] = useState<QuizState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skew, setSkew] = useState(0);
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const res = await fetch(`/api/quizzes/${code}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Error");
      else {
        setState(data);
        setSkew(data.now - Date.now());
      }
    } finally {
      inflight.current = false;
    }
  }, [code]);

  const quizId = state?.quiz.id;

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!quizId) return;
    const sb = browserSupabase();
    const ch = sb
      .channel(`quiz-${quizId}-${Math.random()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "quizzes", filter: `id=eq.${quizId}` }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "answers", filter: `quiz_id=eq.${quizId}` }, () => refresh())
      .subscribe();
    // Safety net if a realtime event is missed on flaky venue wifi.
    const poll = setInterval(refresh, 4000);
    return () => {
      clearInterval(poll);
      sb.removeChannel(ch);
    };
  }, [quizId, refresh]);

  return { state, error, refresh, skew };
}

export function usePlayers(quizId: string | undefined) {
  const [players, setPlayers] = useState<Player[]>([]);
  const load = useCallback(async () => {
    if (!quizId) return;
    const { data } = await browserSupabase()
      .from("players")
      .select("id,name,score,correct,profile,bundle")
      .eq("quiz_id", quizId)
      .order("score", { ascending: false })
      .order("created_at");
    if (data) setPlayers(data as Player[]);
  }, [quizId]);

  useEffect(() => {
    if (!quizId) return;
    load();
    const sb = browserSupabase();
    const ch = sb
      .channel(`players-${quizId}-${Math.random()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `quiz_id=eq.${quizId}` }, () => load())
      .subscribe();
    const poll = setInterval(load, 5000);
    return () => {
      clearInterval(poll);
      sb.removeChannel(ch);
    };
  }, [quizId, load]);

  return players;
}

export type LogEntry = { id: string; agent: "quiz" | "merch" | "fan"; summary: string; created_at: string };

export function useAgentLog(quizId: string | undefined) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  useEffect(() => {
    if (!quizId) return;
    const sb = browserSupabase();
    const load = async () => {
      const { data } = await sb
        .from("agent_log")
        .select("*")
        .eq("quiz_id", quizId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (data) setEntries(data as LogEntry[]);
    };
    load();
    const ch = sb
      .channel(`log-${quizId}-${Math.random()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_log", filter: `quiz_id=eq.${quizId}` }, () => load())
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [quizId]);
  return entries;
}

/** Seconds left until an ISO timestamp, corrected for server clock skew. */
export function useCountdown(endsAt: string | null | undefined, skew: number) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!endsAt) return setLeft(0);
    const end = new Date(endsAt).getTime();
    const tick = () => setLeft(Math.max(0, (end - (Date.now() + skew)) / 1000));
    tick();
    const t = setInterval(tick, 100);
    return () => clearInterval(t);
  }, [endsAt, skew]);
  return left;
}
