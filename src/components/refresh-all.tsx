"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Glyph } from "./icons";

interface Props {
  /** Called once when a run that this button started finishes. */
  onDone?: () => void;
  /** Small variant for compact headers (dashboard Projects row). */
  compact?: boolean;
}

/**
 * Manual "check all" — POST /api/sources/check-all starts a background run
 * over every source; the button polls the run status until it finishes, then
 * refreshes server components so last-checked stamps and counts update.
 */
export default function RefreshAll({ onDone, compact = false }: Props) {
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
    // Adopt an in-flight run (e.g. started from another tab) on mount.
    fetch("/api/sources/check-all", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.running) {
          setRunning(true);
          setProgress({ checked: j.checked, total: j.total });
          poller.current = setInterval(async () => {
            const status = await fetch("/api/sources/check-all", { cache: "no-store" })
              .then((r) => r.json())
              .catch(() => null);
            if (!status) return;
            setProgress({ checked: status.checked, total: status.total });
            if (!status.running) finish();
          }, 3000);
        }
      })
      .catch(() => {});
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    if (running) return;
    setRunning(true);
    try {
      const j = (await fetch("/api/sources/check-all", { method: "POST" })
        .then((r) => r.json())
        .catch(() => null)) as { count?: number } | null;
      setProgress({ checked: 0, total: j?.count ?? 0 });
    } catch {
      finish();
    }
    poller.current = setInterval(async () => {
      const status = await fetch("/api/sources/check-all", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null);
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
