/**
 * One-off helper: capture README screenshots for public/screenshots/.
 *
 * - Restores the missing website snapshot (source 11) via the designed
 *   "re-baseline" path: feed_url is temporarily removed from state_json so
 *   a full page check stores a fresh baseline snapshot (no update entry),
 *   then state_json is restored.
 * - Screenshots the 6 README placeholders with puppeteer-core + system Chrome.
 *
 * Usage: node scripts/screenshot.cjs   (dev server must be running on :4701)
 */
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const puppeteer = require("puppeteer-core");

const BASE = "http://localhost:4701";
const OUT = path.join(__dirname, "..", "public", "screenshots");
const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function restoreWebsiteSnapshot() {
  const db = new Database("data/projectpulse.db");
  const row = db
    .prepare("SELECT state_json FROM sources WHERE id = 11")
    .get();
  const original = row.state_json;
  const state = JSON.parse(original || "{}");
  const hadFeed = state.feed_url;
  delete state.feed_url; // force the page path (re-baseline stores a snapshot, no update)
  db.prepare("UPDATE sources SET state_json = ? WHERE id = 11").run(
    JSON.stringify(state)
  );
  let resp;
  try {
    resp = await fetch(`${BASE}/api/sources/11/check`, { method: "POST" });
    console.log("check result:", await resp.text());
  } finally {
    // Restore the feed state so scheduled behaviour is unchanged.
    db.prepare("UPDATE sources SET state_json = ? WHERE id = 11").run(original);
    db.close();
  }
  const db2 = new Database("data/projectpulse.db", { readonly: true });
  const snap = db2
    .prepare("SELECT version, LENGTH(html) l FROM snapshots WHERE source_id = 11")
    .all();
  db2.close();
  console.log("website snapshots now:", JSON.stringify(snap), "(feed restored:", !!hadFeed, ")");
}

const baseCss = () =>
  `
  [data-floating-check] { display: none !important; }
  nextjs-portal { display: none !important; }
  * { scrollbar-width: none; }
  *::-webkit-scrollbar { display: none; }
  `;

async function shot(page, name, { url, fullPage = false, fitToContent = false, settle = 1500 } = {}) {
  if (url) {
    await page.goto(`${BASE}${url}`, { waitUntil: "networkidle0", timeout: 60000 }).catch(() => {});
  }
  await page.addStyleTag({ content: baseCss() });
  await sleep(settle);
  const file = path.join(OUT, `${name}.png`);
  if (fitToContent) {
    // Body/main use flex-1 min-h-full, so the footer sits at the viewport
    // bottom even when content is short. Instead, measure the real content
    // bottom inside <main>, hide the footer, and clip there.
    const h = await page.evaluate(() => {
      const f = document.querySelector("footer");
      if (f) f.style.display = "none";
      const scope = document.querySelector("main") || document.body;
      let bottom = 0;
      // Children only — the scope itself is stretched by flex-1 to the
      // viewport bottom, which would defeat the clip.
      const els = scope.querySelectorAll("*");
      if (!els.length) return 400;
      for (const e of els) {
        const r = e.getBoundingClientRect();
        if (r.bottom > bottom) bottom = r.bottom;
      }
      return bottom;
    });
    await page.screenshot({
      path: file,
      clip: { x: 0, y: 0, width: 1440, height: Math.round(h + 28) },
    });
    await page.evaluate(() => {
      const f = document.querySelector("footer");
      if (f) f.style.display = "";
    });
  } else {
    await page.screenshot({ path: file, fullPage });
  }
  console.log("saved", file);
}

async function shotSection(page, name, h2Text, { settle = 800 } = {}) {
  await page.addStyleTag({ content: baseCss() });
  await page.evaluate((label) => {
    document.querySelectorAll("section").forEach((s) => {
      const h = s.querySelector("h2");
      if (h && h.textContent.trim() === label) s.setAttribute("data-shot", "yes");
    });
  }, h2Text);
  const el = await page.$("section[data-shot='yes']");
  if (!el) throw new Error(`section with h2 "${h2Text}" not found`);
  await el.evaluate((n) => n.scrollIntoView({ block: "center" }));
  await sleep(settle);
  const file = path.join(OUT, `${name}.png`);
  await el.screenshot({ path: file });
  console.log("saved", file);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  if (process.env.SKIP_REBASELINE === "1") {
    console.log("step 1: skipped (SKIP_REBASELINE=1)");
  } else {
    console.log("step 1: restore website snapshot for source 11 ...");
    await restoreWebsiteSnapshot();
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME,
    args: ["--no-sandbox", "--hide-scrollbars", "--force-color-profile=srgb", "--font-render-hinting=none"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  // 1. Dashboard
  await shot(page, "dashboard", { url: "/", settle: 2500 });

  // 2. Updates feed (fit content — page is min-h-screen and looks empty otherwise)
  await shot(page, "updates", { url: "/updates", fitToContent: true, settle: 2000 });

  // 3. Website snapshot (iframe rendered offline)
  await page.goto(`${BASE}/websites/11`, { waitUntil: "networkidle0", timeout: 60000 }).catch(() => {});
  await page.addStyleTag({ content: baseCss() });
  await page
    .waitForFunction(
      () => {
        const f = document.querySelector(
          'iframe[title="website snapshot (offline archive)"], iframe[title="website snapshot"]'
        );
        return f && f.contentDocument && f.contentDocument.readyState === "complete";
      },
      { timeout: 30000 }
    )
    .catch(() => console.warn("iframe not ready, continuing anyway"));
  await sleep(2000);
  await shotSection(page, "website-snapshot", "Snapshot (offline archive)", { settle: 500 }).catch(async () => {
    await shotSection(page, "website-snapshot", "Snapshot (read offline)");
  });

  // 4. GitHub repo detail
  await shot(page, "github-repo", { url: "/repos/1", fullPage: true, settle: 2000 });

  // 5. Keyword rules section (FreeToken has a critical rule: rocm, amd)
  await page.goto(`${BASE}/repos/1`, { waitUntil: "networkidle0", timeout: 60000 }).catch(() => {});
  await sleep(2000);
  await shotSection(page, "keyword-rules", "Keyword rules");

  // 6. Settings -> AI
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0", timeout: 60000 }).catch(() => {});
  await sleep(3000);
  await shotSection(page, "settings-ai", "AI", { settle: 1000 });

  await browser.close();
  console.log("done.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
