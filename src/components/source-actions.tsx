"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Props {
  id: number;
  type: string;
  watchEnabled: boolean;
  mutedUntil: string | null;
  intervalHours: number;
  lastCheckedAt: string | null;
  lastError: string | null;
}

export default function SourceActions({
  id,
  type,
  watchEnabled,
  mutedUntil,
  intervalHours,
  lastCheckedAt,
  lastError,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  const muted = mutedUntil ? new Date(mutedUntil).getTime() > Date.now() : false;
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

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button
        onClick={() =>
          act("check", async () => {
            await fetch(`/api/sources/${id}/check`, { method: "POST" });
          })
        }
        disabled={busy !== null}
        className="rounded bg-sky-600 px-3 py-1 text-white hover:bg-sky-500 disabled:opacity-50"
      >
        {busy === "check" ? "Checking…" : "Check now"}
      </button>
      <button
        onClick={() => act("watch", () => patch({ watch_enabled: watchEnabled ? 0 : 1 }))}
        disabled={busy !== null}
        className={`rounded border px-3 py-1 ${
          watchEnabled
            ? "border-emerald-600 text-emerald-400"
            : "border-slate-600 text-slate-400"
        }`}
      >
        {watchEnabled ? "Tracking: on" : "Tracking: off"}
      </button>
      <button
        onClick={() =>
          act("mute", () => patch({ muted_until: muted ? "clear" : new Date(Date.now() + 30 * 86400_000).toISOString() }))
        }
        disabled={busy !== null}
        className={`rounded border px-3 py-1 ${
          muted ? "border-amber-600 text-amber-400" : "border-slate-600 text-slate-400"
        }`}
      >
        {muted ? "Unmute (30d)" : "Mute 30d"}
      </button>
      <button
        onClick={() => act("interval", () => patch({ check_interval_hours: nextInterval(intervalHours) }))}
        disabled={busy !== null}
        className="rounded border border-slate-600 px-3 py-1 text-slate-300"
        title="Click to change check interval"
      >
        every {intervalHours >= 24 ? `${Math.round(intervalHours / 24)}d` : `${intervalHours}h`}
      </button>
      <button
        onClick={() => {
          if (confirm("Remove this source and all its history?"))
            act("del", async () => {
              await fetch(`/api/sources/${id}`, { method: "DELETE" });
              router.push("/");
            });
        }}
        disabled={busy !== null}
        className="rounded border border-red-800 px-3 py-1 text-red-400"
      >
        Delete
      </button>
      <Link href={detail} className="text-sky-400 hover:underline">
        Details →
      </Link>
      {lastCheckedAt && (
        <span className="text-xs text-slate-500">
          last checked {new Date(lastCheckedAt).toLocaleString()}
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
