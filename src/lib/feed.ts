import Parser from "rss-parser";
import { fetchText } from "./http";

const parser = new Parser({
  headers: { "user-agent": "ProjectPulse/1.0" },
});

export interface FeedItem {
  guid: string;
  title: string;
  link?: string;
  isoDate?: string;
  contentSnippet?: string;
  content?: string;
}

/**
 * Fetch and parse an RSS/Atom feed. Throws when the URL does not serve a
 * parseable feed — callers treat a throw as "not a usable feed".
 */
export async function fetchFeed(
  url: string
): Promise<{ xml: string; items: FeedItem[] }> {
  const xml = await fetchText(url, {
    timeoutMs: 30_000,
    headers: {
      accept: "application/rss+xml, application/atom+xml, application/xml, */*",
    },
  });
  const feed = await parser.parseString(xml);
  const items = (feed.items ?? []).map((it, i) => ({
    guid: it.guid || it.link || it.title || `item-${i}`,
    title: it.title ?? "(untitled)",
    link: it.link,
    isoDate: it.isoDate,
    contentSnippet: it.contentSnippet,
    content: it.content,
  }));
  return { xml, items };
}
