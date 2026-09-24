import Database from "better-sqlite3";

/**
 * Whole-dashboard aggregates for the redesign's hero card + gauges +
 * 7-day chart. Read-only, no schema changes.
 */
export interface DashboardAggregates {
  /** Total updates ever stored. */
  totalUpdates: number;
  /** Updates marked as read. */
  readUpdates: number;
  /** All tracked sources. */
  sourcesTotal: number;
  /** Distinct sources with at least one update in the last 7 days. */
  sourcesUpdatedThisWeek: number;
  /** Updates created in the last 7 days (sum of activityTotalByDay). */
  updatesThisWeek: number;
  /** Updates created 7–14 days ago (for the week-over-week delta). */
  updatesPrevWeek: number;
  /** Per-day update counts, index 0 = 6 days ago … index 6 = today (UTC days). */
  activityTotalByDay: number[];
}

export function getDashboardAggregates(d: Database.Database): DashboardAggregates {
  const upd = d
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN read_at IS NOT NULL THEN 1 ELSE 0 END) AS read
       FROM updates`
    )
    .get() as { total: number; read: number | null };

  const src = d
    .prepare(`SELECT COUNT(*) AS total FROM sources`)
    .get() as { total: number };

  const week = d
    .prepare(
      `SELECT COUNT(DISTINCT source_id) AS sources, COUNT(*) AS updates
       FROM updates
       WHERE substr(created_at, 1, 10) >= date('now', '-6 day')`
    )
    .get() as { sources: number; updates: number };

  const dayRows = d
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS c
       FROM updates
       WHERE substr(created_at, 1, 10) >= date('now', '-6 day')
       GROUP BY day`
    )
    .all() as { day: string; c: number }[];

  // Same UTC day window as the per-source activity sparklines.
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date();
    dt.setUTCDate(dt.getUTCDate() - i);
    days.push(dt.toISOString().slice(0, 10));
  }
  const dayIndex = new Map(days.map((s, i) => [s, i] as const));
  const activityTotalByDay = [0, 0, 0, 0, 0, 0, 0];
  for (const r of dayRows) {
    const idx = dayIndex.get(r.day);
    if (idx !== undefined) activityTotalByDay[idx] = r.c;
  }

  const prevWeek = d
    .prepare(
      `SELECT COUNT(*) AS c
       FROM updates
       WHERE substr(created_at, 1, 10) >= date('now', '-13 day')
         AND substr(created_at, 1, 10) <= date('now', '-7 day')`
    )
    .get() as { c: number };

  return {
    totalUpdates: upd.total,
    readUpdates: upd.read ?? 0,
    sourcesTotal: src.total,
    sourcesUpdatedThisWeek: week.sources,
    updatesThisWeek: week.updates,
    updatesPrevWeek: prevWeek.c,
    activityTotalByDay,
  };
}
