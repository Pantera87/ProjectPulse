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
  gpu: ["gpu", "cuda", "rocm", "hip", "opencl", "vulkan", "metal"],
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

/** Suggest a category from a goal/description using keyword hints. */
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
