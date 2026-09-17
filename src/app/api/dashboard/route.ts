import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard — lightweight snapshot the client dashboard polls
 * every ~30 s: unread counts per priority, unread per category, and the
 * 10 most recent updates.
 */
export function GET() {
  const d = getDb();
  const counts = d
    .prepare(
      `SELECT
         SUM(CASE WHEN read_at IS NULL AND priority='critical' THEN 1 ELSE 0 END) AS critical,
         SUM(CASE WHEN read_at IS NULL AND priority='high' THEN 1 ELSE 0 END) AS high,
         SUM(CASE WHEN read_at IS NULL AND priority='normal' THEN 1 ELSE 0 END) AS normal,
         SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END) AS total
       FROM updates`
    )
    .get() as { critical: number | null; high: number | null; normal: number | null; total: number | null };

  const categoryUnread = new Map<string, number>(
    (
      d
        .prepare(
          `SELECT COALESCE(s.category, 'uncategorized') AS cat, COUNT(*) AS c
           FROM updates u JOIN sources s ON s.id = u.source_id
           WHERE u.read_at IS NULL GROUP BY cat`
        )
        .all() as { cat: string; c: number }[]
    ).map((r) => [r.cat, r.c])
  );

  const latest = d
    .prepare(
      `SELECT u.id, u.priority, u.kind, u.title, u.summary, u.url, u.created_at, u.read_at,
              s.name AS source_name, s.type AS source_type
       FROM updates u JOIN sources s ON s.id = u.source_id
       ORDER BY u.created_at DESC LIMIT 10`
    )
    .all();

  return NextResponse.json({
    counts: {
      critical: counts.critical ?? 0,
      high: counts.high ?? 0,
      normal: counts.normal ?? 0,
      total: counts.total ?? 0,
    },
    categoryUnread: Object.fromEntries(categoryUnread),
    latest,
  });
}