"use client";

import { useSyncExternalStore } from "react";
import Time from "./time";

export type SourceStatus = "never" | "fresh" | "stale" | "error";

/** Overdue when the source has gone 50% past its check interval. */
export function statusOf(
  lastCheckedAt: string | null,
  intervalHours: number,
  lastError: string | null
): SourceStatus {
  if (lastError) return "error";
  if (!lastCheckedAt) return "never";
  const ageH = (Date.now() - new Date(lastCheckedAt).getTime()) / 3_600_000;
  return ageH > intervalHours * 1.5 ? "stale" : "fresh";
}

const CLS: Record<SourceStatus, string> = {
  never: "bg-slate-500",
  fresh: "bg-emerald-400",
  stale: "bg-amber-400",
  error: "bg-red-400",
};

const LABEL: Record<SourceStatus, string> = {
  never: "Never checked",
  fresh: "Checked recently",
  stale: "Check overdue",
  error: "Last check failed",
};

/**
 * Colored dot for a source's check health: green = fresh, amber = overdue,
 * red = last check errored, grey = never checked. The full detail goes in the
 * tooltip (and optionally a relative timestamp next to the dot) instead of a
 * "last checked …" text line. Status is computed after mount (the value
 * depends on Date.now()) so the server render (neutral dot) and the client
 * never disagree.
 */
export default function StatusDot({
  lastCheckedAt,
  intervalHours,
  lastError,
  withTime = false,
}: {
  lastCheckedAt: string | null;
  intervalHours: number;
  lastError: string | null;
  withTime?: boolean;
}) {
  // Mount detection without an effect: the server/SSR snapshot reads the
  // neutral "never" dot, the client recomputes the time-dependent status
  // once after hydration.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const resolved = mounted ? statusOf(lastCheckedAt, intervalHours, lastError) : "never";
  const title =
    LABEL[resolved] +
    (lastCheckedAt ? ` (${lastCheckedAt})` : "") +
    (lastError ? ` — ${lastError}` : "");

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5"
      title={title}
      data-source-status={resolved}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${CLS[resolved]}`} />
      {withTime && lastCheckedAt && (
        <Time iso={lastCheckedAt} className="text-xs text-slate-500" />
      )}
    </span>
  );
}
