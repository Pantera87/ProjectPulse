"use client";

import { useAiActivity } from "./ai-activity-provider";

/**
 * Spinning "AI processing" indicator for the navbar. Visible only while the
 * server is running AI work (summarizing updates, project summaries,
 * classifications, background requeues…). The tooltip lists what is running;
 * the check buttons (source cards, Check all) stay disabled until this
 * clears.
 */
export default function AiBusyRing() {
  const { activity } = useAiActivity();
  if (!activity.busy) return null;

  const label = activity.labels.join(", ");
  const tooltip =
    `AI is processing: ${activity.active} task${activity.active > 1 ? "s" : ""}` +
    (label ? ` (${label})` : "") +
    " — the check button unlocks when this finishes.";

  return (
    <span
      className="flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-400/10 px-2 py-0.5 text-[11px] font-medium text-violet-300"
      title={tooltip}
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className="h-3 w-3 animate-spin rounded-full border-2 border-violet-400/30 border-t-violet-300"
      />
      AI working…
    </span>
  );
}
