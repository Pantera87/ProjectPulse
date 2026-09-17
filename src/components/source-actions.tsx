"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import KebabMenu from "./kebab-menu";

interface Props {
  id: number;
  type: string;
  watchEnabled: boolean;
  /** Computed server-side so the label is identical during hydration. */
  muted: boolean;
  intervalHours: number;
  lastCheckedAt: string | null;
  lastError: string | null;
  /** Slim layout for dashboard grid cards: Check now + kebab menu. */
  compact?: boolean;
}

export default function SourceActions({
  id,
  type,
  watchEnabled,
  muted,
  intervalHours,
  lastCheckedAt,
  lastError,
  compact = false,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  const detail =
    type === "github" ? `/repos/${id}` : type === "rss" ? `/updates?source_id=${id}` : `/websites/${id}`;

  async function act(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    await fn();
    setBusy(null);
    router.refresh();
  }

  const patch = (body: Record<string, unknown>) =>
    fetch(`/api/sources/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const runCheck = () =>
    act("check", async () => {
      await fetch(`/api/sources/${id}/check`, { method: "POST" });
    });
  const runWatch = () => act("watch", () => patch({ watch_enabled: watchEnabled ? 0 : 1 }));
  const runMute = () =>
    act("mute", () =>
      patch({ muted_until: muted ? "clear" : new Date(Date.now() + 30 * 86400_000).toISOString() })
    );
  const runInterval = () =>
    act("interval", () => patch({ check_interval_hours: nextInterval(intervalHours) }));
  const runDelete = () => {
    if (confirm("Remove this source and all its history?"))
      act("del", async () => {
        await fetch(`/api/sources/${id}`, { method: "DELETE" });
        router.push("/");
      });
  };

  const intervalLabel = `every ${
    intervalHours >= 24 ? `${Math.round(intervalHours / 24)}d` : `${intervalHours}h`
  }`;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          onClick={runCheck}
          disabled={busy !== null}
          className="btn-primary px-3 py-1 text-sm"
        >
          {busy === "check" ? "Checking…" : "Check now"}
        </button>
        <KebabMenu
          title="More actions"
          items={[
            {
              label: watchEnabled ? "Tracking: on" : "Tracking: off",
              onClick: runWatch,
              disabled: busy !== null,
            },
            {
              label: muted ? "Unmute (30d)" : "Mute 30d",
              onClick: runMute,
              disabled: busy !== null,
            },
            {
              label: `${intervalLabel} — change`,
              onClick: runInterval,
              disabled: busy !== null,
            },
            {
              label: "Details →",
              onClick: () => router.push(detail),
              disabled: busy !== null,
            },
            { label: "Delete", onClick: runDelete, danger: true, disabled: busy !== null },
          ]}
        />
        {lastCheckedAt && (
          <span
            className="ml-auto text-xs text-slate-500"
            title={lastError ? `error: ${lastError}` : undefined}
          >
            last checked {formatDateTime(lastCheckedAt)}
            {lastError && <span className="ml-1 text-red-400">⚠</span>}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button
        onClick={runCheck}
        disabled={busy !== null}
        className="btn-primary px-3 py-1 text-sm"
      >
        {busy === "check" ? "Checking…" : "Check now"}
      </button>
      <button
        onClick={runWatch}
        disabled={busy !== null}
        className={`btn-ghost px-3 py-1 text-sm ${
          watchEnabled
            ? "border-emerald-400/50 text-emerald-300"
            : ""
        }`}
      >
        {watchEnabled ? "Tracking: on" : "Tracking: off"}
      </button>
      <button
        onClick={runMute}
        disabled={busy !== null}
        className={`btn-ghost px-3 py-1 text-sm ${
          muted ? "border-amber-400/50 text-amber-300" : ""
        }`}
      >
        {muted ? "Unmute (30d)" : "Mute 30d"}
      </button>
      <button
        onClick={runInterval}
        disabled={busy !== null}
        className="btn-ghost px-3 py-1 text-sm"
        title="Click to change check interval"
      >
        {intervalLabel}
      </button>
      <button
        onClick={runDelete}
        disabled={busy !== null}
        className="btn-ghost px-3 py-1 text-sm !border-red-500/40 !text-red-300 hover:!bg-red-500/15"
      >
        Delete
      </button>
      <Link href={detail} className="text-indigo-300 hover:underline">
        Details →
      </Link>
      {lastCheckedAt && (
        <span className="text-xs text-slate-500">
          last checked {formatDateTime(lastCheckedAt)}
        </span>
      )}
      {lastError && <span className="text-xs text-red-400">error: {lastError}</span>}
    </div>
  );
}

function nextInterval(cur: number): number {
  const steps = [1, 6, 12, 24, 72, 168, 336];
  const i = steps.indexOf(cur);
  return steps[(i + 1) % steps.length];
}
