import { createPatch } from "diff";
import type Database from "better-sqlite3";
import type { SourceRow } from "../db";
import {
  hashText,
  parseHtml,
  normalizeForHash,
  extractGoalFromPage,
  truncate,
  compressHtml,
  readHtml,
} from "../text";
import { findRuleHitSmart } from "../rules";
import { getAI } from "../ai";
import { fetchText } from "../http";
import { captureScreenshot } from "../screenshots";
import { archivePageHtml } from "../archive";
import {
  insertUpdate,
  indexForSearch,
  maxSnapshotVersion,
  pruneSnapshots,
  rulesOf,
  snapshotMode,
  stateOf,
  touchSource,
  higherPriority,
} from "../models";
import { notify } from "../notifiers";
import { checkFeedUrl } from "./rss";
import { discoverWebsiteFeed } from "../feed";

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
  const state = stateOf(source);
  // Whether a snapshot is still actually stored — the user may have deleted
  // them all, in which case the next check silently re-stores a fresh
  // baseline copy (no change update is raised for it).
  const rebaseline = !firstCheck && maxSnapshotVersion(d, source.id) === 0;

  // --- Fast path: auto-discovered RSS/Atom feed. Once the baseline exists,
  // the feed is checked instead of re-scraping the page every cycle; the
  // page hash is preserved so a fallback scrape (feed died) can still
  // compare against it.
  if (!firstCheck && state.feed_url) {
    // Persist state first — checkFeedUrl re-reads the row and would
    // otherwise overwrite it with the stale state.
    touchSource(d, source.id, { state_json: JSON.stringify(state) });
    const result = await checkFeedUrl(d, source, state.feed_url, {
      skipPageHash: true,
      skipSnapshot: true,
    });
    if (result.ok) return result;
    // Feed unreachable/broken: count the failure, drop it after 3 in a row
    // (re-arming discovery), and fall through to a full page check.
    state.feed_fails = (state.feed_fails ?? 0) + 1;
    if (state.feed_fails >= 3) {
      state.feed_url = undefined;
      state.feed_fails = 0;
      state.feed_discovery_done = false;
    }
  }

  // --- Feed discovery (runs once per source; also backfills existing
  // sources on their next check; re-armed when a feed dies).
  if (!firstCheck && !state.feed_discovery_done) {
    try {
      const feedUrl = await discoverWebsiteFeed(source.url);
      state.feed_discovery_done = true;
      if (feedUrl) {
        state.feed_url = feedUrl;
        state.feed_fails = 0;
      }
    } catch {
      // leave discovery open — retried on the next check
    }
  }

  if (!firstCheck && !rebaseline && newHash === source.last_content_hash) {
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
      state_json: JSON.stringify(state),
      last_error: null,
    });
    return { ok: true, changed: false, updatesCreated: 0 };
  }

  // Fetch the previous snapshot BEFORE inserting the new one
  const prev = d
    .prepare(
      `SELECT html FROM snapshots WHERE source_id = ? ORDER BY version DESC LIMIT 1`
    )
    .get(source.id) as { html: unknown } | undefined;

  // Store new snapshot version (storage mode: full / html / screenshot)
  const version = maxSnapshotVersion(d, source.id) + 1;
  const mode = snapshotMode(d);
  let htmlLocal: string | null = null;
  if (mode === "full") {
    // Best-effort offline archive: page + referenced assets with local URLs.
    try {
      htmlLocal = await archivePageHtml(html, source.url, source.id, version);
    } catch {
      htmlLocal = null;
    }
  }
  d.prepare(
    `INSERT INTO snapshots (source_id, version, fetched_at, html, content_hash, title, html_local)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    source.id,
    version,
    new Date().toISOString(),
    mode === "screenshot" ? null : compressHtml(html),
    newHash,
    page.title || null,
    htmlLocal ? compressHtml(htmlLocal) : null
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

  if (!firstCheck && !rebaseline) {
    const prevPage = prev ? parseHtml(readHtml(prev.html)) : null;
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
    // (keyword pass; an AI semantic second pass runs when no keyword hits,
    // over the full page text via RAG when the provider supports it).
    const rules = rulesOf(source);
    const hit = await findRuleHitSmart(
      rules,
      "content",
      [
        { kind: "content", text: addedLines.join("\n") },
        { kind: "content", text: normalized },
      ],
      getAI(),
      [{ name: "page.txt", content: normalized }]
    );

    let priority = hit ? hit.priority : "normal";
    const name = source.name || page.title || source.url;

    // Optional AI summary + importance classification of the change. For
    // semantic topic matches the match explanation takes precedence over the
    // generic change summary.
    const ai = getAI();
    let summary: string | null =
      addedLines.slice(0, 8).join(" | ") || "Page content changed";
    let summarySource: string | null = null;
    const aiSummary = await ai.summarizeUpdate(diffText, name);
    if (aiSummary) {
      summary = aiSummary.summary;
      summarySource = "ai";
      priority = higherPriority(priority, aiSummary.priority);
    }
    if (hit?.semantic && hit.semanticSummary) {
      summary = hit.semanticSummary;
      summarySource = "ai";
    }

    const id = insertUpdate(d, {
      source_id: source.id,
      priority,
      kind: hit ? "keyword" : "content_change",
      title: hit
        ? hit.semantic
          ? hit.semanticTopic
            ? `Topic match: ${name} — ${hit.semanticTopic}`
            : `AI topic match: ${name}`
          : `Keyword "${hit.matched.join(", ")}" detected: ${name}`
        : `Page updated: ${name}`,
      summary: truncate(summary, 1000),
      url: source.url,
      payload: {
        diff: truncate(diffText, 5000),
        added: addedLines.slice(0, 30),
        removed: removedLines.slice(0, 30),
        snapshotVersion: version,
        semantic: !!hit?.semantic,
        semanticTopic: hit?.semanticTopic ?? null,
        semanticSummary: hit?.semanticSummary ?? null,
        summarySource,
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

  // Goal backfill on first check. (Category/subcategory backfill happens in
  // check.ts after the check — missing levels only, never overwritten.)
  if (!source.goal) {
    let goal = extractGoalFromPage(page);
    let goalSource: string | null = null;
    const ai = getAI();
    if (!page.metaDescription) {
      // Full page text as a RAG document where supported (short in-prompt
      // anchor otherwise).
      const aiGoal = await ai.extractGoal(page.text, [
        { name: "page.txt", content: page.text },
      ]);
      if (aiGoal) {
        goal = aiGoal;
        goalSource = "ai";
      }
    }
    touchSource(d, source.id, {
      goal: truncate(goal, 500),
      // Non-AI goals (meta description etc.) are plain auto-extraction.
      goal_source: goal ? goalSource ?? "auto" : null,
    });
  }

  touchSource(d, source.id, {
    last_checked_at: new Date().toISOString(),
    state_json: JSON.stringify(state),
    last_content_hash: newHash,
    last_error: null,
  });
  indexForSearch(d, "source", source.id, source.name || source.url, source.goal || page.title || "");

  return { ok: true, changed: !firstCheck && !rebaseline, updatesCreated };
}
