import type Database from "better-sqlite3";
import { GLYPHS } from "./glyphs.generated";
import { getAI } from "./ai";

/**
 * Per-category AI-picked icons, stored in the `categories` table (see the
 * migrate() in db.ts). The AI chooses one of the curated Iconify "Glyphs"
 * names (GLYPH_NAMES) while classifying a project into a new category; the
 * choice is persisted ONCE per category, so every source in that category
 * renders the same glyph in the gradient category tiles.
 *
 * All functions are defensive: an invalid/hallucinated icon name is simply
 * rejected, and the UI falls back to the keyword/hash rules in
 * category-icon.tsx.
 */

/** Store (upsert) the icon the AI picked for a category. */
export function setCategoryIcon(
  d: Database.Database,
  category: string,
  icon: string
): void {
  const cat = category.trim().toLowerCase();
  if (!cat || !GLYPHS[icon]) return; // unknown icon — keep any previous choice
  d.prepare(
    `INSERT INTO categories (category, icon) VALUES (?, ?)
     ON CONFLICT(category) DO UPDATE SET icon = excluded.icon`
  ).run(cat, icon);
}

/** Icon for a category, or null when none is stored (or it is invalid). */
export function getCategoryIcon(
  d: Database.Database,
  category: string | null | undefined
): string | null {
  const cat = (category ?? "").trim().toLowerCase();
  if (!cat) return null;
  const row = d
    .prepare("SELECT icon FROM categories WHERE category = ?")
    .get(cat) as { icon: string } | undefined;
  return row?.icon && GLYPHS[row.icon] ? row.icon : null;
}

/** category -> icon map for UI pages (server-side, read once per render). */
export function categoryIconMap(d: Database.Database): Record<string, string> {
  const rows = d
    .prepare("SELECT category, icon FROM categories")
    .all() as { category: string; icon: string }[];
  const map: Record<string, string> = {};
  for (const r of rows) if (GLYPHS[r.icon]) map[r.category] = r.icon;
  return map;
}

/**
 * Give a category a stored AI icon when it has none yet — used when the user
 * renames a category by hand: the new slug has no row in `categories`, so a
 * fresh icon check asks the AI to pick a glyph for it.
 *
 * Best-effort and never throws: skipped when AI is disabled, a missing
 * pick simply keeps the UI's keyword/hash fallback, and by default an
 * existing valid icon (previously picked by the AI) is never overwritten.
 *
 * `force` (used when a category is EDITED — manually by the user or by the
 * AI re-classifying a source) requests a fresh search even when an icon is
 * already stored, overwriting the previous pick.
 */
export async function ensureCategoryIcon(
  d: Database.Database,
  category: string,
  context?: string,
  force = false
): Promise<void> {
  const cat = (category ?? "").trim().toLowerCase();
  if (!cat || !getAI().enabled) return;
  if (!force && getCategoryIcon(d, cat)) return; // AI already picked a valid icon
  try {
    const icon = await getAI().suggestIcon(cat, context);
    if (icon) setCategoryIcon(d, cat, icon);
  } catch {
    // best-effort — the UI keeps its keyword/hash fallback
  }
}
