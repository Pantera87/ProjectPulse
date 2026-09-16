import type Database from "better-sqlite3";
import type { SourceRow } from "./db";
import { checkWebsite } from "./checkers/website";
import { checkGithub } from "./checkers/github";
import { checkRss } from "./checkers/rss";
import { getDb } from "./db";
import type { CheckResult } from "./checkers/website";

/** Run the appropriate checker for a source row. */
export async function checkSource(
  d: Database.Database,
  source: SourceRow
): Promise<CheckResult> {
  switch (source.type) {
    case "website":
      return checkWebsite(d, source);
    case "github":
      return checkGithub(d, source);
    case "rss":
      return checkRss(d, source);
    default:
      return { ok: false, changed: false, updatesCreated: 0, error: "Unknown type" };
  }
}

export async function checkSourceById(id: number): Promise<CheckResult> {
  const d = getDb();
  const row = d.prepare("SELECT * FROM sources WHERE id = ?").get(id) as
    | SourceRow
    | undefined;
  if (!row)
    return { ok: false, changed: false, updatesCreated: 0, error: "Source not found" };
  return checkSource(d, row);
}

export function isMuted(s: SourceRow): boolean {
  if (!s.muted_until) return false;
  return new Date(s.muted_until).getTime() > Date.now();
}

export function isDue(s: SourceRow): boolean {
  if (!s.watch_enabled) return false;
  if (isMuted(s)) return false;
  if (!s.last_checked_at) return true;
  const next =
    new Date(s.last_checked_at).getTime() + s.check_interval_hours * 3600_000;
  return Date.now() >= next;
}
