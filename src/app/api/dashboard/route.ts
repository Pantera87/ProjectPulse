import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getDashboardAggregates } from "@/lib/dashboard-aggregates";

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

  // Newest update per source — the dashboard shows it on each source card
  // instead of static goal/summary text.
  const latestBySource = new Map<
    number,
    { id: number; kind: string; priority: string; title: string; created_at: string }
  >(
    (
      d
        .prepare(
          `SELECT source_id, id, kind, priority, title, created_at
           FROM updates
           WHERE id IN (SELECT MAX(id) FROM updates GROUP BY source_id)`
        )
        .all() as { source_id: number; id: number; kind: string; priority: string; title: string; created_at: string }[]
    ).map((r) => [r.source_id, { id: r.id, kind: r.kind, priority: r.priority, title: r.title, created_at: r.created_at }])
  );

  // Unread critical/high updates for the "Needs attention" triage strip.
  const attention = d
    .prepare(
      `SELECT u.id, u.priority, u.kind, u.title, u.url, u.created_at,
              s.name AS source_name, s.type AS source_type
       FROM updates u JOIN sources s ON s.id = u.source_id
       WHERE u.read_at IS NULL AND u.priority IN ('critical','high')
       ORDER BY u.priority ASC, u.created_at DESC LIMIT 6`
    )
    .all();

  // Per-source activity over the last 7 days (index 0 = 6 days ago, index 6 =
  // today) for the compact-card sparkline.
  const activityRows = d
    .prepare(
      `SELECT source_id, substr(created_at, 1, 10) AS day, COUNT(*) AS c
       FROM updates
       WHERE substr(created_at, 1, 10) >= date('now', '-6 day')
       GROUP BY source_id, day`
    )
    .all() as { source_id: number; day: string; c: number }[];
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date();
    dt.setUTCDate(dt.getUTCDate() - i);
    days.push(dt.toISOString().slice(0, 10));
  }
  const dayIndex = new Map(days.map((s, i) => [s, i] as const));
  const activityBySource: Record<string, number[]> = {};
  for (const r of activityRows) {
    const idx = dayIndex.get(r.day);
    if (idx === undefined) continue;
    (activityBySource[r.source_id] ??= [0, 0, 0, 0, 0, 0, 0])[idx] = r.c;
  }

  // Updates created since each source's last check (0 if never checked) —
  // the "+N since last check" badge on the dashboard source cards.
  const newsRows = d
    .prepare(
      `SELECT u.source_id, COUNT(*) AS c
       FROM updates u JOIN sources s ON s.id = u.source_id
       WHERE u.created_at > s.last_checked_at
       GROUP BY u.source_id`
    )
    .all() as { source_id: number; c: number }[];
  const newsSinceCheck: Record<number, number> = {};
  for (const r of newsRows) {
    newsSinceCheck[r.source_id] = r.c;
  }

  return NextResponse.json({
    counts: {
      critical: counts.critical ?? 0,
      high: counts.high ?? 0,
      normal: counts.normal ?? 0,
      total: counts.total ?? 0,
    },
    categoryUnread: Object.fromEntries(categoryUnread),
    latest,
    latestBySource: Object.fromEntries(latestBySource),
    activityBySource,
    newsSinceCheck,
    attention,
    aggregates: getDashboardAggregates(d),
  });
}