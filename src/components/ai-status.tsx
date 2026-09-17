"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface OllamaState {
  reachable: boolean;
  version: string | null;
  installed: string[];
  loaded: string[];
  modelInstalled: boolean;
  modelLoaded: boolean;
  pulls: Record<string, { status: "downloading" | "done" | "error"; progress: number; error: string | null }>;
}

interface AIState {
  enabled: boolean;
  configured: boolean;
  envOff: boolean;
  userOverride: "on" | "off" | null;
  provider: string;
  model: string | null;
  reachable?: boolean | null;
  ollama?: OllamaState;
}

interface Display {
  dot: string;
  label: string;
  title: string;
}

function derive(s: AIState | null): Display {
  if (!s)
    return { dot: "bg-slate-500", label: "AI …", title: "Loading AI status…" };
  if (!s.enabled && s.userOverride === "off")
    return {
      dot: "bg-slate-500",
      label: "AI off",
      title: "AI is disabled. Enable it in Settings → AI.",
    };
  if (!s.enabled && s.envOff)
    return {
      dot: "bg-slate-500",
      label: "AI off",
      title: "AI is disabled by the AI_ENABLED=false environment variable.",
    };
  if (!s.enabled)
    return {
      dot: "bg-amber-400",
      label: "AI off",
      title:
        s.configured
          ? "AI is disabled. Enable it in Settings → AI."
          : "AI is not configured yet. Open Settings → AI to choose a provider (Ollama, OpenAI-compatible, Claude or MCP).",
    };
  // Enabled
  if (s.provider === "ollama") {
    const o = s.ollama;
    const model = s.model ?? "qwen2.5:7b";
    const pull = o?.pulls?.[model];
    if (pull && pull.status === "downloading")
      return {
        dot: "animate-pulse bg-sky-400",
        label: `AI · ${model} · ${Math.round(pull.progress * 100)}%`,
        title: `Model ${model} is being downloaded — AI summaries will appear once it finishes.`,
      };
    // Green only with a VERIFIED live connection: the Ollama snapshot must
    // have answered (o.reachable) AND the model must be installed.
    // No snapshot data or an unreachable server → yellow, never green.
    if (!o || !o.reachable)
      return {
        dot: "bg-amber-400",
        label: `AI · ${model} (offline)`,
        title:
          "Ollama server unreachable. Check that it is running — and on WSL/Docker hosts use http://127.0.0.1:11434 (not localhost) in Settings → AI.",
      };
    if (!o.modelInstalled)
      return {
        dot: "bg-amber-400",
        label: `AI · ${model} (download)`,
        title: `Model ${model} must be downloaded. It will be fetched automatically on first AI use — or download it now in Settings → AI.`,
      };
    if (o.modelLoaded)
      return {
        dot: "bg-emerald-400",
        label: `AI · ${model} loaded`,
        title: `AI active — ${model} is loaded in memory (Ollama).`,
      };
    return {
      dot: "bg-emerald-400",
      label: `AI · ${model}`,
      title: `AI active — Ollama is reachable and ${model} is installed (loaded into memory on first use).`,
    };
  }
  // Remote providers (OpenAI-compatible, Anthropic, MCP): green only when the
  // last live check PASSED (reachable === true), yellow when it failed,
  // pulsing yellow while the first check is still pending (null).
  const label = s.provider === "mcp" ? "AI · MCP" : `AI · ${s.provider}`;
  const sub = s.model ? ` · ${s.model}` : "";
  if (s.reachable === false)
    return {
      dot: "bg-amber-400",
      label: `${label}${sub} (offline)`,
      title: `${s.provider} endpoint not reachable — check the URL/key in Settings → AI.`,
    };
  if (s.reachable !== true)
    return {
      dot: "animate-pulse bg-amber-400",
      label: `${label}${sub} (checking…)`,
      title: "Checking the provider endpoint — the badge turns green once it answers.",
    };
  return {
    dot: "bg-emerald-400",
    label: label + sub,
    title: `AI active via ${s.provider} provider — endpoint is reachable.`,
  };
}

/** Top-nav badge showing whether AI is on, which model is loaded, and
 *  download progress. Polls /api/ai. Click through to Settings. */
export default function AiStatus() {
  const [s, setS] = useState<AIState | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/ai")
        .then((r) => r.json())
        .then((j: AIState) => {
          if (alive) setS(j);
        })
        .catch(() => {});
    load();
    const iv = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);
  const d = derive(s);
  return (
    <Link
      href="/settings"
      title={d.title}
      className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
    >
      <span className={`h-2 w-2 rounded-full ${d.dot}`} aria-hidden="true" />
      <span className="max-w-[220px] truncate font-medium">{d.label}</span>
    </Link>
  );
}