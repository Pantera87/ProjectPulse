import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/updates
 *   ?priority=critical|high|normal
 *   ?source_id=3
 *   ?kind=release
 *   ?unreadOnly=1
 *   ?window=7d          → digest mode: only last N days (1d/7d/30d)
 *   ?limit=50
 */
export function GET(req: Request) {
  const d = getDb();
  const url = new URL(req.url);
  const where: string[] = [];
  const vals: unknown[] = [];

  const priority = url.searchParams.get("priority");
  if (priority) {
    where.push("u.priority = ?");
    vals.push(priority);
  }
  const sourceId = url.searchParams.get("source_id");
  if (sourceId) {
    where.push("u.source_id = ?");
    vals.push(Number(sourceId));
  }
  const kind = url.searchParams.get("kind");
  if (kind) {
    where.push("u.kind = ?");
    vals.push(kind);
  }
  if (url.searchParams.get("unreadOnly") === "1") where.push("u.read_at IS NULL");

  const window = url.searchParams.get("window");
  if (window) {
    const days = Number(window.replace(/[a-d]/, "")) || 7;
    where.push("u.created_at >= datetime('now', ?)");
    vals.push(`-${days} days`);
  }

  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 500);
  const rows = d
    .prepare(
      `SELECT u.*, s.name AS source_name, s.url AS source_url, s.type AS source_type
       FROM updates u JOIN sources s ON s.id = u.source_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY
         CASE u.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
         u.created_at DESC
       LIMIT ?`
    )
    .all(...vals, limit);
  return NextResponse.json({ updates: rows });
}

/** POST /api/updates — mark many updates read: { ids: number[], read?: boolean } */
export async function POST(req: Request) {
  const d = getDb();
  const body = (await req.json()) as { ids?: number[]; read?: boolean };
  const ids = (body.ids ?? []).map(Number).filter(Boolean);
  if (ids.length === 0)
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  const read = body.read !== false;
  const now = read ? new Date().toISOString() : null;
  const ph = ids.map(() => "?").join(",");
  d.prepare(`UPDATE updates SET read_at = ? WHERE id IN (${ph})`).run(now, ...ids);
  return NextResponse.json({ ok: true, affected: ids.length });
}

/**
 * DELETE /api/updates — bulk delete. Optional filters: ?source_id=3,
 * ?read=1|0, ?olderThanDays=N. No params → deletes ALL updates.
 */
export function DELETE(req: Request) {
  const d = getDb();
  const url = new URL(req.url);
  const where: string[] = [];
  const vals: unknown[] = [];
  const sourceId = url.searchParams.get("source_id");
  if (sourceId) {
    where.push("source_id = ?");
    vals.push(Number(sourceId));
  }
  const read = url.searchParams.get("read");
  if (read === "1") where.push("read_at IS NOT NULL");
  else if (read === "0") where.push("read_at IS NULL");
  const olderThanDays = url.searchParams.get("olderThanDays");
  if (olderThanDays) {
    where.push("created_at < datetime('now', ?)");
    vals.push(`-${Number(olderThanDays) || 7} days`);
  }
  const info = d
    .prepare(`DELETE FROM updates ${where.length ? "WHERE " + where.join(" AND ") : ""}`)
    .run(...vals);
  return NextResponse.json({ ok: true, affected: info.changes });
}
