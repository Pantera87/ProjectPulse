import * as cheerio from "cheerio";
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

const FEED_TYPES = new Set([
  "application/rss+xml",
  "application/atom+xml",
  "application/rss",
  "application/atom",
  "text/xml",
]);

/** Common feed locations probed when the page declares no <link> tag. */
const COMMON_FEED_PATHS = [
  "/feed",
  "/feed.xml",
  "/rss.xml",
  "/atom.xml",
  "/rss",
  "/atom",
];

/**
 * Discover an RSS/Atom feed for a website: first from the page's own
 * `<link rel="alternate" type="application/rss+xml|atom+xml">` declarations,
 * then from common feed paths on the same origin. Returns the first
 * candidate that parses as a valid feed, or null when none works.
 */
export async function discoverWebsiteFeed(pageUrl: string): Promise<string | null> {
  const candidates: string[] = [];
  try {
    const html = await fetchText(pageUrl, { maxBytes: 2_000_000 });
    const $ = cheerio.load(html);
    $("link[rel='alternate']").each((_i, el) => {
      const type = ($(el).attr("type") ?? "").toLowerCase().trim();
      const href = $(el).attr("href");
      if (href && FEED_TYPES.has(type)) {
        try {
          candidates.push(new URL(href, pageUrl).toString());
        } catch {
          // unresolvable href — skip
        }
      }
    });
  } catch {
    // page fetch failed — fall through to common paths
  }
  if (candidates.length === 0) {
    let origin: string;
    try {
      origin = new URL(pageUrl).origin;
    } catch {
      return null;
    }
    for (const p of COMMON_FEED_PATHS) candidates.push(`${origin}${p}`);
  }
  for (const c of candidates.slice(0, 6)) {
    try {
      await fetchFeed(c);
      return c;
    } catch {
      // not a feed — try the next candidate
    }
  }
  return null;
}
