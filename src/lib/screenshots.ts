import fs from "node:fs";
import path from "node:path";
import type { Browser } from "puppeteer";
import { dataDir, getDb, getSetting } from "./db";

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

/** Render color scheme for screenshots ("dark" is the default). */
export type ScreenshotTheme = "dark" | "light";
const THEME_KEY = "screenshot_theme";

/** Read the configured screenshot theme (defaults to dark). */
export function screenshotTheme(): ScreenshotTheme {
  try {
    return getSetting(getDb(), THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

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
      // Render the page with the user's preferred color scheme (default dark)
      // so `prefers-color-scheme` aware sites match the configured theme.
      await page.emulateMediaFeatures([
        { name: "prefers-color-scheme", value: screenshotTheme() },
      ]);
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
      if (opts.github) {
        // Frame the start of the README: scroll it to the top of the viewport
        // (just below the sticky tab bar) so the screenshot shows the
        // README's logo/banner and opening text instead of the file list.
        // README images are lazy-loaded, so wait for network activity to
        // settle again after scrolling before shooting.
        try {
          await page.evaluate(() => {
            const readme =
              document.querySelector("#readme .markdown-body") ??
              document.querySelector("#readme") ??
              document.querySelector("article.markdown-body");
            if (!readme) return;
            // Height of whatever sticks to the top (tab bar / file nav)
            // so the first README line isn't hidden behind it.
            const stickyH = Array.from(document.querySelectorAll("*"))
              .filter(
                (e) =>
                  getComputedStyle(e).position === "sticky" &&
                  e.getBoundingClientRect().width > 500
              )
              .reduce((m, e) => Math.max(m, e.getBoundingClientRect().height), 0);
            const top =
              window.scrollY + readme.getBoundingClientRect().top - stickyH;
            window.scrollTo(0, top);
          });
          try {
            await page.waitForNetworkIdle({ idleTime: 800, timeout: 6000 });
          } catch {
            // images keep loading — screenshot what we have
          }
          await new Promise((r) => setTimeout(r, 500));
        } catch {
          // no README / page layout differs — screenshot at current position
        }
      }
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