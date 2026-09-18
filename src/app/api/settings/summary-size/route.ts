import { NextResponse } from "next/server";
import { getDb, getSetting, setSetting } from "@/lib/db";
import { SUMMARY_SIZES, type SummarySize } from "@/lib/models";
import { getAI } from "@/lib/ai";
import { requeueProjectSummaries } from "@/lib/project-summary";

export const dynamic = "force-dynamic";

/** GET /api/settings/summary-size → { size, saved } */
export function GET() {
  const d = getDb();
  const saved = getSetting(d, "summary_size");
  const size: SummarySize =
    saved && (SUMMARY_SIZES as string[]).includes(saved) ? (saved as SummarySize) : "medium";
  return NextResponse.json({ size, saved: saved ?? null });
}

/**
 * POST /api/settings/summary-size { size } — "short" | "medium" | "long".
 * When the size changes (and AI is enabled), all stored summaries are
 * regenerated in the background at the new size.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { size?: unknown };
  const size = body.size as SummarySize;
  if (!SUMMARY_SIZES.includes(size)) {
    return NextResponse.json(
      { error: 'size must be "short", "medium" or "long"' },
      { status: 400 }
    );
  }
  const d = getDb();
  const prev = getSetting(d, "summary_size");
  setSetting(d, "summary_size", size);
  if (prev !== size && getAI().enabled) {
    requeueProjectSummaries();
  }
  return NextResponse.json({ ok: true, size });
}