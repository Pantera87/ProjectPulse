import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createTwoFilesPatch } from "diff";

export const dynamic = "force-dynamic";

/**
 * GET /api/sources/:id/snapshots            → list of versions
 * GET /api/sources/:id/snapshots?version=N  → raw html of that version
 * GET /api/sources/:id/snapshots?a=2&b=3    → text diff between versions
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const d = getDb();
  const url = new URL(req.url);
  const sourceId = Number(id);

  if (url.searchParams.get("diff")) {
    const a = Number(url.searchParams.get("a") ?? 0);
    const b = Number(url.searchParams.get("b") ?? 0);
    const older = d
      .prepare("SELECT * FROM snapshots WHERE source_id = ? AND version = ?")
      .get(sourceId, a) as { html: string; version: number } | undefined;
    const newer = d
      .prepare("SELECT * FROM snapshots WHERE source_id = ? AND version = ?")
      .get(sourceId, b) as { html: string; version: number } | undefined;
    if (!older || !newer)
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    const patch = createTwoFilesPatch(
      `v${older.version}`,
      `v${newer.version}`,
      older.html,
      newer.html,
      "",
      "",
      { context: 3 }
    );
    return NextResponse.json({ a: a, b: b, patch });
  }

  const version = url.searchParams.get("version");
  if (version) {
    const row = d
      .prepare("SELECT * FROM snapshots WHERE source_id = ? AND version = ?")
      .get(sourceId, Number(version)) as { html: string } | undefined;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(row.html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const rows = d
    .prepare(
      `SELECT id, version, fetched_at, title, LENGTH(html) AS size FROM snapshots
       WHERE source_id = ? ORDER BY version DESC`
    )
    .all(sourceId);
  return NextResponse.json({ snapshots: rows });
}
