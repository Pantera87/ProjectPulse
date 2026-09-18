"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SIZES: { value: string; label: string }[] = [
  { value: "", label: "AI summary length: default (global)" },
  { value: "short", label: "AI summary length: short (3 bullets)" },
  { value: "medium", label: "AI summary length: medium (6 bullets)" },
  { value: "long", label: "AI summary length: long (10 bullets)" },
];

/**
 * Per-project override of the AI summary length. Selecting a size regenerates
 * the summary in the background (server-side, when AI is enabled).
 */
export default function SummarySizeSelect({
  sourceId,
  initial,
}: {
  sourceId: number;
  initial: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function change(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    setBusy(true);
    try {
      await fetch(`/api/sources/${sourceId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ summary_size: value === "" ? null : value }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="flex items-center gap-2 text-sm text-slate-400">
      <select
        value={initial ?? ""}
        onChange={change}
        disabled={busy}
        className="rounded border border-white/15 bg-white/5 px-2 py-1 text-sm text-slate-200"
        title={busy ? "Regenerating the summary…" : undefined}
      >
        {SIZES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {busy && <span className="text-xs text-slate-500">regenerating…</span>}
    </label>
  );
}