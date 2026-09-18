import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import type {
  SourceRow,
  SourceState,
  WatchRule,
  Priority,
  UpdateKind,
  UpdateRow,
} from "./db";
import { getDb, getSetting, dataDir } from "./db";

const nowIso = () => new Date().toISOString();

const PRIORITY_RANK: Record<Priority, number> = { normal: 0, high: 1, critical: 2 };

/**
 * The more important of two priorities. Used so an AI importance
 * classification can only ever UPGRADE a priority — rule-assigned
 * (user-defined) and heuristic priorities are never downgraded.
 */
export function higherPriority(a: Priority, b: Priority): Priority {
  return PRIORITY_RANK[a] >= PRIORITY_RANK[b] ? a : b;
}

export function rulesOf(s: SourceRow): WatchRule[] {
  try {
    const r = JSON.parse(s.rules_json);
    return Array.isArray(r) ? (r as WatchRule[]) : [];
  } catch {
    return [];
  }
}

export function stateOf(s: SourceRow): SourceState {
  try {
    return JSON.parse(s.state_json) as SourceState;
  } catch {
    return {};
  }
}

export function insertUpdate(
  d: Database.Database,
  args: {
    source_id: number;
    priority: Priority;
    kind: UpdateKind;
    title: string;
    summary?: string | null;
    url?: string | null;
    payload?: unknown;
  }
): number {
  const info = d
    .prepare(
      `INSERT INTO updates (source_id, priority, kind, title, summary, url, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      args.source_id,
      args.priority,
      args.kind,
      args.title,
      args.summary ?? null,
      args.url ?? null,
      JSON.stringify(args.payload ?? {}),
      nowIso()
    );
  const id = Number(info.lastInsertRowid);
  // New updates are searchable via FTS from the moment they are created.
  indexForSearch(d, "update", id, args.title, args.summary ?? "");
  return id;
}

export function indexForSearch(
  d: Database.Database,
  kind: string,
  refId: number,
  title: string,
  body: string
) {
  d.prepare("DELETE FROM search_index WHERE kind = ? AND ref_id = ?").run(
    kind,
    String(refId)
  );
  d.prepare(
    "INSERT INTO search_index (kind, ref_id, title, body) VALUES (?, ?, ?, ?)"
  ).run(kind, String(refId), title, body);
}

export function maxSnapshotVersion(d: Database.Database, sourceId: number): number {
  const row = d
    .prepare("SELECT MAX(version) AS v FROM snapshots WHERE source_id = ?")
    .get(sourceId) as { v: number | null };
  return row.v ?? 0;
}

export const SNAPSHOT_KEEP = Number(process.env.SNAPSHOT_KEEP_VERSIONS) || 1;

/**
 * What a new snapshot stores.
 *  - "full": archived HTML with assets (photos, css, js) saved locally +
 *            the raw page (rich offline view)
 *  - "html": just the raw page HTML (no asset downloads)
 *  - "screenshot": only the rendered PNG (smallest)
 * Default: "full".
 */
export type SnapshotMode = "full" | "html" | "screenshot";
export const SNAPSHOT_MODES: SnapshotMode[] = ["full", "html", "screenshot"];

/** The configured snapshot storage mode (Settings → Snapshots). */
export function snapshotMode(d: Database.Database): SnapshotMode {
  const v = getSetting(d, "snapshot_mode");
  return (v && (SNAPSHOT_MODES as string[]).includes(v)) ? (v as SnapshotMode) : "full";
}

/**
 * How many snapshot versions to keep per source. Env var wins; otherwise the
 * "snapshot_keep" setting; default 1.
 */
export function snapshotKeep(d: Database.Database): number {
  const env = Number(process.env.SNAPSHOT_KEEP_VERSIONS);
  if (Number.isFinite(env) && env >= 1) return env;
  const s = Number(getSetting(d, "snapshot_keep"));
  return Number.isFinite(s) && s >= 1 ? Math.min(Math.floor(s), 500) : 1;
}

/** Remove the on-disk files (archived assets + screenshot) of one version. */
function removeSnapshotFiles(sourceId: number, version: number) {
  try {
    fs.rmSync(path.join(dataDir(), "archive", String(sourceId), `v${version}`), {
      recursive: true,
      force: true,
    });
    fs.rmSync(path.join(dataDir(), "screenshots", `${sourceId}-v${version}.png`), {
      force: true,
    });
  } catch {
    // best-effort
  }
}

/**
 * Keep only the newest `snapshotKeep(d)` versions of a source's snapshots.
 * Dropped versions' archived assets and screenshots are removed from disk.
 */
export function pruneSnapshots(d: Database.Database, sourceId: number) {
  const keep = snapshotKeep(d);
  const dropped = d
    .prepare(
      `SELECT version FROM snapshots WHERE source_id = ? AND version NOT IN (
         SELECT version FROM snapshots WHERE source_id = ? ORDER BY version DESC LIMIT ?
       )`
    )
    .all(sourceId, sourceId, keep) as { version: number }[];
  if (dropped.length === 0) return;
  const inList = dropped.map(() => "?").join(", ");
  d.transaction(() => {
    d.prepare(`DELETE FROM snapshots WHERE source_id = ? AND version IN (${inList})`).run(
      sourceId,
      ...dropped.map((r) => r.version)
    );
    for (const r of dropped) removeSnapshotFiles(sourceId, r.version);
  })();
}

/** Prune every source (run after the global keep-count is lowered). */
export function pruneAllSnapshots(d: Database.Database) {
  const rows = d
    .prepare("SELECT DISTINCT source_id FROM snapshots")
    .all() as { source_id: number }[];
  for (const r of rows) pruneSnapshots(d, r.source_id);
}

/**
 * Delete every snapshot of one source: rows + archived assets +
 * per-version screenshots. Returns the number of removed rows.
 */
export function deleteSnapshotsForSource(d: Database.Database, sourceId: number): number {
  const rows = d
    .prepare("SELECT version FROM snapshots WHERE source_id = ?")
    .all(sourceId) as { version: number }[];
  d.prepare("DELETE FROM snapshots WHERE source_id = ?").run(sourceId);
  try {
    fs.rmSync(path.join(dataDir(), "archive", String(sourceId)), {
      recursive: true,
      force: true,
    });
  } catch {
    // best-effort
  }
  for (const r of rows) {
    try {
      fs.rmSync(path.join(dataDir(), "screenshots", `${sourceId}-v${r.version}.png`), {
        force: true,
      });
    } catch {
      // best-effort
    }
  }
  return rows.length;
}

/**
 * Delete ALL snapshots of all sources: rows + the whole archive + per-version
 * screenshots. Returns the number of removed rows.
 */
export function deleteAllSnapshots(d: Database.Database): number {
  const rows = d
    .prepare("SELECT source_id, version FROM snapshots")
    .all() as { source_id: number; version: number }[];
  d.prepare("DELETE FROM snapshots").run();
  try {
    fs.rmSync(path.join(dataDir(), "archive"), { recursive: true, force: true });
  } catch {
    // best-effort
  }
  for (const r of rows) {
    try {
      fs.rmSync(path.join(dataDir(), "screenshots", `${r.source_id}-v${r.version}.png`), {
        force: true,
      });
    } catch {
      // best-effort
    }
  }
  return rows.length;
}

/**
 * AI summary length: "short" | "medium" | "long". Per-source override
 * (sources.summary_size) wins over the global "summary_size" setting;
 * default "medium".
 */
export type SummarySize = "short" | "medium" | "long";
export const SUMMARY_SIZES: SummarySize[] = ["short", "medium", "long"];

export function summarySizeFor(
  d: Database.Database,
  source: Pick<SourceRow, "summary_size">
): SummarySize {
  if (source.summary_size && (SUMMARY_SIZES as string[]).includes(source.summary_size))
    return source.summary_size as SummarySize;
  const g = getSetting(d, "summary_size");
  return (g && (SUMMARY_SIZES as string[]).includes(g)) ? (g as SummarySize) : "medium";
}

/** Max stored length of an AI project summary, per size. */
export function summaryCharCap(size: SummarySize): number {
  return size === "short" ? 300 : size === "long" ? 800 : 500;
}

const PATCHABLE = [
  "last_checked_at",
  "last_content_hash",
  "last_error",
  "state_json",
  "goal",
  "name",
  "category",
  "subcategory",
  "category_source",
  "watch_enabled",
  "check_interval_hours",
  "muted_until",
  "rules_json",
  "notes",
  "logo",
  "project_summary",
  "track_releases",
  "track_readme",
  "track_commits",
  "summary_size",
] as const;

export type PatchableSourceField = (typeof PATCHABLE)[number];

export function touchSource(
  d: Database.Database,
  id: number,
  patch: Partial<Record<PatchableSourceField, unknown>>
) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const k of PATCHABLE) {
    const v = patch[k];
    if (v === undefined) continue;
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  if (sets.length === 0) return;
  vals.push(id);
  d.prepare(`UPDATE sources SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
}

export function sourceToPlain(
  s: SourceRow
): Omit<SourceRow, "rules_json" | "state_json"> & {
  rules: WatchRule[];
  state: SourceState;
} {
  return {
    id: s.id,
    type: s.type,
    url: s.url,
    name: s.name,
    goal: s.goal,
    category: s.category,
    subcategory: s.subcategory,
    category_source: s.category_source,
    notes: s.notes,
    watch_enabled: s.watch_enabled,
    check_interval_hours: s.check_interval_hours,
    last_checked_at: s.last_checked_at,
    last_content_hash: s.last_content_hash,
    last_error: s.last_error,
    muted_until: s.muted_until,
    rules: rulesOf(s),
    state: stateOf(s),
    created_at: s.created_at,
    logo: s.logo,
    project_summary: s.project_summary,
    track_releases: s.track_releases,
    track_readme: s.track_readme,
    track_commits: s.track_commits,
    summary_size: s.summary_size,
  };
}

export function search(q: string): {
  sources: SourceRow[];
  updates: UpdateRow[];
} {
  const d = getDb();
  const safe = q.replace(/['"]/g, "").trim();
  const fts = `"${safe.replace(/"/g, "")}"`;
  const sources = d
    .prepare(
      `SELECT s.* FROM sources s WHERE s.name LIKE ? OR s.goal LIKE ? OR s.url LIKE ?`
    )
    .all(`%${safe}%`, `%${safe}%`, `%${safe}%`) as SourceRow[];
  let updates: UpdateRow[] = [];
  try {
    updates = d
      .prepare(
        `SELECT u.* FROM search_index si
         JOIN updates u ON u.id = si.ref_id
         WHERE si.kind = 'update' AND search_index MATCH ?
         ORDER BY u.created_at DESC LIMIT 50`
      )
      .all(fts) as UpdateRow[];
  } catch {
    // invalid fts query — ignore
  }
  return { sources, updates };
}
