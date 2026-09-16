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
        className="btn-primary px-3 py-1 text-sm"
      >
        {busy === "check" ? "Checking…" : "Check now"}
      </button>
      <button
        onClick={() => act("watch", () => patch({ watch_enabled: watchEnabled ? 0 : 1 }))}
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
        onClick={() =>
          act("mute", () => patch({ muted_until: muted ? "clear" : new Date(Date.now() + 30 * 86400_000).toISOString() }))
        }
        disabled={busy !== null}
        className={`btn-ghost px-3 py-1 text-sm ${
          muted ? "border-amber-400/50 text-amber-300" : ""
        }`}
      >
        {muted ? "Unmute (30d)" : "Mute 30d"}
      </button>
      <button
        onClick={() => act("interval", () => patch({ check_interval_hours: nextInterval(intervalHours) }))}
        disabled={busy !== null}
        className="btn-ghost px-3 py-1 text-sm"
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
        className="btn-ghost px-3 py-1 text-sm !border-red-500/40 !text-red-300 hover:!bg-red-500/15"
      >
        Delete
      </button>
      <Link href={detail} className="text-indigo-300 hover:underline">
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
