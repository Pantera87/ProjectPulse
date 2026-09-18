/**
 * Offline snapshot archiving: download the assets a page references (images,
 * stylesheets, scripts, media) into DATA_DIR/archive/<sourceId>/v<version>/
 * and return a copy of the page HTML with every fetched asset rewritten to a
 * local /api/sources/<id>/archive URL, so the stored snapshot renders
 * completely offline.
 *
 * Best-effort throughout: missing/slow/oversized assets are skipped and keep
 * their original URL. Hard caps: 60 assets, 2 MB per asset, 10 s per asset,
 * 8 concurrent downloads.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { dataDir } from "./db";
import { fetchBinary } from "./http";

const MAX_ASSETS = 60;
const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const ASSET_TIMEOUT_MS = 10_000;
const CONCURRENCY = 8;

const shortHash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 8);

/** DATA_DIR/archive/<sourceId>/v<version> — where one archived version lives. */
export function archivedVersionDir(sourceId: number, version: number): string {
  return path.join(dataDir(), "archive", String(sourceId), `v${version}`);
}

/** Remove the archived files of one snapshot version (best-effort). */
export function rmArchivedVersion(sourceId: number, version: number) {
  try {
    fs.rmSync(archivedVersionDir(sourceId, version), { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

/** One asset reference found in the page HTML. */
interface AssetRef {
  /** The exact URL text as written in the HTML (for rewriting). */
  raw: string;
  /** Resolved absolute URL (for fetching). */
  abs: string;
}

/**
 * Collect the asset URLs a page references: <img src/srcset>, stylesheets,
 * icons, <script src>, <source src/srcset>, video posters and url(...) inside
 * inline styles. Deduped by absolute URL, capped at MAX_ASSETS.
 */
function collectAssetRefs(html: string, pageUrl: string): AssetRef[] {
  const $ = cheerio.load(html);
  const out: AssetRef[] = [];
  const seen = new Set<string>();

  const add = (raw?: string | null) => {
    const t = (raw ?? "").trim();
    if (!t) return;
    let u: URL;
    try {
      u = new URL(t, pageUrl);
    } catch {
      return;
    }
    if (!/^https?:$/.test(u.protocol)) return; // data:, blob:, mailto:, …
    const abs = u.toString();
    if (seen.has(abs)) return;
    seen.add(abs);
    out.push({ raw: t, abs });
  };

  const srcsetUrls = (v: string | undefined) => {
    if (!v) return;
    v.split(",").forEach((p) => add(p.trim().split(/\s+/)[0]));
  };

  $("img").each((_i, el) => {
    add($(el).attr("src"));
    srcsetUrls($(el).attr("srcset"));
  });
  $(
    'link[rel~="stylesheet"], link[rel~="icon"], link[rel="modulepreload"], link[rel="preload"][as="style"]'
  ).each((_i, el) => add($(el).attr("href")));
  $("script[src]").each((_i, el) => add($(el).attr("src")));
  $("source[src], source[srcset], video[poster], audio[src]").each((_i, el) => {
    add($(el).attr("src"));
    add($(el).attr("poster"));
    srcsetUrls($(el).attr("srcset"));
  });
  // url(...) inside <style> blocks and inline style attributes
  const styleTexts: string[] = [];
  $("style").each((_i, el) => {
    styleTexts.push($(el).html() ?? "");
  });
  $("[style]").each((_i, el) => {
    styleTexts.push($(el).attr("style") ?? "");
  });
  const urlRe = /url\(\s*(['"]?)(.*?)\1\s*\)/g;
  for (const t of styleTexts) {
    let m: RegExpExecArray | null;
    while ((m = urlRe.exec(t))) add(m[2]);
  }

  return out.slice(0, MAX_ASSETS);
}

/** A safe, unique relative file path for an asset URL. */
function pathForAsset(u: string): string {
  const url = new URL(u);
  let p = url.pathname.replace(/[^\w./-]/g, "_").replace(/^\/+/, "");
  if (!p) p = "asset";
  const seg = p.split("/").pop() ?? "asset";
  // No file extension → name it after a hash so it stays unique.
  if (!/\.[a-z0-9]{1,8}$/i.test(seg)) p = `${p}/x-${shortHash(u)}`;
  return p;
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) || 1 }, async () => {
    while (i < items.length) {
      const j = i++;
      await fn(items[j]);
    }
  });
  await Promise.all(workers);
}

/**
 * Archive a freshly fetched page. Downloads its assets into
 * archive/<sourceId>/v<version>/ and returns the HTML with fetched assets
 * rewritten to local /api/sources/<id>/archive URLs. If nothing could be
 * archived (or the page has no assets), the original HTML is returned.
 */
export async function archivePageHtml(
  html: string,
  pageUrl: string,
  sourceId: number,
  version: number
): Promise<string> {
  const refs = collectAssetRefs(html, pageUrl);
  if (refs.length === 0) return html;

  const destDir = archivedVersionDir(sourceId, version);
  fs.mkdirSync(destDir, { recursive: true });

  // Plan a unique relative path per asset (collision → hash name).
  const rels = new Map<string, string>(); // abs URL -> rel path
  const used = new Map<string, string>(); // rel path -> abs URL
  for (const r of refs) {
    let rel = pathForAsset(r.abs);
    const prev = used.get(rel);
    if (prev !== undefined && prev !== r.abs) {
      const ext = (new URL(r.abs).pathname.match(/\.[a-z0-9]{1,8}$/i) ?? [])[0] ?? "";
      rel = `${shortHash(r.abs)}${ext}`;
    }
    used.set(rel, r.abs);
    rels.set(r.abs, rel);
  }

  // raw URL text (as written in the HTML) -> local URL
  const rewrite = new Map<string, string>();
  await pool(refs, CONCURRENCY, async (r) => {
    const buf = await fetchBinary(r.abs, ASSET_TIMEOUT_MS, MAX_ASSET_BYTES);
    if (!buf) return;
    const rel = rels.get(r.abs)!;
    const abs = path.join(destDir, rel);
    try {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, buf);
      rewrite.set(
        r.raw,
        `/api/sources/${sourceId}/archive?version=${version}&file=${encodeURIComponent(rel)}`
      );
    } catch {
      // skip this asset
    }
  });
  if (rewrite.size === 0) return html;

  // Rewrite the HTML: every fetched asset's raw URL text (works for
  // attributes, srcset entries and inline url(...)).
  let out = html;
  for (const [raw, local] of rewrite) {
    out = out.split(raw).join(local);
  }
  return out;
}