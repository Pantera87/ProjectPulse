import { NextResponse } from "next/server";
import { getDb, setSetting } from "@/lib/db";
import { pruneAllSnapshots, snapshotKeep } from "@/lib/models";

export const dynamic = "force-dynamic";

/** GET /api/settings/snapshot-keep → { keep } */
export function GET() {
  return NextResponse.json({ keep: snapshotKeep(getDb()) });
}

/** POST /api/settings/snapshot-keep { keep } — how many versions to keep. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { keep?: unknown };
  const keep = Number(body.keep);
  if (!Number.isInteger(keep) || keep < 1 || keep > 500) {
    return NextResponse.json(
      { error: "keep must be an integer between 1 and 500" },
      { status: 400 }
    );
  }
  const d = getDb();
  const old = snapshotKeep(d);
  setSetting(d, "snapshot_keep", String(keep));
  // Lowering the cap → drop the now-excess versions everywhere (with files).
  if (keep < old) pruneAllSnapshots(d);
  return NextResponse.json({ ok: true, keep });
}