import { getDb, getSetting } from "./db";

const API = "https://api.github.com";

/**
 * Rate-limit-aware GitHub REST client.
 *
 * Primary limits (docs.github.com → "Rate limits for the REST API"):
 * unauthenticated 60 req/h per IP, authenticated 5,000 req/h. The x-ratelimit-*
 * response headers are the authoritative source, so this module tracks
 * limit/remaining/reset from every response and, once the budget is
 * exhausted, stops firing requests until the window resets.
 *
 * Secondary limits (≤100 concurrent requests, ≤900 points/min, CPU time):
 * kept far below by capping in-flight requests at LIMITS.MAX_INFLIGHT and
 * spacing request starts LIMITS.MIN_SPACING_MS apart. On 403/429 we honour
 * `retry-after` / `x-ratelimit-reset` (else wait ≥60s for a secondary limit)
 * and retry with exponential backoff, max LIMITS.MAX_RETRIES times — a
 * genuine 403 (private repo, no token) is NOT a rate limit and is raised
 * immediately without retry.
 */

const LIMITS = {
  MAX_INFLIGHT: 5,
  MIN_SPACING_MS: 150,
  MAX_RETRIES: 3,
  REQUEST_TIMEOUT_MS: 30_000,
  SECONDARY_WAIT_MS: 60_000,
  RESET_BUFFER_MS: 2_000,
} as const;

interface RateBudget {
  /** Token the figures below were learned under (null = unauthenticated). */
  token: string | null;
  limit: number | null;
  remaining: number | null;
  /** Window reset, UTC epoch seconds. */
  reset: number | null;
  /** When the figures were last learned, ms epoch (null = no requests yet). */
  updatedAt: number | null;
}

interface GState {
  budget: RateBudget;
  inflight: number;
  lastStart: number;
  tail: Promise<void>;
}

function state(): GState {
  const g = globalThis as unknown as { __ppGithub?: GState };
  g.__ppGithub ??= {
    budget: { token: null, limit: null, remaining: null, reset: null, updatedAt: null },
    inflight: 0,
    lastStart: 0,
    tail: Promise.resolve(),
  };
  return g.__ppGithub;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Active personal access token: the Settings → GitHub value (stored in the
 * settings table) wins, the GITHUB_TOKEN env var is the fallback.
 */
export function githubToken(): string | null {
  try {
    const t = getSetting(getDb(), "github_token");
    if (t && t.trim()) return t.trim();
  } catch {
    // DB not ready yet (startup) — fall back to the env var.
  }
  const env = process.env.GITHUB_TOKEN;
  return env && env.trim() ? env.trim() : null;
}

/** Where the active token comes from (shown in the settings UI). */
export function githubTokenSource(): "settings" | "env" | null {
  try {
    if (getSetting(getDb(), "github_token")?.trim()) return "settings";
  } catch {
    // DB not ready — treat as env-only.
  }
  return process.env.GITHUB_TOKEN?.trim() ? "env" : null;
}

/** Refresh the tracked budget from a response's authoritative x-ratelimit-* headers. */
function updateBudget(h: Headers) {
  const s = state();
  const b = s.budget;
  const token = githubToken();
  if (b.token !== token) {
    // Budgets are per-identity — figures learned under another token (or
    // with none at all) are meaningless for the new one.
    b.token = token;
    b.limit = null;
    b.remaining = null;
    b.reset = null;
  }
  const limit = h.get("x-ratelimit-limit");
  if (limit) b.limit = Number(limit);
  const remaining = h.get("x-ratelimit-remaining");
  if (remaining !== null) b.remaining = Number(remaining);
  const reset = h.get("x-ratelimit-reset");
  if (reset) b.reset = Number(reset);
  b.updatedAt = Date.now();
}

/** Wait out the current window when the tracked budget is exhausted. */
async function budgetGate() {
  const s = state();
  const b = s.budget;
  if (b.token !== githubToken()) return; // stale budget for a different token
  if (b.remaining !== null && b.remaining <= 0 && b.reset) {
    const until = b.reset * 1000 + LIMITS.RESET_BUFFER_MS - Date.now();
    if (until > 0) await sleep(until);
  }
}

/**
 * Request-start gate: at most LIMITS.MAX_INFLIGHT concurrent requests, at
 * least LIMITS.MIN_SPACING_MS between starts, and no start while the primary
 * budget is exhausted (docs: do not retry until x-ratelimit-reset).
 */
function acquireSlot(): Promise<void> {
  const s = state();
  const task = s.tail.then(async () => {
    while (s.inflight >= LIMITS.MAX_INFLIGHT) await sleep(100);
    const gap = s.lastStart + LIMITS.MIN_SPACING_MS - Date.now();
    if (gap > 0) await sleep(gap);
    await budgetGate();
    s.lastStart = Date.now();
    s.inflight++;
  });
  s.tail = task.then(
    () => {},
    () => {}
  );
  return task;
}

function releaseSlot() {
  const s = state();
  s.inflight = Math.max(0, s.inflight - 1);
}

/** True when a 403/429 is a rate-limit response (not e.g. a private repo). */
async function isRateLimited(res: Response): Promise<boolean> {
  if (res.status === 429) return true;
  if (res.headers.get("retry-after") !== null) return true;
  if (res.headers.get("x-ratelimit-remaining") === "0") return true;
  const body = await res.text().catch(() => "");
  return /rate limit|abuse/i.test(body);
}

/** How long to wait before a rate-limit retry (docs → "Exceeding the rate limit"). */
function rateLimitWaitMs(h: Headers, attempt: number): number {
  const retryAfter = Number(h.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  const remaining = h.get("x-ratelimit-remaining");
  const reset = Number(h.get("x-ratelimit-reset"));
  if (remaining === "0" && Number.isFinite(reset) && reset > 0) {
    // Primary budget exhausted — do not retry before the window resets.
    return Math.max(0, reset * 1000 - Date.now()) + LIMITS.RESET_BUFFER_MS;
  }
  // Secondary limit without a hint: ≥60s, growing exponentially per retry.
  return LIMITS.SECONDARY_WAIT_MS * 2 ** attempt;
}

/** Gated fetch with rate-limit retries; resolves the (ok) Response. */
async function ghFetch(path: string, accept: string): Promise<Response> {
  const headers: Record<string, string> = {
    accept,
    "user-agent": "ProjectPulse",
    "x-github-api-version": "2022-11-28",
  };
  const token = githubToken();
  if (token) headers.authorization = `Bearer ${token}`;

  let attempt = 0;
  for (;;) {
    await acquireSlot();
    let res: Response;
    try {
      res = await fetch(`${API}${path}`, {
        headers,
        signal: AbortSignal.timeout(LIMITS.REQUEST_TIMEOUT_MS),
      });
    } finally {
      releaseSlot();
    }
    updateBudget(res.headers);

    if ((res.status === 403 || res.status === 429) && (await isRateLimited(res))) {
      if (attempt < LIMITS.MAX_RETRIES) {
        const waitMs = rateLimitWaitMs(res.headers, attempt);
        console.warn(
          `[github] rate limited on ${path} — retry ${attempt + 1}/${LIMITS.MAX_RETRIES} in ${Math.round(
            waitMs / 1000
          )}s`
        );
        attempt++;
        await sleep(waitMs);
        continue;
      }
      throw new Error(
        token
          ? "GitHub rate limit reached — retries exhausted until the rate-limit window resets"
          : "GitHub rate limit reached (60 req/h unauthenticated) — add a GitHub token in Settings → GitHub for 5,000 req/h"
      );
    }
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`);
    return res;
  }
}

async function gh<T>(path: string): Promise<T> {
  const res = await ghFetch(path, "application/vnd.github+json");
  return (await res.json()) as T;
}

export interface GhRepo {
  full_name: string;
  description: string | null;
  topics: string[];
  pushed_at: string;
  archived: boolean;
  stargazers_count: number;
  owner: { login: string; avatar_url: string };
}

export interface GhRelease {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  prerelease: boolean;
  published_at: string;
  html_url: string;
}

export interface GhMilestone {
  id: number;
  title: string;
  state: string;
  due_on: string | null;
  closed_issues: number;
  open_issues: number;
  html_url: string;
}

export interface GhIssue {
  number: number;
  title: string;
  state: string;
  labels: { name: string }[];
  html_url: string;
  created_at: string;
  /** Issue/PR body text (may be empty). */
  body?: string | null;
}

export interface GhCommit {
  sha: string;
  commit: { message: string; author?: { name?: string } };
  html_url: string;
}

export const github = {
  repo: (owner: string, repo: string) =>
    gh<GhRepo>(`/repos/${owner}/${repo}`),
  releases: (owner: string, repo: string, perPage = 10) =>
    gh<GhRelease[]>(`/repos/${owner}/${repo}/releases?per_page=${perPage}`),
  readme: async (owner: string, repo: string): Promise<string | null> => {
    try {
      const res = await ghFetch(
        `/repos/${owner}/${repo}/readme`,
        "application/vnd.github.raw+json"
      );
      return await res.text();
    } catch {
      return null;
    }
  },
  /**
   * README text AND its rendered blob URL (e.g.
   * https://github.com/{owner}/{repo}/blob/main/README.md) in one JSON call —
   * used by the keyword scan so a README match can link straight to the file
   * instead of the repo root.
   */
  readmeInfo: async (
    owner: string,
    repo: string
  ): Promise<{ text: string; htmlUrl: string | null } | null> => {
    try {
      const json = await gh<{
        content?: string;
        html_url?: string;
      }>(`/repos/${owner}/${repo}/readme`);
      if (!json.content) return null;
      return {
        text: Buffer.from(json.content, "base64").toString("utf8"),
        htmlUrl: json.html_url ?? null,
      };
    } catch {
      return null;
    }
  },
  milestones: (owner: string, repo: string) =>
    gh<GhMilestone[]>(`/repos/${owner}/${repo}/milestones?state=all&per_page=20`),
  issues: (owner: string, repo: string, labels: string) =>
    gh<GhIssue[]>(
      `/repos/${owner}/${repo}/issues?labels=${encodeURIComponent(
        labels
      )}&state=open&per_page=30`
    ),
  commits: (owner: string, repo: string, perPage = 30) =>
    gh<GhCommit[]>(`/repos/${owner}/${repo}/commits?per_page=${perPage}`),
};

/** Parse "owner/repo" or a full github URL into [owner, repo] or null. */
export function parseGithubRef(
  input: string
): [string, string] | null {
  const s = input.trim();
  const urlMatch = s.match(/github\.com[/:]([^/]+)\/([^/#?]+)/i);
  if (urlMatch) return [urlMatch[1], urlMatch[2].replace(/\.git$/, "")];
  const pair = s.match(/^[\w.-]+\/[\w.-]+$/);
  if (pair) return [s.split("/")[0], s.split("/")[1]];
  return null;
}

/* ------------------------------------------------------------------ */
/* Rate-limit status & token verification (Settings → GitHub)          */
/* ------------------------------------------------------------------ */

export interface GithubRateStatus {
  authenticated: boolean;
  tokenSource: "settings" | "env" | null;
  limit: number | null;
  remaining: number | null;
  /** Current window reset, UTC epoch seconds (null = not learned yet). */
  reset: number | null;
  /** When the figures were last learned, ms epoch (null = no requests yet). */
  updatedAt: number | null;
}

/** Tracked budget from response headers — no API call needed. */
export function githubRateLimitStatus(): GithubRateStatus {
  const b = state().budget;
  const token = githubToken();
  const current = b.token === token;
  return {
    authenticated: token !== null,
    tokenSource: githubTokenSource(),
    limit: current ? b.limit : null,
    remaining: current ? b.remaining : null,
    reset: current ? b.reset : null,
    updatedAt: current ? b.updatedAt : null,
  };
}

/**
 * Validate a token (or the current one) against GET /rate_limit, which does
 * NOT count against the primary rate limit — safe to call on demand.
 */
export async function verifyGithubToken(
  candidate?: string
): Promise<
  | { ok: true; login: string | null; limit: number | null; remaining: number | null; reset: number | null }
  | { ok: false; error: string }
> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "ProjectPulse",
    "x-github-api-version": "2022-11-28",
  };
  const token = (candidate ?? githubToken())?.trim();
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`${API}/rate_limit`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return {
        ok: false,
        error:
          res.status === 401 || res.status === 403
            ? "GitHub rejected this token"
            : `GitHub API ${res.status}`,
      };
    }
    const json = (await res.json()) as {
      login?: string;
      resources?: { core?: { limit: number; remaining: number; reset: number } };
    };
    const core = json.resources?.core;
    return {
      ok: true,
      login: json.login ?? null,
      limit: core?.limit ?? null,
      remaining: core?.remaining ?? null,
      reset: core?.reset ?? null,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
