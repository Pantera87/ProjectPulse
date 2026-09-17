import type Database from "better-sqlite3";
import type {
  SourceRow,
  SourceState,
  WatchRule,
  Priority,
  UpdateKind,
  UpdateRow,
} from "./db";
import { getDb } from "./db";

const nowIso = () => new Date().toISOString();

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

export const SNAPSHOT_KEEP = Number(process.env.SNAPSHOT_KEEP_VERSIONS) || 10;

export function pruneSnapshots(d: Database.Database, sourceId: number) {
  d.prepare(
    `DELETE FROM snapshots WHERE source_id = ? AND version NOT IN (
       SELECT version FROM snapshots WHERE source_id = ? ORDER BY version DESC LIMIT ?
     )`
  ).run(sourceId, sourceId, SNAPSHOT_KEEP);
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
