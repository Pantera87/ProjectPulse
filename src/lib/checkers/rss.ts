import type Database from "better-sqlite3";
import Parser from "rss-parser";
import type { SourceRow } from "../db";
import { findRuleHit } from "../rules";
import {
  insertUpdate,
  indexForSearch,
  maxSnapshotVersion,
  pruneSnapshots,
  rulesOf,
  stateOf,
  touchSource,
} from "../models";
import { truncate, hashText } from "../text";
import { notify } from "../notifiers";
import { fetchText } from "../http";
import type { CheckResult } from "./website";

const parser = new Parser({
  headers: { "user-agent": "ProjectPulse/1.0" },
});

export async function checkRss(
  d: Database.Database,
  source: SourceRow
): Promise<CheckResult> {
  let xml: string;
  let entries: {
    guid: string;
    title: string;
    link?: string;
    isoDate?: string;
    contentSnippet?: string;
    content?: string;
  }[];
  try {
    xml = await fetchText(source.url, {
      timeoutMs: 30_000,
      headers: { accept: "application/rss+xml, application/atom+xml, application/xml, */*" },
    });
    const feed = await parser.parseString(xml);
    entries = feed.items.map((it, i) => ({
      guid: it.guid || it.link || it.title || `item-${i}`,
      title: it.title ?? "(untitled)",
      link: it.link,
      isoDate: it.isoDate,
      contentSnippet: it.contentSnippet,
      content: it.content,
    }));
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
      const hit = findRuleHit(rules, "feed", [{ kind: "feed", text }]);
      const priority = hit ? hit.priority : "normal";
      const id = insertUpdate(d, {
        source_id: source.id,
        priority,
        kind: hit ? "keyword" : "feed_entry",
        title: hit
          ? `Keyword "${hit.matched.join(", ")}" in feed: ${it.title}`
          : it.title,
        summary: truncate(it.contentSnippet ?? "", 1000),
        url: it.link || source.url,
        payload: { guid: it.guid, date: it.isoDate ?? null },
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
    last_content_hash: hashText(
      entries.map((e) => e.guid).join("\n")
    ),
    last_error: null,
  });

  // Keep the latest feed snapshot for reference (best-effort)
  if (xml.length > 2) {
    const version = maxSnapshotVersion(d, source.id) + 1;
    d.prepare(
      `INSERT INTO snapshots (source_id, version, fetched_at, html, content_hash, title)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      source.id,
      version,
      new Date().toISOString(),
      truncate(xml, 200_000),
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
