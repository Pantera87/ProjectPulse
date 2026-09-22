import { NextResponse } from "next/server";
import { search, sourceToPlain } from "@/lib/models";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=term
 * Full-text search over updates (FTS5) plus substring match on project
 * name/goal/url — mirrors the /search web page, for the Android app.
 */
export function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ sources: [], updates: [] });
  const { sources, updates } = search(q);
  return NextResponse.json({
    sources: sources.map((s) => sourceToPlain(s)),
    updates,
  });
}