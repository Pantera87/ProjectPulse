import type Database from "better-sqlite3";
import type { SourceRow } from "./db";
import { checkWebsite } from "./checkers/website";
import { checkGithub } from "./checkers/github";
import { checkRss } from "./checkers/rss";
import { getDb } from "./db";
import type { CheckResult } from "./checkers/website";
import { getAI } from "./ai";
import { summarizeProjectForSource } from "./project-summary";
import { categoryMirrorsName, ensureCategoryForSource } from "./category";

/** Run the appropriate checker for a source row. */
export async function checkSource(
  d: Database.Database,
  source: SourceRow
): Promise<CheckResult> {
  let result: CheckResult;
  switch (source.type) {
    case "website":
      result = await checkWebsite(d, source);
      break;
    case "github":
      result = await checkGithub(d, source);
      break;
    case "rss":
      result = await checkRss(d, source);
      break;
    default:
      return { ok: false, changed: false, updatesCreated: 0, error: "Unknown type" };
  }
  // Backfill the AI project summary when it's missing (e.g. AI was disabled
  // or the model still downloading when the source was added).
  if (result.ok && !source.project_summary) {
    try {
      await summarizeProjectForSource(d, source);
    } catch {
      // best-effort — retried on the next check
    }
  }
  // Category/subcategory backfill for all source types — fills only the
  // missing levels (category: AI first, keyword-hint heuristic as fallback;
  // subcategory: AI only) and upgrades keyword-guessed values once AI is
  // available. Also re-classifies values that simply echo the project name
  // (an invalid classification by a weak model). AI/user values are never
  // otherwise touched. Re-read the row so freshly written goal/summary are
  // seen.
  if (
    result.ok &&
    (!source.category ||
      !source.subcategory ||
      source.category_source === "heuristic" ||
      categoryMirrorsName(source))
  ) {
    try {
      const fresh = d
        .prepare("SELECT * FROM sources WHERE id = ?")
        .get(source.id) as SourceRow | undefined;
      if (
        fresh &&
        (!fresh.category ||
          !fresh.subcategory ||
          fresh.category_source === "heuristic" ||
          categoryMirrorsName(fresh))
      )
        await ensureCategoryForSource(d, fresh);
    } catch {
      // best-effort — retried on the next check
    }
  }
  return result;
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

/**
 * Populate ALL of a freshly added source's fields in ONE serialized pass —
 * never category-now and subcategory-later across separate jobs: a full
 * check (fetches the initial updates and the goal) → project summary
 * backfill → category/subcategory backfill, all awaited in order inside
 * checkSource. Right after adding, the first attempt can still come up
 * empty (the AI model may be loading/downloading, or the fetch hit a
 * transient error), so while fields are missing, retry twice more
 * (~30 s apart).
 */
export function enrichSourceInitially(id: number): void {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  void (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await checkSourceById(id);
      } catch {
        // best-effort — the next attempt (or the scheduler) retries
      }
      const row = getDb()
        .prepare("SELECT * FROM sources WHERE id = ?")
        .get(id) as SourceRow | undefined;
      if (!row) return;
      const complete =
        !!row.goal &&
        !!row.category &&
        !!row.subcategory &&
        !!row.project_summary;
      if (complete || attempt === 2 || !getAI().enabled) return;
      await sleep(30_000);
    }
  })();
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
