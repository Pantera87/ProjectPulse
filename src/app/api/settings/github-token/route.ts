import { NextResponse } from "next/server";
import { getDb, getSetting, setSetting } from "@/lib/db";
import { githubRateLimitStatus, verifyGithubToken } from "@/lib/github";

export const dynamic = "force-dynamic";

function maskToken(t: string): string {
  const clean = t.trim();
  if (!clean) return "";
  return clean.length <= 8 ? "••••" : `${clean.slice(0, 7)}••••`;
}

/**
 * GET /api/settings/github-token
 * → { set, masked, fromEnv, rateLimit } — the stored (masked) token and the
 * tracked primary rate-limit budget.
 */
export function GET() {
  const d = getDb();
  const settings = getSetting(d, "github_token");
  const env = process.env.GITHUB_TOKEN;
  return NextResponse.json({
    set: Boolean(settings?.trim()),
    masked: maskToken(settings ?? (env && env.trim() ? env : "")),
    fromEnv: !settings?.trim() && Boolean(env?.trim()),
    rateLimit: githubRateLimitStatus(),
  });
}

/**
 * POST /api/settings/github-token { token }
 * Save a personal access token — it is validated against GET /rate_limit
 * first (which does not count against the primary rate limit), so invalid
 * tokens are rejected before they are stored. An empty token clears the
 * saved value (the GITHUB_TOKEN env var, if set, still applies).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const d = getDb();
  if (!token) {
    setSetting(d, "github_token", null);
    return NextResponse.json({ ok: true, set: false });
  }
  const check = await verifyGithubToken(token);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }
  setSetting(d, "github_token", token);
  return NextResponse.json({
    ok: true,
    set: true,
    login: check.login,
    limit: check.limit,
    remaining: check.remaining,
    reset: check.reset,
  });
}