/**
 * Project summarization: gather what a tracked project actually is (repo
 * metadata + README, page text, feed description) and ask the active AI
 * provider for a short summary, stored on the source row for later reuse
 * (search, dashboards, notifications — to be built on top of this).
 *
 * Best-effort everywhere: any failure (network, AI off, model still
 * downloading) leaves project_summary null and the next check retries.
 */
import type Database from "better-sqlite3";
import Parser from "rss-parser";
import type { SourceRow } from "./db";
import { getDb } from "./db";
import { getAI } from "./ai";
import { fetchText } from "./http";
import { parseHtml, truncate } from "./text";
import { github, parseGithubRef } from "./github";
import { touchSource } from "./models";

const rssParser = new Parser({ headers: { "user-agent": "ProjectPulse/1.0" } });

/** Build the text the model sees, per source type. null when unavailable. */
async function gatherProjectContext(s: SourceRow): Promise<string | null> {
  try {
    if (s.type === "github") {
      const ref = parseGithubRef(s.url);
      if (!ref) return null;
      const [owner, repo] = ref;
      const [meta, readme] = await Promise.all([
        github.repo(owner, repo),
        github.readme(owner, repo),
      ]);
      const parts = [
        meta.description ?? "",
        meta.topics?.length ? `Topics: ${meta.topics.join(", ")}` : "",
        readme ?? "",
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

/**
 * Summarize a source's project if the summary is missing. Returns the
 * summary (existing or freshly generated) or null.
 */
export async function summarizeProjectForSource(
  d: Database.Database,
  source: SourceRow
): Promise<string | null> {
  const ai = getAI();
  if (!ai.enabled) return source.project_summary;
  if (source.project_summary) return source.project_summary;
  const text = await gatherProjectContext(source);
  if (!text) return null;
  const summary = await ai.summarizeProject(text, source.name || source.url);
  if (!summary) return null;
  touchSource(d, source.id, { project_summary: truncate(summary, 1000) });
  return summary;
}

/** Fire-and-forget entry point (used when a project is added). */
export function ensureProjectSummaryById(id: number): void {
  void (async () => {
    try {
      const d = getDb();
      const row = d
        .prepare("SELECT * FROM sources WHERE id = ?")
        .get(id) as SourceRow | undefined;
      if (!row) return;
      await summarizeProjectForSource(d, row);
    } catch {
      // best-effort — the next scheduled check retries
    }
  })();
}