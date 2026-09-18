import { NextResponse } from "next/server";
import { aiActivity } from "@/lib/ai-activity";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai/activity — live AI work + engine health for the UI.
 *
 * `busy/active/labels/startedAt`: which AI calls are in flight right now
 * (the nav ring + disabling the check buttons). `failures/lastError…`:
 * recent engine health from real calls (the status badge).
 */
export function GET() {
  return NextResponse.json(aiActivity());
}
