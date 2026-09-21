import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type SourceType = "website" | "github" | "rss";
export type Priority = "critical" | "high" | "normal";
export type UpdateKind =
  | "content_change"
  | "release"
  | "readme"
  | "commit"
  | "milestone"
  | "issue"
  | "feed_entry"
  | "keyword";

export interface WatchRule {
  id: string;
  priority: Priority;
  keywords: string[];
  /** which source types to scan: content, releases, readme, commits, feed, tags */
  sources: string[];
  negate?: string[];
  /** GitHub issue/PR labels to watch (github sources only) */
  labels?: string[];
}

export interface SourceRow {
  id: number;
  type: SourceType;
  url: string;
  name: string | null;
  goal: string | null;
  /** How the goal was set: "ai" | "auto" | "user" (null = legacy/unknown) */
  goal_source: string | null;
  /** Generic category level — broad domain/family (e.g. "cnc") */
  category: string | null;
  /** Specific subcategory under it (e.g. "cnc-controller-firmware") */
  subcategory: string | null;
  /** How the category was assigned: "ai" | "heuristic" | "user" (null = legacy/unknown) */
  category_source: string | null;
  /** How the subcategory was assigned: "ai" | "user" (null = legacy/unknown) */
  subcategory_source: string | null;
  notes: string | null;
  watch_enabled: number;
  check_interval_hours: number;
  last_checked_at: string | null;
  last_content_hash: string | null;
  last_error: string | null;
  muted_until: string | null;
  rules_json: string;
  state_json: string;
  created_at: string;
  /** repo avatar / project logo, relative to DATA_DIR (github sources) */
  logo: string | null;
  /** AI-generated summary of what the project is (set on add / first check) */
  project_summary: string | null;
  /** Per-project AI summary length override (short/medium/long; null = follow global) */
  summary_size: string | null;
  /** Track every new release without keywords (1/0, default 1, github) */
  track_releases: number;
  /** Track README changes without keywords (1/0, default 0, github) */
  track_readme: number;
  /** Track every new commit without keywords (1/0, default 0, github) */
  track_commits: number;
}

export interface SnapshotRow {
  id: number;
  source_id: number;
  version: number;
  fetched_at: string;
  html: string;
  content_hash: string;
  title: string | null;
  /** rendered PNG screenshot, relative to DATA_DIR (nullable for old rows) */
  screenshot: string | null;
  /**
   * Self-contained copy of the page: archived HTML with asset URLs rewritten
   * to local /api/sources/<id>/archive URLs (stored compressed, like `html`).
   * null when no offline archive was captured.
   */
  html_local: string | null;
}

export interface UpdateRow {
  id: number;
  source_id: number;
  priority: Priority;
  kind: UpdateKind;
  title: string;
  summary: string | null;
  url: string | null;
  payload_json: string;
  created_at: string;
  read_at: string | null;
}

export interface SourceState {
  seen_tags?: string[];
  seen_milestones?: Record<string, boolean>; // id -> was open
  seen_issues?: string[];
  seen_feed_ids?: string[];
  readme_matched?: Record<string, boolean>;
  prev_tag?: string;
  /** Website: auto-discovered RSS/Atom feed checked instead of page scraping */
  feed_url?: string;
  feed_discovery_done?: boolean;
  /** Consecutive feed-check failures (feed dropped + re-discovered at 3) */
  feed_fails?: number;
  /** Hash of the GitHub releases Atom feed (cheap idle-cycle pre-check) */
  prev_release_feed_hash?: string;
  /** "ok" | "missing" — last known state of the releases Atom feed */
  release_feed_status?: string;
  /** Hash of the README text (keywordless "README changed" tracking) */
  readme_hash?: string;
  /** Hash of the repo page main text (offline repo-page snapshots) */
  page_hash?: string;
  /** Last README text, capped — for diffing on README change tracking */
  readme_text?: string;
  /** SHAs of already-reported commits (keywordless commit tracking) */
  seen_commit_shas?: string[];
  [k: string]: unknown;
}

export function dataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), "data");
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "projectpulse.db");
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  // WAL + NORMAL: correct under WAL, and skips the extra full-disk sync per
  // write (FULL) — fewer disk wakeups on an always-on machine.
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      url TEXT NOT NULL,
      name TEXT,
      goal TEXT,
      category TEXT,
      notes TEXT,
      watch_enabled INTEGER NOT NULL DEFAULT 1,
      check_interval_hours REAL NOT NULL DEFAULT 6,
      last_checked_at TEXT,
      last_content_hash TEXT,
      last_error TEXT,
      muted_until TEXT,
      rules_json TEXT NOT NULL DEFAULT '[]',
      state_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(type);

    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      fetched_at TEXT NOT NULL,
      html TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      title TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_source ON snapshots(source_id, version);

    CREATE TABLE IF NOT EXISTS updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      priority TEXT NOT NULL DEFAULT 'normal',
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      url TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      read_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_updates_read ON updates(read_at);
    CREATE INDEX IF NOT EXISTS idx_updates_created ON updates(created_at);

    CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
      kind, ref_id, title, body, tokenize="porter unicode61"
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS notification_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,
      channel_type TEXT NOT NULL,
      update_id INTEGER,
      priority TEXT,
      status TEXT NOT NULL,
      error TEXT,
      attempts INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notification_log_created ON notification_log(created_at);

    -- AI-picked icon per category (curated Iconify "Glyphs" name, see
    -- src/lib/glyphs.generated.ts). One row per category slug; the keyword/
    -- hash fallback in category-icon.tsx applies when a category has no row.
    CREATE TABLE IF NOT EXISTS categories (
      category TEXT PRIMARY KEY,
      icon TEXT NOT NULL
    );
  `);
  // Columns added after initial release — guard for existing databases.
  addColumnIfMissing(d, "snapshots", "screenshot", "TEXT");
  addColumnIfMissing(d, "sources", "logo", "TEXT");
  addColumnIfMissing(d, "sources", "project_summary", "TEXT");
  addColumnIfMissing(d, "sources", "subcategory", "TEXT");
  addColumnIfMissing(d, "sources", "category_source", "TEXT");
  addColumnIfMissing(d, "sources", "subcategory_source", "TEXT");
  addColumnIfMissing(d, "sources", "goal_source", "TEXT");
  // Keywordless change-tracking toggles (github sources).
  addColumnIfMissing(d, "sources", "track_releases", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfMissing(d, "sources", "track_readme", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(d, "sources", "track_commits", "INTEGER NOT NULL DEFAULT 0");
  // Per-project AI summary length override (null = follow the global setting).
  addColumnIfMissing(d, "sources", "summary_size", "TEXT");
  // Self-contained archived HTML of a snapshot (offline view, compressed).
  addColumnIfMissing(d, "snapshots", "html_local", "TEXT");
  // One-time backfill: index existing updates into the FTS search table so
  // they become searchable (new updates are indexed at insert time).
  if (getSetting(d, "fts_update_backfill_v1") !== "1") {
    d.prepare(`DELETE FROM search_index WHERE kind = 'update'`).run();
    const rows = d
      .prepare(`SELECT id, title, COALESCE(summary, '') AS summary FROM updates`)
      .all() as { id: number; title: string; summary: string }[];
    const ins = d.prepare(
      `INSERT INTO search_index (kind, ref_id, title, body) VALUES ('update', ?, ?, ?)`
    );
    d.transaction(() => {
      for (const r of rows) ins.run(r.id, r.title, r.summary);
    })();
    setSetting(d, "fts_update_backfill_v1", "1");
  }
}

export function getSetting(d: Database.Database, key: string): string | null {
  const row = d
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(d: Database.Database, key: string, value: string | null) {
  if (value === null || value === "") {
    d.prepare("DELETE FROM settings WHERE key = ?").run(key);
  } else {
    d.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(key, value);
  }
}

function addColumnIfMissing(
  d: Database.Database,
  table: string,
  column: string,
  definition: string
) {
  const cols = d
    .prepare(`PRAGMA table_info(${table})`)
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    d.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
