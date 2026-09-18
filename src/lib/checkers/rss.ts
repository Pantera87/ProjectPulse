import type Database from "better-sqlite3";
import type { SourceRow } from "../db";
import { findRuleHitSmart } from "../rules";
import { getAI } from "../ai";
import {
  insertUpdate,
  indexForSearch,
  maxSnapshotVersion,
  pruneSnapshots,
  rulesOf,
  stateOf,
  touchSource,
} from "../models";
import { truncate, hashText, compressHtml } from "../text";
import { notify } from "../notifiers";
import { fetchFeed } from "../feed";
import type { CheckResult } from "./website";

export interface FeedCheckOpts {
  /**
   * Keep the source's existing `last_content_hash` untouched. Used by the
   * website "via feed" fast path, which must keep its *page* hash so a
   * fallback scrape can still compare against it.
   */
  skipPageHash?: boolean;
  /**
   * Don't store a feed XML snapshot. Websites keep their HTML snapshots for
   * the snapshot viewer; a feed XML blob there would be confusing.
   */
  skipSnapshot?: boolean;
}

/** Check an RSS/Atom source (the feed lives at the source's own URL). */
export async function checkRss(
  d: Database.Database,
  source: SourceRow
): Promise<CheckResult> {
  return checkFeedUrl(d, source, source.url);
}

/**
 * Check any RSS/Atom feed URL for new entries (state tracked in
 * `state_json.seen_feed_ids`). Shared by RSS sources and the website
 * "via feed" fast path, which reuses the exact same entry-matching logic
 * (keyword rules + AI semantic pass) as dedicated feeds.
 */
export async function checkFeedUrl(
  d: Database.Database,
  source: SourceRow,
  feedUrl: string,
  opts: FeedCheckOpts = {}
): Promise<CheckResult> {
  let xml: string;
  let entries: Awaited<ReturnType<typeof fetchFeed>>["items"];
  try {
    ({ xml, items: entries } = await fetchFeed(feedUrl));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    touchSource(d, source.id, {
      last_checked_at: new Date().toISOString(),
      last_error: msg,
    });
    return { ok: false, changed: false, updatesCreated: 0, error: msg };
  }

  const state = stateOf(source);
  const rules = rulesOf(source);
  const firstRun = state.seen_feed_ids === undefined;
  const seen: string[] = state.seen_feed_ids ?? [];
  let updatesCreated = 0;

  if (!firstRun) {
    for (const it of entries) {
      if (seen.includes(it.guid)) continue;
      const text = `${it.title} ${it.contentSnippet ?? it.content ?? ""}`;
      // Keyword pass first; an AI semantic second pass runs when no keyword hits.
      const hit = await findRuleHitSmart(
        rules,
        "feed",
        [{ kind: "feed", text }],
        getAI()
      );
      const priority = hit ? hit.priority : "normal";
      const id = insertUpdate(d, {
        source_id: source.id,
        priority,
        kind: hit ? "keyword" : "feed_entry",
        title: hit
          ? hit.semantic
            ? hit.semanticTopic
              ? `Topic match in feed: ${it.title}`
              : `AI topic match in feed: ${it.title}`
            : `Keyword "${hit.matched.join(", ")}" in feed: ${it.title}`
          : it.title,
        summary:
          hit?.semantic && hit.semanticSummary
            ? hit.semanticSummary
            : truncate(it.contentSnippet ?? "", 1000),
        url: it.link || source.url,
        payload: {
          guid: it.guid,
          date: it.isoDate ?? null,
          semantic: !!hit?.semantic,
          semanticTopic: hit?.semanticTopic ?? null,
          semanticSummary: hit?.semanticSummary ?? null,
        },
      });
      updatesCreated++;
      void notify({
        id,
        title: it.title,
        summary: truncate(it.contentSnippet ?? "", 300),
        url: it.link || source.url,
        priority,
        kind: hit ? "keyword" : "feed_entry",
        sourceName: source.name || source.url,
        sourceUrl: source.url,
      });
      seen.push(it.guid);
    }
  } else {
    for (const it of entries) seen.push(it.guid);
  }
  state.seen_feed_ids = seen.slice(-500);
  touchSource(d, source.id, {
    last_checked_at: new Date().toISOString(),
    state_json: JSON.stringify(state),
    ...(opts.skipPageHash
      ? {}
      : { last_content_hash: hashText(entries.map((e) => e.guid).join("\n")) }),
    last_error: null,
  });

  // Keep the latest feed snapshot for reference (best-effort)
  if (!opts.skipSnapshot && xml.length > 2) {
    const version = maxSnapshotVersion(d, source.id) + 1;
    d.prepare(
      `INSERT INTO snapshots (source_id, version, fetched_at, html, content_hash, title)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      source.id,
      version,
      new Date().toISOString(),
      compressHtml(truncate(xml, 200_000)),
      hashText(xml),
      source.name || source.url
    );
    pruneSnapshots(d, source.id);
  }

  indexForSearch(
    d,
    "source",
    source.id,
    source.name || source.url,
    source.goal ?? ""
  );
  return { ok: true, changed: updatesCreated > 0, updatesCreated };
}
