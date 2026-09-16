import fs from "node:fs";
import path from "node:path";
import type { Browser } from "puppeteer";
import { dataDir } from "./db";

/**
 * Visual screenshots via headless Chrome (Puppeteer).
 *
 * - Websites: each new snapshot stores a PNG of the rendered page.
 * - GitHub: repo page screenshot + project logo (repo owner avatar).
 *
 * Everything here is best-effort: failures are logged, never thrown, so a
 * missing browser or a slow site cannot break the checker.
 */

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

let browserPromise: Promise<Browser> | null = null;

/** Lazily launch (and reuse) a single headless Chrome instance. */
function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const puppeteer = await import("puppeteer");
      const browser = await puppeteer.default.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--hide-scrollbars",
          "--force-color-profile=srgb",
          "--lang=en-US",
        ],
      });
      browser.on("disconnected", () => {
        browserPromise = null;
      });
      return browser;
    })().catch((e) => {
      browserPromise = null;
      throw e;
    });
  }
  return browserPromise;
}

/**
 * Render `url` in headless Chrome and save a PNG screenshot.
 * @param destRelPath path relative to DATA_DIR, e.g. "screenshots/1-v3.png"
 * @returns true on success
 */
export async function captureScreenshot(
  url: string,
  destRelPath: string,
  opts: { github?: boolean } = {}
): Promise<boolean> {
  const abs = path.join(dataDir(), destRelPath);
  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
      await page.setUserAgent(UA);
      if (opts.github && process.env.GITHUB_TOKEN) {
        // Logged-in render: avoids the sign-in interstitial and shows more of the page.
        await page.setCookie({
          name: "private-token",
          value: process.env.GITHUB_TOKEN,
          domain: "github.com",
          path: "/",
        });
      }
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      try {
        await page.waitForNetworkIdle({ idleTime: 1000, timeout: 8_000 });
      } catch {
        // page keeps loading — fine, screenshot what we have
      }
      await new Promise((r) => setTimeout(r, 400));
      await page.screenshot({ path: abs, type: "png" });
      return true;
    } finally {
      await page.close().catch(() => {});
    }
  } catch (e) {
    console.error(`[screenshot] failed for ${url}:`, e instanceof Error ? e.message : e);
    return false;
  }
}

/** Download a binary file (e.g. the GitHub repo avatar) into DATA_DIR. */
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

/** True if the file at DATA_DIR/rel does not exist, is older than maxAgeDays, or age is unknown. */
export function fileIsStale(rel: string, maxAgeDays = 30): boolean {
  try {
    const st = fs.statSync(path.join(dataDir(), rel));
    return Date.now() - st.mtimeMs > maxAgeDays * 86_400_000;
  } catch {
    return true;
  }
}