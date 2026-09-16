"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const PLACEHOLDERS: Record<string, string> = {
  website: "https://example.com/project",
  github: "owner/repo  (or https://github.com/owner/repo)",
  rss: "https://example.com/feed.xml",
};

export default function AddSourceForm({ type }: { type: "website" | "github" | "rss" }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [interval, setInterval] = useState(6);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/sources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, url, name, check_interval_hours: interval }),
    });
    setBusy(false);
    const j = (await res.json().catch(() => ({}))) as { id?: number; error?: string };
    if (!res.ok) {
      setError(j.error ?? "Failed to add");
      return;
    }
    const dest =
      type === "github"
        ? `/repos/${j.id}`
        : type === "rss"
          ? `/updates?source_id=${j.id}`
          : `/websites/${j.id}`;
    router.push(dest);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3"
    >
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={PLACEHOLDERS[type]}
        className="min-w-52 flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
        required
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (optional)"
        className="w-40 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
      <select
        value={interval}
        onChange={(e) => setInterval(Number(e.target.value))}
        className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
        title="Check interval"
      >
        <option value={1}>every 1 h</option>
        <option value={6}>every 6 h</option>
        <option value={12}>every 12 h</option>
        <option value={24}>daily</option>
        <option value={72}>every 3 d</option>
        <option value={168}>weekly</option>
      </select>
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-sky-600 px-4 py-1.5 text-sm text-white hover:bg-sky-500 disabled:opacity-50"
      >
        {busy ? "Adding…" : "Add"}
      </button>
      {error && <p className="w-full text-sm text-red-400">{error}</p>}
    </form>
  );
}
