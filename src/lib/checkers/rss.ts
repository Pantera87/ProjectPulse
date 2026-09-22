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
  higherPriority,
} from "../models";
import { truncate, hashText, compressHtml } from "../text";
import { notify } from "../notifiers";
import { fetchFeed } from "../feed";
import type { CheckResult } from "./website";

/** Check an RSS/Atom source (the feed lives at the source's own URL). */
export async function checkRss(
  d: Database.Database,
  source: SourceRow
): Promise<CheckResult> {
  return checkFeedUrl(d, source, source.url);
}

/**
 * Check an RSS/Atom feed URL for new entries (state tracked in
 * `state_json.seen_feed_ids`).
 */
export async function checkFeedUrl(
  d: Database.Database,
  source: SourceRow,
  feedUrl: string
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
      // Optional AI summary + importance classification of the entry. For
      // semantic topic matches the match explanation takes precedence (and
      // the extra AI call is skipped — the semantic pass already summarized).
      let summary =
        hit?.semantic && hit.semanticSummary
          ? hit.semanticSummary
          : truncate(it.contentSnippet ?? "", 1000);
      let summarySource: string | null =
        hit?.semantic && hit.semanticSummary ? "ai" : null;
      let finalPriority = priority;
      if (!hit?.semantic) {
        const aiRes = await getAI().summarizeUpdate(
          `${it.title} ${it.contentSnippet ?? ""}`.trim(),
          source.name || source.url
        );
        if (aiRes) {
          summary = aiRes.summary;
          summarySource = "ai";
          finalPriority = higherPriority(finalPriority, aiRes.priority);
        }
      }
      const id = insertUpdate(d, {
        source_id: source.id,
        priority: finalPriority,
        kind: hit ? "keyword" : "feed_entry",
        title: hit
          ? hit.semantic
            ? hit.semanticTopic
              ? `Topic match in feed: ${it.title}`
              : `AI topic match in feed: ${it.title}`
            : `Keyword "${hit.matched.join(", ")}" in feed: ${it.title}`
          : it.title,
        summary: truncate(summary, 1000),
        url: it.link || source.url,
        payload: {
          guid: it.guid,
          date: it.isoDate ?? null,
          semantic: !!hit?.semantic,
          semanticTopic: hit?.semanticTopic ?? null,
          semanticSummary: hit?.semanticSummary ?? null,
          summarySource,
        },
      });
      updatesCreated++;
      void notify({
        id,
        title: it.title,
        summary: truncate(summary, 300),
        fullSummary: summary,
        url: it.link || source.url,
        priority: finalPriority,
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
    last_content_hash: hashText(entries.map((e) => e.guid).join("\n")),
    last_error: null,
  });

  // Goal backfill — the feed's own <title> as a plain auto-extraction, or the
  // AI over a sample of recent entry titles when the feed has no title. Runs
  // on every successful fetch, so a goal the user cleared is restored on the
  // next check.
  if (!source.goal) {
    let goal = (xml.match(/<title[^>]*>([^<]{15,500})<\/title>/i)?.[1] ?? "").trim();
    let goalSource: string | null = null;
    if (!goal) {
      const sample = entries
        .slice(0, 8)
        .map((it) => it.title)
        .filter(Boolean)
        .join("\n");
      if (sample) {
        const aiGoal = await getAI().extractGoal(sample, [
          { name: "feed-entries.txt", content: sample },
        ]);
        if (aiGoal) {
          goal = aiGoal;
          goalSource = "ai";
        }
      }
    }
    if (goal)
      touchSource(d, source.id, {
        goal: truncate(goal, 500),
        goal_source: goalSource ?? "auto",
      });
  }

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
