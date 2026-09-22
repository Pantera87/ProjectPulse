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
import { summaryCharCap, summarySizeFor, touchSource } from "./models";

/**
 * Summarize a source's project if the summary is missing. Returns the
 * summary (existing or freshly generated) or null.
 */
export async function summarizeProjectForSource(
  d: Database.Database,
  source: SourceRow
): Promise<string | null> {
  const ai = getAI();
  if (!ai.enabled) {
    fillNotesOnce(d, source);
    return source.project_summary;
  }
  const size = summarySizeFor(d, source);
  if (source.project_summary) {
    fillNotesOnce(d, source);
    return source.project_summary;
  }
  const text = await gatherProjectContext(source);
  if (!text) return null;
  // The full content is also handed to the provider as a RAG document
  // (Ollama ≥ 0.6.2) so the model sees the most relevant parts, not just
  // a truncated prefix.
  const summary = await ai.summarizeProject(text, source.name || source.url, [
    { name: contextDocName(source.type), content: text },
  ], size);
  if (!summary) return null;
  const stored = truncate(summary, summaryCharCap(size));
  touchSource(d, source.id, { project_summary: stored });
  // NOTES (one-time): the AI summary also lands in the Notes field — but
  // ONLY when Notes is still empty, so anything the user wrote there is
  // never overwritten.
  if (!(source.notes ?? "").trim()) touchSource(d, source.id, { notes: stored });
  // Fresh summary text is the best input for the category classifier —
  // complete any missing level (or upgrade a keyword guess) while we already
  // have the context (best-effort; AI/user values are never touched).
  if (!source.category || !source.subcategory || source.category_source === "heuristic") {
    try {
      await ensureCategoryForSource(d, { ...source, project_summary: stored });
    } catch {
      // best-effort — retried on the next check
    }
  }
  return stored;
}

/**
 * Fill the Notes field with the stored summary when (and only when) Notes
 * is still empty — user-written notes are never touched. Free in steady
 * state: once Notes is non-empty this is a no-op.
 */
function fillNotesOnce(d: Database.Database, source: SourceRow): void {
  if (source.project_summary && !(source.notes ?? "").trim())
    touchSource(d, source.id, { notes: source.project_summary });
}

/**
 * Clear the stored summaries of the given sources (of ALL sources when
 * omitted) and regenerate them in the background at the currently configured
 * size. No-op when AI is disabled — existing summaries are kept.
 */
export function requeueProjectSummaries(sourceIds?: number[]): void {
  void (async () => {
    try {
      const d = getDb();
      if (!getAI().enabled) return;
      const ids =
        sourceIds ??
        (d.prepare("SELECT id FROM sources").all() as { id: number }[]).map((r) => r.id);
      for (const id of ids) {
        const row = d
          .prepare("SELECT * FROM sources WHERE id = ?")
          .get(id) as SourceRow | undefined;
        if (!row) continue;
        touchSource(d, id, { project_summary: null });
        try {
          await summarizeProjectForSource(d, { ...row, project_summary: null });
        } catch {
          // best-effort — retried on the next check
        }
      }
    } catch {
      // best-effort
    }
  })();
}