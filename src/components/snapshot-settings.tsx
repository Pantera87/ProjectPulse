"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Snapshot storage settings: how many versions to keep, what to store for
 * new snapshots (full offline archive / HTML) and the global AI summary
 * length — plus a danger button clearing all snapshots.
 */
export default function SnapshotSettings() {
  const router = useRouter();
  const [keep, setKeep] = useState<number | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [k, m, s] = await Promise.all([
          fetch("/api/settings/snapshot-keep").then((r) => r.json()),
          fetch("/api/settings/snapshot-mode").then((r) => r.json()),
          fetch("/api/settings/summary-size").then((r) => r.json()),
        ]);
        setKeep(k.keep);
        setMode(m.mode);
        setSize(s.size);
      } catch {
        // page stays usable without the values
      }
    })();
  }, []);

  async function post(path: string, body: unknown, label: string) {
    setBusy(label);
    setSaved(null);
    try {
      await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setSaved(label);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function clearAll() {
    if (
      !confirm(
        "Delete ALL snapshots of ALL projects (stored pages and offline archives)? This cannot be undone."
      )
    )
      return;
    setBusy("clear");
    setSaved(null);
    try {
      await fetch("/api/snapshots", { method: "DELETE" });
      setSaved("clear");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (keep === null || mode === null || size === null)
    return <p className="text-sm text-slate-500">Loading settings…</p>;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-slate-300">
          Versions to keep per project
          <input
            type="number"
            min={1}
            max={500}
            value={keep}
            onChange={(e) => setKeep(Number(e.target.value) || 1)}
            className="w-20 rounded border border-white/15 bg-white/5 px-2 py-1 text-slate-200"
          />
        </label>
        <button
          onClick={() => post("/api/settings/snapshot-keep", { keep }, "keep")}
          disabled={busy !== null}
          className="btn-ghost px-2.5 py-1 text-xs"
        >
          {busy === "keep" ? "Saving…" : "Save"}
        </button>
        {saved === "keep" && <span className="text-xs text-emerald-400">saved</span>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-slate-300">Store for new snapshots</span>
        {(
          [
            ["full", "Full offline archive (page + assets)"],
            ["html", "HTML only"],
          ] as [string, string][]
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-1.5 text-slate-300">
            <input
              type="radio"
              name="snapshot-mode"
              checked={mode === value}
              onChange={() =>
                post("/api/settings/snapshot-mode", { mode: value }, "mode")
              }
            />
            {label}
          </label>
        ))}
        {saved === "mode" && <span className="text-xs text-emerald-400">saved</span>}
      </div>
      <p className="text-xs text-slate-500">
        “Full” downloads each page&apos;s referenced assets (capped at 60 files, 2 MB
        each) so snapshots render completely offline. Old snapshots keep what was
        stored before the change.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-slate-300">
          AI summary length
          <select
            value={size}
            onChange={(e) => post("/api/settings/summary-size", { size: e.target.value }, "size")}
            disabled={busy !== null}
            className="rounded border border-white/15 bg-white/5 px-2 py-1 text-slate-200"
          >
            <option value="short">Short (3 bullets)</option>
            <option value="medium">Medium (6 bullets)</option>
            <option value="long">Long (10 bullets)</option>
          </select>
        </label>
        {saved === "size" && <span className="text-xs text-emerald-400">saved</span>}
      </div>
      <p className="text-xs text-slate-500">
        Changing the length regenerates all stored project summaries in the
        background (only while AI is enabled). Projects can override this in their
        details page.
      </p>

      <div className="flex items-center gap-2 border-t border-white/10 pt-3">
        <button
          onClick={clearAll}
          disabled={busy !== null}
          className="btn-ghost px-2.5 py-1 text-xs !border-red-500/40 !text-red-300 hover:!bg-red-500/15"
        >
          {busy === "clear" ? "Clearing…" : "Clear all snapshots"}
        </button>
        {saved === "clear" && <span className="text-xs text-emerald-400">done</span>}
      </div>
    </div>
  );
}