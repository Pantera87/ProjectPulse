/**
 * Shared AI status-light logic — the single source of truth for BOTH the
 * top-nav badge (src/components/ai-status.tsx) and the Settings page dot
 * (src/components/ai-settings.tsx). Pure function, no server imports, so
 * client components can use it directly.
 */

export interface AiStatusOllama {
  reachable: boolean;
  version: string | null;
  installed: string[];
  loaded: string[];
  modelInstalled: boolean;
  modelLoaded: boolean;
  /** /api/show probe: model files resolvable without loading the model.
   *  null = probe unavailable (old Ollama / server offline) → check skipped. */
  modelIntact?: boolean | null;
  pulls: Record<string, { status: "downloading" | "done" | "error"; progress: number; error: string | null }>;
}

/** Shape of the /api/ai response (mirrors AIState in src/lib/ai.ts). */
export interface AiStatus {
  enabled: boolean;
  configured: boolean;
  envOff: boolean;
  userOverride: "on" | "off" | null;
  provider: string;
  model: string | null;
  reachable?: boolean | null;
  ollama?: AiStatusOllama;
  /** Engine health from REAL AI calls (recorded by the activity registry):
   *  failed calls in the last hour + the most recent error. */
  health?: {
    failures: number;
    lastSuccessAt: string | null;
    lastError: string | null;
    lastErrorAt: string | null;
  };
}

export interface AiStatusDisplay {
  dot: string;
  label: string;
  title: string;
}

/** 3+ failed AI calls within the last hour → the engine is broken even if
 *  the endpoint itself still answers (e.g. model OOM, bad model files).
 *  A SUCCESS recorded after the last failure means the engine recovered,
 *  so the badge returns to green as soon as calls succeed again (the
 *  failures only age out of the count after an hour). */
function healthBroken(
  h: AiStatus["health"]
): h is NonNullable<AiStatus["health"]> {
  if (!h || h.failures < 3) return false;
  // Both are ISO strings — lexicographic compare is chronological.
  if (h.lastSuccessAt && h.lastErrorAt && h.lastSuccessAt > h.lastErrorAt) return false;
  return true;
}

function healthTitle(h: NonNullable<AiStatus["health"]>): string {
  const when = h.lastErrorAt
    ? ` (last failure ${new Date(h.lastErrorAt).toLocaleTimeString()})`
    : "";
  return `${h.failures} AI calls failed in the last hour${when}${h.lastError ? ` — ${h.lastError}` : ""}. Check Settings → AI (model, URL, key); the badge returns to green when calls succeed again.`;
}

/** Map the live AI state to the status light (dot color + label + tooltip). */
export function deriveAiStatus(s: AiStatus | null): AiStatusDisplay {
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
    const model = s.model ?? "qwen3.5:4b";
    const pull = o?.pulls?.[model];
    if (pull && pull.status === "downloading")
      return {
        dot: "animate-pulse bg-sky-400",
        label: `AI · ${Math.round(pull.progress * 100)}%`,
        title: `Model ${model} is being downloaded — AI summaries will appear once it finishes.`,
      };
    // Green only with a VERIFIED live connection: the Ollama snapshot must
    // have answered (o.reachable) AND the model must be installed.
    // No snapshot data or an unreachable server → yellow, never green.
    if (!o || !o.reachable)
      return {
        dot: "bg-amber-400",
        label: "AI (offline)",
        title:
          "Ollama server unreachable. Open Settings → AI — the app can detect the address automatically, or check that the Ollama server is running.",
      };
    if (!o.modelInstalled)
      return {
        dot: "bg-amber-400",
        label: "AI (download)",
        title: `Model ${model} must be downloaded. It will be fetched automatically on first AI use — or download it now in Settings → AI.`,
      };
    // /api/show probe: the server answers but the model's files can no longer
    // be resolved (deleted or corrupted after install) — real calls will fail.
    if (o.modelIntact === false)
      return {
        dot: "bg-amber-400",
        label: "AI (model broken)",
        title: `Ollama answers but model ${model} cannot be resolved (files deleted or corrupted?). Re-download it in Settings → AI.`,
      };
    if (healthBroken(s.health))
      return {
        dot: "bg-amber-400",
        label: "AI (errors)",
        title: healthTitle(s.health!),
      };
    if (o.modelLoaded)
      return {
        dot: "bg-emerald-400",
        label: "AI loaded",
        title: `AI active — ${model} is loaded in memory (Ollama).`,
      };
    return {
      dot: "bg-emerald-400",
      label: "AI",
      title: `AI active — Ollama is reachable and ${model} is installed (loaded into memory on first use).`,
    };
  }
  // Remote providers (OpenAI-compatible, Anthropic, MCP): green only when the
  // last live check PASSED (reachable === true), yellow when it failed,
  // pulsing yellow while the first check is still pending (null).
  if (s.reachable === false)
    return {
      dot: "bg-amber-400",
      label: "AI (offline)",
      title: `${s.provider} endpoint not reachable — check the URL/key in Settings → AI.`,
    };
  if (s.reachable !== true)
    return {
      dot: "animate-pulse bg-amber-400",
      label: "AI (checking…)",
      title: "Checking the provider endpoint — the badge turns green once it answers.",
    };
  if (healthBroken(s.health))
    return {
      dot: "bg-amber-400",
      label: "AI (errors)",
      title: healthTitle(s.health!),
    };
  return {
    dot: "bg-emerald-400",
    label: "AI",
    title: `AI active via ${s.provider} provider${s.model ? ` (${s.model})` : ""} — endpoint is reachable.`,
  };
}