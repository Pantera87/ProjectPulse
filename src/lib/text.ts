import { createHash } from "node:crypto";
import * as cheerio from "cheerio";

/** Hash any string (sha256, hex). */
export function hashText(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export interface ParsedPage {
  title: string;
  metaDescription: string | null;
  paragraphs: string[];
  text: string;
}

/** Parse an HTML document into text pieces used for hashing + goal extraction. */
export function parseHtml(html: string): ParsedPage {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, canvas, template").remove();
  const title = ($("title").first().text() || "").trim();
  const metaDescription =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    null;
  const paragraphs = $("h1, h2, p, li")
    .map((_i, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter((t) => t.length >= 20 && t.length <= 1000);
  // de-dupe while keeping order
  const seen = new Set<string>();
  const unique = paragraphs.filter((p) => {
    const k = p.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const text = unique.join("\n");
  return { title, metaDescription, paragraphs: unique, text };
}

/**
 * Normalize text for change detection: collapse whitespace, drop lines that
 * are obviously volatile (dates, times, random tokens) so cosmetic updates
 * do not trigger false positives.
 */
export function normalizeForHash(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((l) => !/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(l))
    .filter((l) => !/^\d{1,2}:\d{2}/.test(l))
    .filter((l) => !/csrf|sessionid|token/i.test(l));
  return lines.join("\n");
}

/** Extract a one-line goal statement from a parsed page. */
export function extractGoalFromPage(page: ParsedPage): string {
  const candidates = [
    page.metaDescription,
    page.paragraphs[0],
    page.paragraphs[1],
    page.title,
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    const cleaned = c.replace(/\s+/g, " ").trim();
    if (cleaned.length >= 15 && cleaned.length <= 500) return cleaned.slice(0, 500);
  }
  return page.title || "Untitled project";
}

const CATEGORY_HINTS: Record<string, string[]> = {
  gpu: ["gpu", "cuda", "opencl", "vulkan", "metal"],
  "ml-inference": [
    "inference",
    "llm",
    "model",
    "transformer",
    "neural",
    "deep learning",
    "ai",
  ],
  storage: ["storage", "database", "backup", "archive", "filesystem"],
  media: ["video", "audio", "streaming", "transcode", "image"],
  security: ["security", "vulnerability", "audit", "encryption", "firewall"],
  devtools: ["compiler", "build", "testing", "linter", "debug", "ci/cd"],
  os: ["operating system", "linux", "kernel", "desktop", "container"],
};

/**
 * Suggest a GENERIC category (broad domain/family) from a goal/description
 * using keyword hints. This is the fallback for when AI is unavailable —
 * it is not very accurate, produces no subcategory, and the result is
 * flagged in the UI (category_source = "heuristic").
 */
export function suggestCategory(text: string): string | null {
  const t = text.toLowerCase();
  const hintMatch = (hint: string): boolean => {
    if (/^[a-z0-9]+$/.test(hint))
      return new RegExp(`\\b${hint}\\b`, "i").test(t);
    return t.includes(hint);
  };
  for (const [cat, hints] of Object.entries(CATEGORY_HINTS)) {
    if (hints.some(hintMatch)) return cat;
  }
  return null;
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/**
 * GitHub-style anchor slug for a markdown heading (lowercase, spaces to
 * hyphens, punctuation stripped) — the slug GitHub generates for in-page
 * links. null when the heading has no slug-able text.
 */
function markdownAnchor(heading: string): string | null {
  const s = heading
    .toLowerCase()
    .replace(/[^a-z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || null;
}

/**
 * Best-effort link target for a keyword found in markdown: the anchor slug
 * of the NEAREST PRECEDING heading of the first occurrence of the keyword,
 * so `fileUrl#<slug>` jumps to the section that contains the match. null
 * when the keyword is absent or there is no heading above the match.
 */
export function markdownSectionAnchor(
  md: string,
  keyword: string
): string | null {
  const idx = md.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx === -1) return null;
  const before = md.slice(0, idx);
  const heads = [...before.matchAll(/^#{1,6}[ \t]+(.+?)[ \t]*#*\r?$/gm)];
  const last = heads[heads.length - 1];
  return last ? markdownAnchor(last[1]) : null;
}

/**
 * Strip noise from a README/markdown document BEFORE it is handed to the AI
 * model — CPU prompt ingestion scales linearly with length, so the context
 * stays minimal: HTML comments, badges & image embeds, raw/inline HTML tags,
 * and license headers carry no signal for summarization or classification.
 */
export function stripForAI(text: string): string {
  let t = text;
  // HTML comments (often build status, CI annotations, hidden notes)
  t = t.replace(/<!--[\s\S]*?-->/g, "");
  // Markdown image embeds — badges (shields.io) and banner images
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  // Raw / inline HTML tags (READMEs that mix HTML in)
  t = t.replace(/<[^>\n]{1,500}>/g, "");
  // License header placed BEFORE the first heading (Copyright/SPDX/… block)
  const h1 = t.search(/^#{1,6}\s/m);
  if (
    h1 > 0 &&
    /copyright|SPDX-License-Identifier|Apache License|MIT License|GNU (General Public|Lesser|Affero) License|BSD (2|3)-Clause/i.test(
      t.slice(0, h1)
    )
  )
    t = t.slice(h1);
  // A "# License" section: from the heading to the next heading (or EOF)
  t = t.replace(/^[ \t]*#{1,6}[ \t]*license[^\n]*(?:\r?\n(?![ \t]*#{1,6}[ \t]).*)*/gim, "");
  // Collapse runs of 3+ blank lines
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}
