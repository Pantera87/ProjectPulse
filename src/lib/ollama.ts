/**
 * Ollama server client: installed/loaded model queries, downloads (with an
 * in-memory progress registry shared with the AI status UI), a curated
 * catalog of small models and hardware-fit hints.
 */
import os from "node:os";

const UA = "ProjectPulse/1.0";

function base(url: string): string {
  return url.replace(/\/+$/, "");
}

async function jget(url: string, path: string, timeoutMs = 10_000) {
  try {
    const res = await fetch(`${base(url)}${path}`, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      models?: { name: string }[];
      version?: string;
    };
  } catch {
    return null;
  }
}

/** Locally installed model names, or null when the server is unreachable. */
export async function ollamaInstalled(url: string): Promise<string[] | null> {
  const json = await jget(url, "/api/tags");
  return json ? (json.models ?? []).map((m) => m.name) : null;
}

/** Model names currently loaded in memory. Older Ollama versions have no
 *  /api/ps — those return null (treated as "unknown"). */
export async function ollamaLoaded(url: string): Promise<string[] | null> {
  try {
    const res = await fetch(`${base(url)}/api/ps`, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) return [];
    const json = (await res.json()) as { models?: { name: string }[] };
    return (json.models ?? []).map((m) => m.name);
  } catch {
    return null;
  }
}

export interface OllamaSnapshot {
  reachable: boolean;
  version: string | null;
  installed: string[];
  loaded: string[];
}

export async function ollamaSnapshot(url: string): Promise<OllamaSnapshot> {
  const [tags, ps, ver] = await Promise.all([
    ollamaInstalled(url),
    ollamaLoaded(url),
    jget(url, "/api/version"),
  ]);
  return {
    reachable: tags !== null,
    version: ver?.version ?? null,
    installed: tags ?? [],
    loaded: ps ?? [],
  };
}

/* ------------------------------------------------------------------ */
/* Downloads                                                           */
/* ------------------------------------------------------------------ */

export interface PullJob {
  name: string;
  status: "downloading" | "done" | "error";
  /** 0..1 */
  progress: number;
  startedAt: string;
  error: string | null;
}

const pulls = new Map<string, PullJob>();

export function getPullJobs(): Record<string, PullJob> {
  return Object.fromEntries(pulls);
}

/**
 * Start (or return an in-flight) background download of `name`. The pull
 * survives the HTTP request that started it; progress is exposed via
 * getPullJobs() for the UI.
 */
export function startPull(url: string, name: string): PullJob {
  const existing = pulls.get(name);
  if (existing && existing.status === "downloading") return existing;
  const job: PullJob = {
    name,
    status: "downloading",
    progress: 0,
    startedAt: new Date().toISOString(),
    error: null,
  };
  pulls.set(name, job);
  void (async () => {
    try {
      const res = await fetch(`${base(url)}/api/pull`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: name, stream: true }),
        signal: AbortSignal.timeout(30 * 60_000),
      });
      if (!res.ok || !res.body) throw new Error(`Ollama pull HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let p: { completed?: number; total?: number; status?: string; error?: string };
          try {
            p = JSON.parse(line);
          } catch {
            continue;
          }
          if (p.error) throw new Error(p.error);
          if (typeof p.completed === "number" && typeof p.total === "number" && p.total > 0)
            job.progress = Math.min(1, p.completed / p.total);
          if (p.status === "success") job.progress = 1;
        }
      }
      job.status = "done";
      job.progress = 1;
    } catch (e) {
      job.status = "error";
      const msg = e instanceof Error ? e.message : String(e);
      job.error = /fetch failed|ECONNREFUSED|ETIMEDOUT|aborted|timeout/i.test(msg)
        ? `Ollama server not reachable at ${base(url)} — is Ollama installed and running? (https://ollama.com/download)`
        : msg;
    }
  })();
  return job;
}

/* ------------------------------------------------------------------ */
/* Model catalog + hardware hints                                      */
/* ------------------------------------------------------------------ */

export interface CatalogModel {
  name: string;
  family: string;
  params: string;
  /** approximate download / weight size of the Q4_K_M build */
  q4GB: number;
  ctx: string;
  blurb: string;
}

export const CATALOG: CatalogModel[] = [
  { name: "qwen2.5:1.5b", family: "Qwen 2.5", params: "1.5B", q4GB: 1.0, ctx: "32k", blurb: "Default. Excellent short-text summarization; fast on almost any hardware." },
  { name: "llama3.2:1b", family: "Llama 3.2", params: "1B", q4GB: 0.8, ctx: "128k", blurb: "Lightest general-purpose model, very long context." },
  { name: "gemma2:2b", family: "Gemma 2", params: "2B", q4GB: 1.6, ctx: "8k", blurb: "Small and multilingual; fine for summaries, short context." },
  { name: "qwen2.5:3b", family: "Qwen 2.5", params: "3B", q4GB: 2.0, ctx: "32k", blurb: "Noticeably better quality than 1.5B at low cost." },
  { name: "llama3.2:3b", family: "Llama 3.2", params: "3B", q4GB: 2.0, ctx: "128k", blurb: "Solid mid-size model with a very long context window." },
  { name: "phi-4-mini", family: "Phi-4-mini", params: "3.8B", q4GB: 2.5, ctx: "128k", blurb: "Punches above its weight on reasoning and summarization." },
  { name: "qwen2.5:7b", family: "Qwen 2.5", params: "7B", q4GB: 4.7, ctx: "32k", blurb: "Best local quality for most use; needs ~6 GB free RAM." },
  { name: "llama3.1:8b", family: "Llama 3.1", params: "8B", q4GB: 4.9, ctx: "128k", blurb: "Strong all-rounder with a long context window." },
  { name: "gemma2:9b", family: "Gemma 2", params: "9B", q4GB: 5.4, ctx: "8k", blurb: "High quality, but short context and the heaviest download here." },
];

/** Total system RAM in GB. */
export function systemRamGB(): number {
  return os.totalmem() / 1e9;
}

/**
 * Hardware-fit hint for a model on this server. Node cannot read GPU/VRAM,
 * so hints are based on system RAM: weights (Q4) + ~1.5 GB for context and
 * runtime overhead.
 */
export function hardwareHint(model: CatalogModel): { label: string; tone: "good" | "ok" | "bad" } {
  const ram = systemRamGB();
  const need = model.q4GB + 1.5;
  if (ram >= need * 3)
    return {
      label: `fits comfortably (~${need.toFixed(1)} GB of ${ram.toFixed(0)} GB RAM) — fast, even on CPU`,
      tone: "good",
    };
  if (ram >= need * 1.6)
    return {
      label: `works here (~${need.toFixed(1)} GB of ${ram.toFixed(0)} GB RAM) — expect a few seconds per summary`,
      tone: "ok",
    };
  return {
    label: `tight on this hardware (~${need.toFixed(1)} GB needed, ${ram.toFixed(0)} GB RAM) — a smaller model or GPU is recommended`,
    tone: "bad",
  };
}