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
import type { SourceRow } from "./db";
import { getDb } from "./db";
import { getAI } from "./ai";
import { ensureCategoryForSource } from "./category";
import { contextDocName, gatherProjectContext } from "./project-context";
import { truncate } from "./text";
import { touchSource } from "./models";

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
  // The full content is also handed to the provider as a RAG document
  // (Ollama ≥ 0.6.2) so the model sees the most relevant parts, not just
  // a truncated prefix.
  const summary = await ai.summarizeProject(text, source.name || source.url, [
    { name: contextDocName(source.type), content: text },
  ]);
  if (!summary) return null;
  touchSource(d, source.id, { project_summary: truncate(summary, 1000) });
  // Fresh summary text is the best input for the category classifier —
  // complete any missing level (or upgrade a keyword guess) while we already
  // have the context (best-effort; AI/user values are never touched).
  if (!source.category || !source.subcategory || source.category_source === "heuristic") {
    try {
      await ensureCategoryForSource(d, { ...source, project_summary: truncate(summary, 1000) });
    } catch {
      // best-effort — retried on the next check
    }
  }
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