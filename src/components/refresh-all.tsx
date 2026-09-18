"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SourceType } from "@/lib/db";
import { Glyph } from "./icons";

interface Props {
  /** Called once when a run that this button started finishes. */
  onDone?: () => void;
  /** Small variant for compact headers (dashboard Projects row). */
  compact?: boolean;
  /**
   * Scope the run to one source type (websites / GitHub / RSS pages). Omit to
   * check every type (dashboard). When set, "Check all" only checks sources of
   * this type, then refreshes the page when the run finishes.
   */
  type?: SourceType;
}

interface RunStatus {
  running: boolean;
  checked: number;
  total: number;
  type: SourceType | null;
}

/** True when an in-flight run affects this button's scope. */
function matchesScope(thisType: SourceType | undefined, run: RunStatus) {
  return !thisType || !run.type || run.type === thisType;
}

/**
 * Manual "check all" — POST /api/sources/check-all starts a background run
 * over every source (or one source type when `type` is set); the button polls
 * the run status until it finishes, then refreshes server components so
 * last-checked stamps and counts update.
 */
export default function RefreshAll({ onDone, compact = false, type }: Props) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ checked: 0, total: 0 });
  const poller = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  const stopPolling = () => {
    if (poller.current) {
      clearInterval(poller.current);
      poller.current = null;
    }
  };

  const finish = () => {
    stopPolling();
    setRunning(false);
    setProgress({ checked: 0, total: 0 });
    router.refresh();
    onDone?.();
  };

  useEffect(() => {
    // Adopt an in-flight run (e.g. started from another tab) on mount — but
    // only if its scope matches this button's scope.
    fetch("/api/sources/check-all", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.running && matchesScope(type, j as RunStatus)) {
          setRunning(true);
          setProgress({ checked: j.checked, total: j.total });
          poller.current = setInterval(async () => {
            const status = (await fetch("/api/sources/check-all", { cache: "no-store" })
              .then((r) => r.json())
              .catch(() => null)) as RunStatus | null;
            if (!status) return;
            setProgress({ checked: status.checked, total: status.total });
            if (!status.running) finish();
          }, 3000);
        }
      })
      .catch(() => {});
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const start = async () => {
    if (running) return;
    setRunning(true);
    try {
      const j = (await fetch("/api/sources/check-all", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: type ?? null }),
      })
        .then((r) => r.json())
        .catch(() => null)) as { count?: number } | null;
      setProgress({ checked: 0, total: j?.count ?? 0 });
    } catch {
      finish();
    }
    poller.current = setInterval(async () => {
      const status = (await fetch("/api/sources/check-all", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null)) as RunStatus | null;
      if (!status) return;
      setProgress({ checked: status.checked, total: status.total });
      if (!status.running) finish();
    }, 3000);
  };

  return (
    <button
      onClick={start}
      disabled={running}
      className={`btn-ghost ${compact ? "px-2 py-1 text-xs" : "px-3 py-1 text-sm"} ${
        running ? "border-violet-400/50 text-violet-300" : ""
      }`}
      title="Run the checker for every tracked project now"
    >
      <Glyph
        name="bolt"
        className={`mr-1.5 h-3.5 w-3.5 ${running ? "animate-pulse" : ""}`}
      />
      {running
        ? progress.total > 0
          ? `Checking ${progress.checked}/${progress.total}…`
          : "Checking…"
        : "Check all"}
    </button>
  );
}

