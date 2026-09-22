/**
 * Category backfill: give a tracked source a short two-level classification
 * of its intended use (dashboard groups by the generic level): a GENERIC
 * category (broad domain/family, e.g. "cnc") plus a more specific subcategory
 * (e.g. "cnc-controller-firmware").
 *
 * Websites and feeds: KEYWORDS are checked first (text.ts `suggestCategory`
 * over the name/goal/summary — and the full page/feed content when that is
 * thin) — cheap and instant, no AI latency. A keyword match stores the guess
 * immediately, but the AI still classifies in the SAME pass (both levels in
 * one call) and replaces the guess, so one pass always completes the pair;
 * the guess only survives when the AI is off or comes back unsure. The AI
 * sees the stored summary/goal AND, when those are too thin to classify
 * from, the FULL content of the project (whole page text for websites, feed
 * text for RSS), handed over as a RAG document where the provider supports
 * it (Ollama ≥ 0.6.2) — reusing existing category slugs for consistency.
 * For GITHUB
 * sources the model classifies in a priority cascade instead: the repo's
 * TOPICS first, then topics + ABOUT section, and only when neither yields a
 * confident answer is the full README ingested (the stored AI summary
 * substitutes for the README when it is already rich); the keyword heuristic
 * runs over the same tier order when AI is off, unconfigured or unsure.
 *
 * Weak models given only a project name tend to echo the name as the
 * category — a reply that simply mirrors the project name is rejected, and
 * any stored value like that is treated as invalid: it is cleared and the
 * source re-classified from content on the next check.
 *
 * Runs on every check and fills only the missing levels: a missing
 * subcategory (e.g. category set by the heuristic before AI was available)
 * is completed via AI while the existing category stays untouched.
 * Heuristic (keyword-guessed) values are not very accurate — once AI is
 * available it re-classifies the source and replaces the guess (upgrading
 * category_source to "ai"). Values set by AI or by the user are never
 * touched (except the invalid name-echo values above). Best-effort
 * everywhere: never throws; unset levels and un-upgraded guesses are
 * retried on the next check.
 */
import type Database from "better-sqlite3";
import type { SourceRow } from "./db";
import { getAI } from "./ai";
import type { AIDoc } from "./ai";
import { suggestCategory as heuristicCategory } from "./text";
import {
  contextDocName,
  gatherProjectContext,
  githubFullContext,
  githubLightContext,
} from "./project-context";
import { parseGithubRef } from "./github";
import { indexForSearch, touchSource } from "./models";
import { ensureCategoryIcon, getCategoryIcon, setCategoryIcon } from "./category-icons";

/** Distinct non-null category slugs currently in use (for prompt reuse). */
function existingCategories(d: Database.Database): string[] {
  const rows = d
    .prepare("SELECT DISTINCT category FROM sources WHERE category IS NOT NULL")
    .all() as { category: string }[];
  return rows.map((r) => r.category).sort();
}

/** Project name as a lowercase hyphenated slug (for the name-echo check). */
export function nameSlug(name: string | null | undefined): string | null {
  const s = (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || null;
}

/**
 * True when the stored category simply IS the project name — a known failure
 * of weak models when they were given too little content. Such values are
 * treated as invalid and re-classified on the next check.
 */
export function categoryMirrorsName(
  row: Pick<SourceRow, "category" | "name">
): boolean {
  const slug = nameSlug(row.name);
  return !!row.category && !!slug && row.category.toLowerCase() === slug;
}

/** An AI reply is unusable when it just echoes the project name. */
function echoesName(
  r: { category: string; subcategory: string | null },
  name: string | null | undefined
): boolean {
  const slug = nameSlug(name);
  return !!slug && (r.category === slug || r.subcategory === slug);
}

/**
 * Tiered GitHub classification — GitHub sources only. Priority cascade over
 * the repo's own signals, cheapest first:
 *
 *   tier 1: the repo's TOPICS (curated keywords — the densest signal)
 *   tier 2: topics + the ABOUT section (description) + the stored summary
 *   tier 3: the FULL README — ingested (CPU prompt / RAG doc) only when the
 *           light tiers gave no confident answer. The stored summary can
 *           substitute for the fetch: it was itself AI-generated from the
 *           full content, so when it is rich (≥ 200 chars) tier 3 reuses it
 *           instead of re-fetching the README.
 *
 * Each tier is tried with AI first (the model may answer "unknown" rather
 * than guess); the keyword-hint heuristic runs over the same tier order
 * only when AI is off or came back unsure. Same policies as the general
 * path: name-echoing replies are rejected, heuristic (guessed) values are
 * upgraded by AI on a later check, subcategory completion is AI-only, and
 * everything is best-effort (unset levels are retried on the next check).
 */
async function ensureCategoryGithub(
  d: Database.Database,
  row: SourceRow
): Promise<string | null> {
  const ref = parseGithubRef(row.url);
  if (!ref) return row.category ?? null;
  const [owner, repo] = ref;

  // Tiers 1-2 from one cheap API call; the README (tier 3) is fetched
  // lazily below, only when the light tiers were not enough.
  const light = await githubLightContext(owner, repo);
  const summary = row.project_summary ?? "";
  const summaryRich = summary.trim().length >= 200;
  const t1 = light?.topics ?? "";
  const t2 = [light?.topics, light?.about, summary].filter(Boolean).join("\n\n");
  const name = row.name ?? "";
  // Adjacent-dedupe: with no about/summary, tier 2 would repeat tier 1.
  const lightTiers = ([
    t1 ? [t1, name].filter(Boolean).join("\n\n") : null,
    t2 ? [t2, name].filter(Boolean).join("\n\n") : null,
  ] as (string | null)[])
    .filter((t): t is string => !!t)
    .filter((t, i, arr) => i === 0 || t !== arr[i - 1]);

  let fullCache: string | null | undefined;
  const fullText = async (): Promise<string | null> => {
    if (fullCache !== undefined) return fullCache;
    if (summaryRich) {
      // The stored summary already carries the full content's signal —
      // skip the README fetch entirely.
      fullCache = t2 || [summary, name].filter(Boolean).join("\n\n");
      return fullCache;
    }
    const readme = await githubFullContext(owner, repo);
    fullCache = readme
      ? [t2, readme, name].filter(Boolean).join("\n\n")
      : t2 || null;
    return fullCache;
  };

  const existing = existingCategories(d);
  const ai = getAI();

  // PRE-AI PASS (the big CPU saver): the keyword matcher over the repo's
  // own signals — its TOPICS first (the densest, curated signal), then
  // topics + about. A confident match persists the category and skips the
  // AI ENTIRELY (zero model calls); a miss falls through to the AI cascade
  // below. Pure string matching — no network, no tokens.
  const prepass =
    (t1 ? heuristicCategory(t1) : null) ??
    (t2 && t2 !== t1 ? heuristicCategory(t2) : null);

  const persist = (
    category: string,
    subcategory: string | null,
    catSource: string,
    icon: string | null = null,
    reclassified = false
  ): string => {
    touchSource(d, row.id, {
      category,
      subcategory,
      category_source: catSource,
      subcategory_source: subcategory ? catSource : null,
    });
    // The AI picked a glyph for this category in the current call. When the
    // source was RE-classified the edit forces a fresh search — store the new
    // pick even if the category already has a stored icon. Otherwise store
    // only when none is stored yet (a previous pick is never changed).
    // setCategoryIcon validates the name; invalid picks are dropped.
    if (icon && (reclassified || !getCategoryIcon(d, category)))
      setCategoryIcon(d, category, icon);
    indexForSearch(
      d,
      "source",
      row.id,
      row.name ?? row.url,
      `${row.goal ?? ""} ${category} ${subcategory ?? ""}`
    );
    return category;
  };

  // AI over the tiers, most-signal-cheapest first; the full content is
  // tried last (RAG document where the provider supports it). A reply that
  // has the category but no subcategory is completed in the SAME pass with
  // one targeted follow-up over the same tier's text, so the pair is never
  // left half-filled for a later check.
  const aiClassify = async (): Promise<
    { category: string; subcategory: string | null; icon: string | null } | null
  > => {
    if (!ai.enabled) return null;
    const complete = async (
      r: { category: string; subcategory: string | null; icon: string | null },
      text: string,
      docs?: AIDoc[]
    ): Promise<{ category: string; subcategory: string | null; icon: string | null }> => {
      if (r.subcategory) return r;
      try {
        const sub = await ai.suggestSubcategory(text, r.category, docs);
        if (sub && sub !== nameSlug(row.name)) return { ...r, subcategory: sub };
      } catch {
        // best-effort — retried on the next check
      }
      return r;
    };
    for (const text of lightTiers) {
      try {
        const r = await ai.suggestCategory(text, existing);
        if (r && !echoesName(r, row.name)) return complete(r, text);
      } catch {
        // best-effort — try the next tier
      }
    }
    const full = await fullText();
    if (full) {
      try {
        const docs = [{ name: contextDocName("github"), content: full }];
        const r = await ai.suggestCategory(full, existing, docs);
        if (r && !echoesName(r, row.name)) return complete(r, full, docs);
      } catch {
        // best-effort
      }
    }
    return null;
  };

  // A keyword-guessed category is not very accurate — re-classify and
  // replace the guess with the AI's answer. UNLESS the topics pre-pass
  // still confirms the SAME word: topics are the repo's own curated
  // keywords, so a confirmed guess keeps it — re-classifying would only
  // burn an AI call to arrive at the same category.
  if (row.category && row.category_source === "heuristic") {
    if (prepass && prepass.toLowerCase() === row.category.toLowerCase()) return row.category;
    const r = await aiClassify();
    if (r)
      return persist(
        r.category,
        r.subcategory,
        "ai",
        r.icon,
        r.category.toLowerCase() !== row.category.toLowerCase()
      );
    if (row.subcategory) return row.category;
    // AI unavailable/unsure — keep the guess; fall through to complete the
    // still-missing subcategory below.
  }

  if (row.category && row.subcategory) return row.category;

  if (!row.category) {
    // Topics pre-pass: a confident match persists and skips the AI
    // entirely — the repo's own curated keywords outrank the model.
    if (prepass) return persist(prepass, null, "heuristic");
    const r = await aiClassify();
    if (r) return persist(r.category, r.subcategory, "ai", r.icon);

    // Keyword fallback: generic category only, not very accurate — run over
    // the same tier order (topics first, full text last) and flagged in the
    // UI via category_source.
    const full = await fullText();
    const cat =
      heuristicCategory(t1) ??
      heuristicCategory(t2) ??
      (full ? heuristicCategory(full) : null);
    if (!cat) return null;
    return persist(cat, null, "heuristic");
  }

  // Category already present — never touched. Complete a missing subcategory
  // when we can (AI only, same tier order; the heuristic has no subcategory
  // level). Best-effort — retried on the next check.
  if (ai.enabled) {
    let sub: string | null = null;
    for (const text of lightTiers) {
      try {
        sub = await ai.suggestSubcategory(text, row.category);
      } catch {
        sub = null; // best-effort — retried on the next check
      }
      if (sub) break;
    }
    if (!sub) {
      const full = await fullText();
      if (full) {
        try {
          sub = await ai.suggestSubcategory(full, row.category, [
            { name: contextDocName("github"), content: full },
          ]);
        } catch {
          sub = null; // best-effort
        }
      }
    }
    if (sub && sub !== nameSlug(row.name)) {
      touchSource(d, row.id, { subcategory: sub, subcategory_source: "ai" });
      indexForSearch(
        d,
        "source",
        row.id,
        row.name ?? row.url,
        `${row.goal ?? ""} ${row.category} ${sub}`
      );
    }
  }
  return row.category;
}

/**
 * Fill whichever category levels are missing for a source, upgrade
 * heuristic (keyword-guessed) values once AI is available (guessed values
 * are not very accurate — let the AI replace them), and re-classify invalid
 * name-echo values. Values set by AI or by the user are otherwise never
 * touched. Returns the stored generic category (existing or new) or null
 * when nothing could be determined.
 */
export async function ensureCategoryForSource(
  d: Database.Database,
  source: SourceRow
): Promise<string | null> {
  // A category that just echoes the project name is invalid — clear it and
  // re-classify from the full content below.
  let row = source;
  if (row.category && categoryMirrorsName(row)) {
    touchSource(d, row.id, {
      category: null,
      subcategory: null,
      category_source: null,
      subcategory_source: null,
    });
    row = {
      ...row,
      category: null,
      subcategory: null,
      category_source: null,
      subcategory_source: null,
    };
  }
  // A subcategory without its category is an orphan (the generic level was
  // cleared) — drop it so the pair is re-derived together below.
  if (!row.category && row.subcategory) {
    touchSource(d, row.id, {
      subcategory: null,
      category_source: null,
      subcategory_source: null,
    });
    row = { ...row, subcategory: null, category_source: null, subcategory_source: null };
  }

  // GitHub sources use the tiered cascade (topics → about → full README);
  // websites and feeds keep the single-blob path below.
  if (row.type === "github") return ensureCategoryGithub(d, row);

  // Classification input: the stored summary/goal, plus the FULL content of
  // the project (whole page / README + description) when what is stored is
  // too thin to classify from — a project name alone is not content. The
  // full content is also passed to the provider as a RAG document.
  const stored = [row.project_summary, row.goal].filter(Boolean).join("\n\n");
  let docs: AIDoc[] | undefined;
  let content: string | null = null;
  if (stored.trim().length < 200) {
    try {
      content = await gatherProjectContext(row);
    } catch {
      content = null; // best-effort — stored summary/goal/name still usable
    }
    if (content) docs = [{ name: contextDocName(row.type), content }];
  }
  const text = [stored, content, row.name].filter(Boolean).join("\n\n");
  if (!text.trim()) return row.category ?? null;

  // A keyword-guessed category is not very accurate — if AI is available,
  // re-classify and replace the guess with the AI's answer.
  if (row.category && row.category_source === "heuristic") {
    const ai = getAI();
    if (ai.enabled) {
      try {
        const r = await ai.suggestCategory(text, existingCategories(d), docs);
        if (r && !echoesName(r, row.name)) {
          touchSource(d, row.id, {
            category: r.category,
            subcategory: r.subcategory,
            category_source: "ai",
            subcategory_source: r.subcategory ? "ai" : null,
          });
          // The AI re-classified the source — the fresh icon pick from this
          // call replaces any previously stored one; if it came back without
          // a glyph, run a forced icon search in the background instead.
          const reclassified =
            r.category.toLowerCase() !== row.category.toLowerCase();
          if (r.icon) {
            if (reclassified) setCategoryIcon(d, r.category, r.icon);
            else if (!getCategoryIcon(d, r.category)) setCategoryIcon(d, r.category, r.icon);
          } else if (reclassified) {
            const context = [row.name ?? "", row.goal ?? ""]
              .filter(Boolean)
              .join(" — ");
            void ensureCategoryIcon(d, r.category, context || undefined, true).catch(() => {});
          }
          indexForSearch(
            d,
            "source",
            row.id,
            row.name ?? row.url,
            `${row.goal ?? ""} ${r.category} ${r.subcategory ?? ""}`
          );
          return r.category;
        }
      } catch {
        // best-effort — retried on the next check
      }
    }
    if (row.subcategory) return row.category;
    // AI unavailable/unsure — keep the guess; fall through to complete the
    // still-missing subcategory below.
  }

  if (row.category && row.subcategory) return row.category;

  if (!row.category) {
    // Keywords first: cheap and instant, no AI latency. A match stores a
    // quick (flagged) generic guess immediately, but the AI classification
    // still runs in the SAME pass right below (both levels in one call) —
    // the source never waits for a later check to get the accurate pair.
    const kw = heuristicCategory(text);
    let guess: string | null = null;
    if (kw) {
      touchSource(d, row.id, {
        category: kw,
        subcategory: null,
        category_source: "heuristic",
        subcategory_source: null,
      });
      indexForSearch(
        d,
        "source",
        row.id,
        row.name ?? row.url,
        `${row.goal ?? ""} ${kw}`
      );
      guess = kw;
    }

    // The AI reads the whole project (full page/feed content, handed over as
    // a RAG document where supported) and returns both levels in one call —
    // completing the pair in this same pass, never category-now /
    // subcategory-later.
    let cat: string | null = null;
    let sub: string | null = null;
    let icon: string | null = null;
    const ai = getAI();
    if (ai.enabled) {
      try {
        const r = await ai.suggestCategory(text, existingCategories(d), docs);
        if (r && !echoesName(r, row.name)) {
          cat = r.category;
          sub = r.subcategory;
          icon = r.icon;
        }
      } catch {
        // best-effort — retried on the next check
      }
    }
    // AI off or unsure — keep the keyword guess (already stored) if there
    // was one; nothing could be determined otherwise.
    if (!cat) return guess;
    // The model sometimes answers the category but not the subcategory —
    // complete it in the SAME pass with one targeted follow-up, so the pair
    // is never left half-filled for a later check.
    if (!sub) {
      try {
        const followUp = await ai.suggestSubcategory(text, cat, docs);
        sub = followUp && followUp !== nameSlug(row.name) ? followUp : null;
      } catch {
        sub = null; // best-effort — retried on the next check
      }
    }

    touchSource(d, row.id, {
      category: cat,
      subcategory: sub,
      category_source: "ai",
      subcategory_source: sub ? "ai" : null,
    });
    // The AI picked a glyph for the new category — store only when it has no
    // stored AI icon yet (a previous pick is never changed).
    if (icon && !getCategoryIcon(d, cat)) setCategoryIcon(d, cat, icon);
    // Category is part of the source's search body — keep the index in sync.
    indexForSearch(
      d,
      "source",
      row.id,
      row.name ?? row.url,
      `${row.goal ?? ""} ${cat} ${sub ?? ""}`
    );
    return cat;
  }

  // Category already present — never touched. Complete a missing
  // subcategory when we can (AI only; the heuristic has no subcategory
  // level). Best-effort — retried on the next check.
  const ai = getAI();
  if (ai.enabled) {
    try {
      const sub = await ai.suggestSubcategory(text, row.category, docs);
      if (sub && sub !== nameSlug(row.name)) {
        touchSource(d, row.id, { subcategory: sub, subcategory_source: "ai" });
        indexForSearch(
          d,
          "source",
          row.id,
          row.name ?? row.url,
          `${row.goal ?? ""} ${row.category} ${sub}`
        );
      }
    } catch {
      // best-effort — retried on the next check
    }
  }
  return row.category;
}
