/**
 * In-memory AI activity + health registry, shared across route modules and
 * Next.js hot reloads (globalThis — same pattern as __ppScheduler and
 *
 * Tracks two things:
 *   1. IN-FLIGHT AI WORK — every provider call goes through trackAIWork(),
 *      so the UI can show a "processing" ring while summaries,
 *      classifications or requeues are running, and keep the check buttons
 *      disabled until they finish (manual checks, check-all, scheduler,
 *      fire-and-forget background jobs alike).
 *   2. ENGINE HEALTH — success/failure of real AI calls within the last
 *      hour, recorded via recordAIResult() from the providers, where a null
 *      reply genuinely means the call failed. This registry is the only
 *      place where "the engine is broken" is observable. Never triggers
 *      work itself.
 */

const FAILURE_WINDOW_MS = 60 * 60_000; // count failures from the last hour
const MAX_FAILURES = 100;

interface Record {
  inFlight: number;
  labels: string[];
  firstAt: number | null;
  failures: number[]; // timestamps
  lastSuccessAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
}

const g = globalThis as unknown as { __ppAIActivity?: Record };

function rec(): Record {
  return (g.__ppAIActivity ??= {
    inFlight: 0,
    labels: [],
    firstAt: null,
    failures: [],
    lastSuccessAt: null,
    lastError: null,
    lastErrorAt: null,
  });
}

export interface AIActivity {
  /** True while at least one AI call is in flight. */
  busy: boolean;
  /** Number of in-flight AI calls. */
  active: number;
  /** Friendly labels of the in-flight calls. */
  labels: string[];
  /** ISO time the oldest in-flight call started (null when idle). */
  startedAt: string | null;
  /** Failed AI calls within the last hour. */
  failures: number;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

/** Snapshot of the registry (for API routes / the UI). */
export function aiActivity(): AIActivity {
  const r = rec();
  const now = Date.now();
  r.failures = r.failures.filter((t) => now - t < FAILURE_WINDOW_MS);
  return {
    busy: r.inFlight > 0,
    active: r.inFlight,
    labels: [...r.labels],
    startedAt: r.firstAt ? new Date(r.firstAt).toISOString() : null,
    failures: r.failures.length,
    lastSuccessAt: r.lastSuccessAt ? new Date(r.lastSuccessAt).toISOString() : null,
    lastError: r.lastError,
    lastErrorAt: r.lastErrorAt ? new Date(r.lastErrorAt).toISOString() : null,
  };
}

/**
 * Record the outcome of a REAL provider call in the engine-health part of
 * the registry (surfaced via aiState().health → the status badge). Call
 * this only where a null reply genuinely means the call failed — a
 * successful call whose answer is "no match" / "unknown" is a SUCCESS, not
 * a failure.
 */
export function recordAIResult(ok: boolean, error?: string): void {
  const r = rec();
  const now = Date.now();
  if (ok) {
    r.lastSuccessAt = now;
    return;
  }
  r.failures.push(now);
  if (r.failures.length > MAX_FAILURES) r.failures.splice(0, r.failures.length - MAX_FAILURES);
  r.lastError = error ?? "AI call failed";
  r.lastErrorAt = now;
}

/**
 * Run one AI call under IN-FLIGHT activity tracking (nav ring, check
 * buttons). The result is passed through unchanged; a thrown error is
 * recorded in the health registry and re-thrown.
 *
 * A null/undefined result is deliberately NOT a failure here: several
 * provider methods return null for a legitimate "no result" (the model
 * correctly answered "no match" / "unknown"). Real engine errors are
 * recorded at the provider level (BaseAI.trackedComplete in src/lib/ai.ts),
 * where a null reply genuinely means the call failed.
 */
export function trackAIWork<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const r = rec();
  r.inFlight += 1;
  r.labels.push(label);
  if (r.firstAt === null) r.firstAt = Date.now();
  const fail = (error: string) => recordAIResult(false, error);
  return fn().then(
    undefined,
    (e) => {
      fail(`AI call "${label}" failed: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  ).finally(() => {
    r.inFlight = Math.max(0, r.inFlight - 1);
    const i = r.labels.indexOf(label);
    if (i !== -1) r.labels.splice(i, 1);
    if (r.inFlight === 0) r.firstAt = null;
  });
}
