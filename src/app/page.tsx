import { getDb, type SourceRow } from "@/lib/db";
import { isMuted } from "@/lib/check";
import { categoryIconMap } from "@/lib/category-icons";
import DashboardClient from "@/components/dashboard-client";

export const dynamic = "force-dynamic";

/**
 * Dashboard (server data + interactive client shell). The server reads the
 * DB once and hands the snapshot to `DashboardClient`, which owns sorting /
 * grouping / filtering / collapse and live-polls /api/dashboard for fresh
 * unread counts and the recent feed.
 */
export default function DashboardPage() {
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
    .get() as {
    critical: number | null;
    high: number | null;
    normal: number | null;
    total: number | null;
  };

  const unreadBySource = new Map<number, number>(
    (
      d
        .prepare(
          `SELECT source_id, COUNT(*) AS c FROM updates WHERE read_at IS NULL GROUP BY source_id`
        )
        .all() as { source_id: number; c: number }[]
    ).map((r) => [r.source_id, r.c])
  );

  const sources = (
    d.prepare("SELECT * FROM sources ORDER BY id DESC").all() as SourceRow[]
  ).map((s) => ({
    ...s,
    unread: unreadBySource.get(s.id) ?? 0,
    muted: isMuted(s),
  }));

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
    .all() as never[];

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

  const attention = d
    .prepare(
      `SELECT u.id, u.priority, u.kind, u.title, u.url, u.created_at,
              s.name AS source_name, s.type AS source_type
       FROM updates u JOIN sources s ON s.id = u.source_id
       WHERE u.read_at IS NULL AND u.priority IN ('critical','high')
       ORDER BY u.priority ASC, u.created_at DESC LIMIT 6`
    )
    .all() as never[];

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
  const activityBySource: Record<number, number[]> = {};
  for (const r of activityRows) {
    const idx = dayIndex.get(r.day);
    if (idx === undefined) continue;
    (activityBySource[r.source_id] ??= [0, 0, 0, 0, 0, 0, 0])[idx] = r.c;
  }


  return (
    <DashboardClient
      initialCounts={{
        critical: counts.critical ?? 0,
        high: counts.high ?? 0,
        normal: counts.normal ?? 0,
        total: counts.total ?? 0,
      }}
      initialCategoryUnread={Object.fromEntries(categoryUnread)}
      initialLatest={latest}
      initialLatestBySource={Object.fromEntries(latestBySource)}
      initialActivity={activityBySource}
      initialAttention={attention}
      categoryIcons={categoryIconMap(d)}
      sources={sources}
    />
  );
}