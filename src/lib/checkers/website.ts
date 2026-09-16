import { createPatch } from "diff";
import type Database from "better-sqlite3";
import type { SourceRow } from "../db";
import {
  hashText,
  parseHtml,
  normalizeForHash,
  extractGoalFromPage,
  suggestCategory,
  truncate,
} from "../text";
import { findRuleHit } from "../rules";
import { getAI } from "../ai";
import { fetchText } from "../http";
import { captureScreenshot } from "../screenshots";
import {
  insertUpdate,
  indexForSearch,
  maxSnapshotVersion,
  pruneSnapshots,
  rulesOf,
  touchSource,
} from "../models";
import { notify } from "../notifiers";

export interface CheckResult {
  ok: boolean;
  changed: boolean;
  updatesCreated: number;
  error?: string;
}

/**
 * Website checker: fetch the page, snapshot it, detect content changes by
 * hash of normalized main text, apply keyword rules to the diff.
 *
 * First-ever check only stores a baseline snapshot (no update entry).
 */
export async function checkWebsite(
  d: Database.Database,
  source: SourceRow
): Promise<CheckResult> {
  let html: string;
  try {
    html = await fetchText(source.url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    touchSource(d, source.id, { last_checked_at: new Date().toISOString(), last_error: msg });
    return { ok: false, changed: false, updatesCreated: 0, error: msg };
  }

  const page = parseHtml(html);
  const normalized = normalizeForHash(page.text);
  const newHash = hashText(normalized);
  const firstCheck = !source.last_content_hash;

  if (!firstCheck && newHash === source.last_content_hash) {
    // Backfill a visual screenshot for the latest snapshot if missing
    // (e.g. first check after upgrading to the screenshot feature).
    const last = d
      .prepare(
        `SELECT version, screenshot FROM snapshots WHERE source_id = ? ORDER BY version DESC LIMIT 1`
      )
      .get(source.id) as { version: number; screenshot: string | null } | undefined;
    if (last && !last.screenshot) {
      const rel = `screenshots/${source.id}-v${last.version}.png`;
      if (await captureScreenshot(source.url, rel)) {
        d.prepare(`UPDATE snapshots SET screenshot = ? WHERE source_id = ? AND version = ?`).run(
          rel,
          source.id,
          last.version
        );
      }
    }
    touchSource(d, source.id, {
      last_checked_at: new Date().toISOString(),
      last_error: null,
    });
    return { ok: true, changed: false, updatesCreated: 0 };
  }

  // Fetch the previous snapshot BEFORE inserting the new one
  const prev = d
    .prepare(
      `SELECT html FROM snapshots WHERE source_id = ? ORDER BY version DESC LIMIT 1`
    )
    .get(source.id) as { html: string } | undefined;

  // Store new snapshot version
  const version = maxSnapshotVersion(d, source.id) + 1;
  d.prepare(
    `INSERT INTO snapshots (source_id, version, fetched_at, html, content_hash, title)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    source.id,
    version,
    new Date().toISOString(),
    html,
    newHash,
    page.title || null
  );
  pruneSnapshots(d, source.id);

  // Visual screenshot of the rendered page for this snapshot version (best-effort)
  const shotRel = `screenshots/${source.id}-v${version}.png`;
  if (await captureScreenshot(source.url, shotRel)) {
    d.prepare(`UPDATE snapshots SET screenshot = ? WHERE source_id = ? AND version = ?`).run(
      shotRel,
      source.id,
      version
    );
  }

  let updatesCreated = 0;

  if (!firstCheck) {
    const prevPage = prev ? parseHtml(prev.html) : null;
    const prevNorm = prevPage ? normalizeForHash(prevPage.text) : "";

    const diff = createPatch(
      "content",
      prevNorm,
      normalized,
      "before",
      "after",
      { context: 2 }
    );
    const addedLines = diff
      .split("\n")
      .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
      .map((l) => l.slice(1).trim())
      .filter(Boolean);
    const removedLines = diff
      .split("\n")
      .filter((l) => l.startsWith("-") && !l.startsWith("---"))
      .map((l) => l.slice(1).trim())
      .filter(Boolean);

    const diffText = truncate(diff, 8000);

    // Rule matching on newly added lines first, then full new text
    const rules = rulesOf(source);
    const hit =
      findRuleHit(rules, "content", [
        { kind: "content", text: addedLines.join("\n") },
      ]) ??
      findRuleHit(rules, "content", [{ kind: "content", text: normalized }]);

    const priority = hit ? hit.priority : "normal";
    const name = source.name || page.title || source.url;

    // Optional AI summary of the change
    const ai = getAI();
    let summary: string | null =
      addedLines.slice(0, 8).join(" | ") || "Page content changed";
    const aiSummary = await ai.summarize(diffText, name);
    if (aiSummary) summary = aiSummary;

    const id = insertUpdate(d, {
      source_id: source.id,
      priority,
      kind: hit ? "keyword" : "content_change",
      title: hit
        ? `Keyword "${hit.matched.join(", ")}" detected: ${name}`
        : `Page updated: ${name}`,
      summary: truncate(summary, 1000),
      url: source.url,
      payload: {
        diff: truncate(diffText, 5000),
        added: addedLines.slice(0, 30),
        removed: removedLines.slice(0, 30),
        snapshotVersion: version,
      },
    });
    updatesCreated++;

    const u = d
      .prepare("SELECT title, summary, url FROM updates WHERE id = ?")
      .get(id) as { title: string; summary: string | null } | undefined;
    void notify({
      id,
      title: String(u?.title ?? ""),
      summary: String(u?.summary ?? null),
      url: source.url,
      priority,
      kind: hit ? "keyword" : "content_change",
      sourceName: name,
      sourceUrl: source.url,
    });
  }

  // Goal / category backfill on first check
  if (!source.goal) {
    let goal = extractGoalFromPage(page);
    const ai = getAI();
    if (!page.metaDescription) {
      const aiGoal = await ai.extractGoal(page.text.slice(0, 3000));
      if (aiGoal) goal = aiGoal;
    }
    touchSource(d, source.id, { goal: truncate(goal, 500) });
    if (!source.category) {
      const cat = suggestCategory(goal);
      if (cat) touchSource(d, source.id, { category: cat });
    }
  }

  touchSource(d, source.id, {
    last_checked_at: new Date().toISOString(),
    last_content_hash: newHash,
    last_error: null,
  });
  indexForSearch(d, "source", source.id, source.name || source.url, source.goal || page.title || "");

  return { ok: true, changed: !firstCheck, updatesCreated };
}
