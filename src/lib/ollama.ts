/**
 * Ollama server client: installed/loaded model queries, downloads (with an
 * in-memory progress registry shared with the AI status UI), a curated
 * catalog of small models and hardware-fit hints.
 */
import os from "node:os";
import fs from "node:fs";

const UA = "ProjectPulse/1.0";

function base(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Is the app running inside a Docker container? Decides the default Ollama
 * endpoint (bundled compose service vs. local host loopback).
 */
export function isDocker(): boolean {
  try {
    if (fs.existsSync("/.dockerenv")) return true;
    return /docker|containerd|kubepods|lxc/i.test(fs.readFileSync("/proc/1/cgroup", "utf8"));
  } catch {
    return false;
  }
}

/**
 * The Ollama endpoint to use when no explicit URL is configured:
 * the OLLAMA_URL env var wins; inside Docker that is the bundled `ollama`
 * service from docker-compose.yml; on a bare host, local loopback.
 * 127.0.0.1 (not localhost): on WSL/Docker hosts "localhost" can resolve to
 * ::1, where a port relay may answer without an Ollama behind it.
 */
export function defaultOllamaUrl(): string {
  return (
    process.env.OLLAMA_URL?.trim() ||
    (isDocker() ? "http://ollama:11434" : "http://127.0.0.1:11434")
  );
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

/** Server version string (e.g. "0.6.2"), or null when unreachable. */
export async function ollamaVersion(url: string): Promise<string | null> {
  const json = await jget(url, "/api/version");
  return json?.version ?? null;
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

/**
 * Normalize an Ollama model name for comparison: trim, lowercase, drop a
 * trailing ":latest" — so "qwen3.5", "qwen3.5:latest" and "Qwen3.5:Latest"
 * all refer to the same model.
 */
export function normalizeOllamaModel(name: string): string {
  const n = name.trim().toLowerCase();
  return n.endsWith(":latest") ? n.slice(0, -":latest".length) : n;
}

/**
 * Model-integrity probe: does Ollama resolve the model's files? Uses
 * POST /api/show (the endpoint is POST-only in every Ollama version — a GET
 * gets a 405 back, since the server sets HandleMethodNotAllowed), which reads
 * model metadata from disk WITHOUT loading the model into memory — so
 * keep_alive / auto-unload behavior is completely unaffected. The body uses
 * the long-standing `name` field (still accepted by current Ollama, which
 * also supports `model`).
 * Returns null when the probe cannot answer (server unreachable, or an old
 * Ollama without /api/show → the check is simply skipped), or false when the
 * server answered but the model is missing/corrupted.
 */
export async function ollamaModelInfo(url: string, name: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${base(url)}/api/show`, {
      method: "POST",
      headers: { "user-agent": UA, "content-type": "application/json" },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404 || res.status === 405) return null; // endpoint not implemented (old Ollama) or blocked by a proxy
    if (!res.ok) return false;
    res.body?.cancel().catch(() => {});
    return true;
  } catch {
    return null;
  }
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

/** Finished/errored jobs linger this long before leaving the registry. */
const PULL_JOB_TTL_MS = 15 * 60_000;

export function getPullJobs(): Record<string, PullJob> {
  // Prune stale finished jobs so the UI / aiState() don't accumulate
  // yesterday's "done" / "error" entries until process restart.
  const now = Date.now();
  for (const [name, job] of pulls) {
    if (job.status !== "downloading" && now - Date.parse(job.startedAt) > PULL_JOB_TTL_MS)
      pulls.delete(name);
  }
  return Object.fromEntries(pulls);
}

/** Delete an installed model from the Ollama server (frees the weights on
 *  disk). Ollama's endpoint: DELETE /api/delete with a JSON body. */
export async function ollamaDeleteModel(
  url: string,
  name: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${base(url)}/api/delete`, {
      method: "DELETE",
      headers: { "user-agent": UA, "content-type": "application/json" },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return { ok: false, error: `Ollama returned ${res.status} when deleting ${name}` };
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: /fetch failed|ECONNREFUSED|ETIMEDOUT|aborted|timeout/i.test(msg)
        ? `Ollama server not reachable at ${base(url)} — is Ollama running?`
        : msg,
    };
  }
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
      // The 30-minute AbortSignal.timeout fires as TimeoutError("signal
      // timed out") — a SLOW download, not a dead server (the generic
      // /timeout/ check below used to mislabel it "not reachable").
      if ((e instanceof Error && e.name === "TimeoutError") || /signal timed out/i.test(msg)) {
        job.error = `The download of ${name} timed out after 30 minutes (large model or slow connection) — start the pull again to resume.`;
      } else if (/fetch failed|ECONNREFUSED|ETIMEDOUT|aborted|timeout/i.test(msg)) {
        job.error = `Ollama server not reachable at ${base(url)} — is Ollama installed and running? (https://ollama.com/download)`;
      } else if (/does not exist|manifest/i.test(msg)) {
        job.error = `Ollama could not fetch ${name} ("${msg}"). This tag does not exist in the official registry — check the available tags at https://ollama.com/library, and upgrade Ollama if it is old (it may predate this model).`;
      } else {
        job.error = msg;
      }
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
  /** accuracy tier — the settings model list is grouped by this (power on top) */
  accuracy: "power" | "high" | "mid" | "low";
}

/** The model used everywhere (defaults, pre-pull, UI hints) unless the user
 *  chose another one in Settings. Plain tags are Ollama's standard Q4_K_M
 *  builds — e.g. qwen3.5:4b already IS the Q4_K_M quantization. */
export const DEFAULT_OLLAMA_MODEL = "qwen3.5:4b";

export const CATALOG: CatalogModel[] = [
  { name: "llama3.2:1b", family: "Llama 3.2", params: "1B", q4GB: 0.8, ctx: "128k", accuracy: "low", blurb: "Basic accuracy; lightest general-purpose model, very long context." },
  { name: "qwen3.5:0.8b", family: "Qwen 3.5", params: "0.8B", q4GB: 1.0, ctx: "256k", accuracy: "low", blurb: "Basic accuracy; fast on almost any hardware, excellent for quick short-text summarization." },
  { name: "qwen3.5:2b", family: "Qwen 3.5", params: "2B", q4GB: 2.7, ctx: "256k", accuracy: "low", blurb: "Basic accuracy; small and fast, with a very long context window." },
  { name: "phi4-mini", family: "Phi-4-mini", params: "3.8B", q4GB: 2.5, ctx: "128k", accuracy: "mid", blurb: "Moderately accurate; punches above its weight on reasoning and summarization." },
  { name: "qwen3.5:4b", family: "Qwen 3.5", params: "4B", q4GB: 3.4, ctx: "256k", accuracy: "mid", blurb: "Default. Best quality-to-size balance for CPU — a thinking model with a very long context window." },
  { name: "llama3.1:8b", family: "Llama 3.1", params: "8B", q4GB: 4.9, ctx: "128k", accuracy: "high", blurb: "Very accurate; strong all-rounder with a long context window." },
  { name: "qwen3.5:9b", family: "Qwen 3.5", params: "9B", q4GB: 6.6, ctx: "256k", accuracy: "high", blurb: "Very accurate; high-quality thinking model with a very long context window." },
  { name: "gemma4:12b", family: "Gemma 4", params: "12B", q4GB: 7.6, ctx: "256k", accuracy: "high", blurb: "Very accurate; strong multilingual model with a long context window." },
  { name: "gemma4:26b", family: "Gemma 4", params: "26B", q4GB: 19, ctx: "256k", accuracy: "power", blurb: "Power. MoE with ~3.8B active parameters — top quality here, but needs ~20 GB free RAM." },
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