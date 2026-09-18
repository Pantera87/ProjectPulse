import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  deleteSnapshotsForSource,
  indexForSearch,
  SUMMARY_SIZES,
  touchSource,
} from "@/lib/models";
import { getAI } from "@/lib/ai";
import { requeueProjectSummaries } from "@/lib/project-summary";

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
    "subcategory",
    "notes",
    "watch_enabled",
    "check_interval_hours",
    "muted_until",
    "rules_json",
    "track_releases",
    "track_readme",
    "track_commits",
    "summary_size",
  ];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) patch[k] = body[k];
  }
  if (patch.watch_enabled !== undefined)
    patch.watch_enabled = patch.watch_enabled ? 1 : 0;
  for (const k of ["track_releases", "track_readme", "track_commits"]) {
    if (patch[k] !== undefined) patch[k] = patch[k] ? 1 : 0;
  }
  if (patch.muted_until === "clear") patch.muted_until = null;
  // Per-project AI summary length override (null/"" = follow global).
  if ("summary_size" in body) {
    const v = body.summary_size;
    patch.summary_size =
      v === null || v === "" ? null : (SUMMARY_SIZES as string[]).includes(String(v)) ? String(v) : (row as { summary_size: string | null }).summary_size;
  }
  // Manual category/subcategory edits count as user-set (no "guessed" badge).
  if (patch.category !== undefined || patch.subcategory !== undefined) {
    patch.category_source = "user";
  }
  touchSource(d, Number(id), patch);
  if (
    patch.name !== undefined ||
    patch.goal !== undefined ||
    patch.category !== undefined ||
    patch.subcategory !== undefined
  ) {
    indexForSearch(
      d,
      "source",
      Number(id),
      String(patch.name ?? (row as { name: string | null }).name ?? ""),
      `${patch.goal ?? (row as { goal: string | null }).goal ?? ""} ${
        patch.category ?? (row as { category: string | null }).category ?? ""
      } ${patch.subcategory ?? (row as { subcategory: string | null }).subcategory ?? ""}`
    );
  }
  // Summary length changed → regenerate this source's summary in the background
  // (only when AI is enabled, so a stored summary is never lost).
  if (patch.summary_size !== undefined && getAI().enabled) {
    requeueProjectSummaries([Number(id)]);
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
  deleteSnapshotsForSource(d, Number(id)); // archived assets + screenshots
  const info = d.prepare("DELETE FROM sources WHERE id = ?").run(Number(id));
  if (info.changes === 0)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  d.prepare("DELETE FROM search_index WHERE kind = 'source' AND ref_id = ?").run(id);
  return NextResponse.json({ ok: true });
}
