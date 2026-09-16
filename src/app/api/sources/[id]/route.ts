import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { indexForSearch, touchSource } from "@/lib/models";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const d = getDb();
  const row = d.prepare("SELECT * FROM sources WHERE id = ?").get(Number(id));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const snaps = d
    .prepare(
      `SELECT id, version, fetched_at, title, LENGTH(html) AS size FROM snapshots
       WHERE source_id = ? ORDER BY version DESC`
    )
    .all(Number(id));
  return NextResponse.json({ source: row, snapshots: snaps });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const d = getDb();
  const row = d.prepare("SELECT * FROM sources WHERE id = ?").get(Number(id));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as Record<string, unknown>;
  const allowed = [
    "name",
    "goal",
    "category",
    "notes",
    "watch_enabled",
    "check_interval_hours",
    "muted_until",
    "rules_json",
  ];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) patch[k] = body[k];
  }
  if (patch.watch_enabled !== undefined)
    patch.watch_enabled = patch.watch_enabled ? 1 : 0;
  if (patch.muted_until === "clear") patch.muted_until = null;
  touchSource(d, Number(id), patch);
  if (patch.name !== undefined || patch.goal !== undefined || patch.category !== undefined) {
    indexForSearch(
      d,
      "source",
      Number(id),
      String(patch.name ?? (row as { name: string | null }).name ?? ""),
      `${patch.goal ?? (row as { goal: string | null }).goal ?? ""} ${
        patch.category ?? (row as { category: string | null }).category ?? ""
      }`
    );
  }
  const updated = d
    .prepare("SELECT * FROM sources WHERE id = ?")
    .get(Number(id));
  return NextResponse.json({ source: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const d = getDb();
  const info = d.prepare("DELETE FROM sources WHERE id = ?").run(Number(id));
  if (info.changes === 0)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  d.prepare("DELETE FROM search_index WHERE kind = 'source' AND ref_id = ?").run(id);
  return NextResponse.json({ ok: true });
}
