import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createTwoFilesPatch } from "diff";
import { readHtml } from "@/lib/text";
import { deleteSnapshotsForSource } from "@/lib/models";

export const dynamic = "force-dynamic";

/**
 * GET /api/sources/:id/snapshots            → list of versions
 * GET /api/sources/:id/snapshots?version=N  → page of that version
 *   (self-contained offline copy when archived, otherwise raw HTML;
 *    add &raw=1 to force the raw HTML)
 * GET /api/sources/:id/snapshots?a=2&b=3    → text diff between versions
 * DELETE /api/sources/:id/snapshots         → delete all snapshots of this source
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
      .get(sourceId, a) as { html: unknown; version: number } | undefined;
    const newer = d
      .prepare("SELECT * FROM snapshots WHERE source_id = ? AND version = ?")
      .get(sourceId, b) as { html: unknown; version: number } | undefined;
    if (!older || !newer)
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    const patch = createTwoFilesPatch(
      `v${older.version}`,
      `v${newer.version}`,
      readHtml(older.html),
      readHtml(newer.html),
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
      .get(sourceId, Number(version)) as
      | { html: unknown; html_local: unknown }
      | undefined;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const raw = url.searchParams.get("raw") === "1";
    const html = raw
      ? readHtml(row.html)
      : readHtml(row.html_local) || readHtml(row.html);
    return new NextResponse(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const rows = d
    .prepare(
      `SELECT id, version, fetched_at, title,
         LENGTH(COALESCE(html_local, html)) AS size,
         html_local IS NOT NULL AS archived
       FROM snapshots
       WHERE source_id = ? ORDER BY version DESC`
    )
    .all(sourceId);
  return NextResponse.json({ snapshots: rows });
}

/** Delete every snapshot of this source (rows + archived assets). */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const removed = deleteSnapshotsForSource(getDb(), Number(id));
  return NextResponse.json({ ok: true, removed });
}
