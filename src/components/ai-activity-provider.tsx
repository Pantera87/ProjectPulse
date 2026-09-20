"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Shared AI activity state (client side), polled every 2 s from
 * /api/ai/activity (see src/lib/ai-activity.ts for the server side).
 *
 * `useAiBusy()` → true while the server is running any AI work (update
 * summaries, project summaries, classifications, background requeues…).
 * `useAiActivity()` → the full snapshot (labels, counters, health).
 */
export interface AIActivityState {
  busy: boolean;
  active: number;
  labels: string[];
  startedAt: string | null;
  failures: number;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

const IDLE: AIActivityState = {
  busy: false,
  active: 0,
  labels: [],
  startedAt: null,
  failures: 0,
  lastSuccessAt: null,
  lastError: null,
  lastErrorAt: null,
};

const POLL_MS = 2000;

interface ActivityContextValue {
  activity: AIActivityState;
}

const ActivityContext = createContext<ActivityContextValue>({ activity: IDLE });

export function useAiActivity(): ActivityContextValue {
  return useContext(ActivityContext);
}

/** True while the server is running AI work (any check, summary, …). */
export function useAiBusy(): boolean {
  return useContext(ActivityContext).activity.busy;
}

export default function AiActivityProvider({ children }: { children: ReactNode }) {
  const [activity, setActivity] = useState<AIActivityState>(IDLE);
  const router = useRouter();
  const wasBusy = useRef(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/ai/activity", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (alive && j && typeof j === "object" && "busy" in j) setActivity(j as AIActivityState);
        })
        .catch(() => {}); // offline/dev glitch — keep the last state
    load();
    const iv = setInterval(load, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // When AI work finishes, background jobs (category/subcategory cascades,
  // project summaries, requeues, scheduler checks) may have written fresh
  // values to the DB after this page rendered — re-run the server
  // components so the boxes show the new values without a manual refresh.
  useEffect(() => {
    if (wasBusy.current && !activity.busy) router.refresh();
    wasBusy.current = activity.busy;
  }, [activity.busy, router]);

  const value = useMemo(() => ({ activity }), [activity]);
  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}
