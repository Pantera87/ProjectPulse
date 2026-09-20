import { NextResponse } from "next/server";
import { getDb, setSetting } from "@/lib/db";
import { SNAPSHOT_MODES, snapshotMode, type SnapshotMode } from "@/lib/models";

export const dynamic = "force-dynamic";

/** GET /api/settings/snapshot-mode → { mode } */
export function GET() {
  return NextResponse.json({ mode: snapshotMode(getDb()) });
}

/**
 * POST /api/settings/snapshot-mode { mode }
 * "full" | "html" — what new snapshots store.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { mode?: unknown };
  const mode = body.mode as SnapshotMode;
  if (!SNAPSHOT_MODES.includes(mode)) {
    return NextResponse.json(
      { error: 'mode must be "full" or "html"' },
      { status: 400 }
    );
  }
  const d = getDb();
  setSetting(d, "snapshot_mode", mode);
  return NextResponse.json({ ok: true, mode });
}