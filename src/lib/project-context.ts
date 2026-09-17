/**
 * Project content gathering: pull what a tracked project actually IS — the
 * full README + repo metadata for GitHub sources, the full page text for
 * website sources, the feed description + latest items for RSS — so the AI
 * can classify/summarize from real content instead of just the name.
 *
 * Used by the project summary (project-summary.ts) AND by the category
 * backfill (category.ts) whenever the stored summary/goal is too thin to
 * classify from. Lives in its own module because project-summary.ts imports
 * category.ts (a reverse import would be circular).
 *
 * Best-effort everywhere: any failure (network, API rate limit, missing
 * page) leaves the result null and callers degrade gracefully.
 */
import Parser from "rss-parser";
import type { SourceRow } from "./db";
import { fetchText } from "./http";
import { parseHtml, stripForAI } from "./text";
import { github, parseGithubRef } from "./github";

const rssParser = new Parser({ headers: { "user-agent": "ProjectPulse/1.0" } });

/** A document name hint for the source type (used when handing content to
 *  the AI provider as a RAG file). */
export function contextDocName(type: string): string {
  if (type === "github") return "readme.md";
  if (type === "website") return "page.txt";
  return "feed.txt";
}

/**
 * GitHub context for the tiered category cascade (category.ts). The light
 * context (topics + about) costs one cheap API call; the full README is
 * fetched separately so the expensive tier (CPU prompt ingestion / RAG
 * upload) only happens when the light tiers gave no confident answer.
 */
export async function githubLightContext(
  owner: string,
  repo: string
): Promise<{ topics: string; about: string } | null> {
  try {
    const meta = await github.repo(owner, repo);
    return {
      topics: meta.topics?.length ? meta.topics.join(", ") : "",
      about: meta.description ?? "",
    };
  } catch {
    return null;
  }
}

/** Full README, stripped and capped (40k) — the expensive tier. */
export async function githubFullContext(
  owner: string,
  repo: string
): Promise<string | null> {
  try {
    const raw = await github.readme(owner, repo);
    return raw ? stripForAI(raw).slice(0, 40_000) : null;
  } catch {
    return null;
  }
}

/**
 * Build the full content of a source's project, per source type. null when
 * nothing usable could be fetched.
 */
export async function gatherProjectContext(s: SourceRow): Promise<string | null> {
  try {
    if (s.type === "github") {
      const ref = parseGithubRef(s.url);
      if (!ref) return null;
      const [owner, repo] = ref;
      const [meta, rawReadme] = await Promise.all([
        github.repo(owner, repo),
        github.readme(owner, repo),
      ]);
      // Minimal AI context: strip badges/images/HTML/license headers before
      // the text goes to the model, then cap the length (CPU prompt ingestion
      // scales linearly with it).
      const readme = rawReadme ? stripForAI(rawReadme).slice(0, 40_000) : "";
      const parts = [
        meta.description ?? "",
        meta.topics?.length ? `Topics: ${meta.topics.join(", ")}` : "",
        readme,
      ];
      return parts.filter(Boolean).join("\n\n") || null;
    }
    if (s.type === "website") {
      const html = await fetchText(s.url);
      const page = parseHtml(html);
      return [page.title, page.metaDescription ?? "", page.text]
        .filter(Boolean)
        .join("\n\n") || null;
    }
    // rss
    const xml = await fetchText(s.url, {
      headers: { accept: "application/rss+xml, application/atom+xml, application/xml, */*" },
    });
    const feed = await rssParser.parseString(xml);
    const latest = feed.items
      .slice(0, 3)
      .map((it) => `${it.title ?? ""}: ${it.contentSnippet ?? ""}`)
      .join("\n");
    return [feed.title ?? "", (feed as { description?: string }).description ?? "", latest]
      .filter(Boolean)
      .join("\n\n") || null;
  } catch {
    return null;
  }
}