"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function RestoreForm() {
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function onFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setStatus("Restoring…");
    const res = await fetch("/api/backup", { method: "POST", body: file });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      counts?: Record<string, number>;
    };
    setStatus(
      res.ok
        ? `Restored: ${j.counts?.sources ?? 0} sources, ${j.counts?.snapshots ?? 0} snapshots, ${j.counts?.updates ?? 0} updates`
        : `Failed: ${j.error ?? "unknown error"}`
    );
    if (res.ok) router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => onFile(e.target.files)}
      />
      <button
        onClick={() => fileRef.current?.click()}
        className="btn-ghost px-3 py-1.5 text-sm"
      >
        Upload backup JSON
      </button>
      <a
        href="/api/backup"
        className="btn-ghost px-3 py-1.5 text-sm"
      >
        Download backup
      </a>
      {status && <span className="text-xs text-slate-400">{status}</span>}
    </div>
  );
}
