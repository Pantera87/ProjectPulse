"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { deriveAiStatus } from "@/lib/ai-status";
import type { AiStatus } from "@/lib/ai-status";

/** Top-nav badge showing whether AI is on, which model is loaded, and
 *  download progress. Polls /api/ai every 5 s (server-side probes are
 *  cached, so this costs one Ollama call per 10–60 s) and re-checks
 *  immediately when the tab becomes visible again. Click → Settings. */
export default function AiStatus() {
  const [s, setS] = useState<AiStatus | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/ai", { cache: "no-store" })
        .then((r) => r.json())
        .then((j: AiStatus) => {
          if (alive) setS(j);
        })
        .catch(() => {});
    load();
    const iv = setInterval(load, 5_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  const d = deriveAiStatus(s);
  return (
    <Link
      href="/settings"
      title={d.title}
      className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300 transition hover:bg-white/10 hover:text-white"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${d.dot}`} aria-hidden="true" />
      <span className="max-w-[140px] truncate font-medium">{d.label}</span>
    </Link>
  );
}