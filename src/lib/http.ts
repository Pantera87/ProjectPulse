import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./db";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 ProjectPulse/1.0";

export interface FetchOpts {
  timeoutMs?: number;
  headers?: Record<string, string>;
  maxBytes?: number;
}

/** Fetch with UA, timeout and size cap. Throws on HTTP error status. */
export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      ...opts.headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const cap = opts.maxBytes ?? 5_000_000;
  return buf.subarray(0, cap).toString("utf8");
}

/**
 * Fetch a binary asset (image, css, js, …). Best-effort: returns null on any
 * failure, oversized payload or bad status instead of throwing.
 */
export async function fetchBinary(
  url: string,
  timeoutMs = 10_000,
  maxBytes = 2 * 1024 * 1024
): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": UA, accept: "*/*" },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 && buf.length <= maxBytes ? buf : null;
  } catch {
    return null;
  }
}

/**
 * Download a binary file (e.g. the GitHub repo avatar) into DATA_DIR.
 * Best-effort: returns false on any failure instead of throwing.
 */
export async function downloadFile(url: string, destRelPath: string): Promise<boolean> {
  const abs = path.join(dataDir(), destRelPath);
  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
      headers: { "user-agent": UA },
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 5_000_000) return false;
    fs.writeFileSync(abs, buf);
    return true;
  } catch (e) {
    console.error(`[download] failed for ${url}:`, e instanceof Error ? e.message : e);
    return false;
  }
}
