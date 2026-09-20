#!/usr/bin/env node
/**
 * Fetch a curated subset of the Iconify "Glyphs" icon set and generate
 * src/lib/glyphs.generated.ts.
 *
 * Source set: "Glyphs" by Goran Spasojevic (gorango/glyphs), MIT license —
 * https://icon-sets.iconify.design/glyphs/ (no attribution required).
 * The set is stroke-based on an 80x80 grid (fill="none"
 * stroke="currentColor"), the same visual family as the hand-drawn icons in
 * src/components/icons.tsx.
 *
 * What the generated file provides (single source of truth):
 *   GLYPHS  — name -> inner-SVG body, rendered by <Glyph> in icons.tsx
 *   GLYPH_NAMES — the curated names, appended to the AI category prompt so
 *                 the model can pick a glyph for each new category
 *
 * The file is committed to the repo: the app has NO runtime dependency on
 * the Iconify API (it works fully offline). Re-run to refresh or extend:
 *
 *   npm run icons:fetch
 *
 * Names not present in the live collection are dropped with a warning.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.iconify.design";
const PREFIX = "glyphs";
const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "lib",
  "glyphs.generated.ts"
);

/**
 * Curated base glyph names (style variants -bold/-duo/-outline excluded)
 * suited to classifying software projects. Every name is validated against
 * the live collection at generation time.
 */
const CURATED = [
  // AI / neural
  "brain", "eye", "eye-1", "eye-slash", "sparkle", "sparkles",
  // compute / devices
  "battery", "battery-bolt", "battery-charge", "calculator", "cli", "code",
  "code-1", "hard-drive", "headphones", "keyboard", "laptop", "laptop-cli",
  "laptop-code", "laptop-cog", "mobile", "mobile-tablet", "monitor",
  "plug", "plug-1", "sd-card", "sim-card", "speaker", "tablet", "tv-retro",
  // settings / tools
  "cog", "cog-1", "cogs", "cogwheel", "hammer", "light-switch", "lightbulb-1",
  "lightbulb-2", "mallet", "ruler", "screwdriver", "sliders", "toggle",
  "toggle-1", "toolbox", "tools", "wrench",
  // servers / infrastructure
  "building", "building-1", "box", "box-open", "buildings", "cloud",
  "grid", "grid-lg", "grid-list", "grid-sm", "layer-group", "layer-plus",
  // network / connectivity
  "globe", "globe-earth", "globe-stand", "link", "satellite",
  "satellite-dish", "signal", "signal-tower", "window", "wifi",
  // security / privacy
  "badge", "certificate", "key", "keycap", "lock", "lock-open", "person-private",
  "shield", "shield-exclamation", "user-private", "virus",
  // data / documents
  "archive", "bookmark", "bookmarks", "clipboard", "copy", "docs", "file",
  "file-add", "folder", "folder-open", "page-break", "paperclip", "save",
  "search",
  // analytics / metrics
  "activity", "analytics", "chart-bar", "chart-donut", "chart-line", "chart-pie",
  "chart-pie-slice",
  // media / audio / video
  "aperture", "camera", "crop", "dslr", "film", "image", "images", "microphone",
  "music", "music-note", "pause", "play", "play-circle", "playback-speed",
  "polaroid", "record", "replay", "repeat", "stop", "video", "volume",
  "volume-mute", "zoom-in", "zoom-out",
  // web / UI
  "bezier-curve", "bold", "box-layout-2", "cursor", "font", "h-1", "h-2",
  "heading", "italic", "layout-1", "layout-2", "mouse", "mouse-pointer",
  "quote", "shapes", "text", "underline",
  // games
  "club", "d-pad", "dice", "diamond", "gamepad", "joker", "king", "queen",
  "spade", "target", "trophy",
  // robotics / maker / hardware
  "anchor", "compass", "crosshairs", "magnet", "printer", "puzzle",
  "puzzle-piece", "robot", "robot-head", "target-pointer",
  // transport / vehicles
  "ambulance", "bike", "bus", "car", "car-side", "electric-scooter",
  "helicopter", "pickup-truck", "plane", "rocket", "scooter", "ship", "subway",
  "train", "truck", "van",
  // science / research
  "graduation-cap", "hexagon", "leaf", "math", "microscope", "planet-moon",
  "seedling", "tree", "venn",
  // weather / environment
  "droplet", "hurricane", "lightning", "moon", "night", "rain", "snow",
  "snowflake", "sun", "temperature", "tornado", "waves", "wind",
  // business / finance
  "briefcase", "coin", "credit-card", "dollar-bill", "dollar-bills",
  "dollar-sign", "discount", "hand-holding-dollar", "handshake", "receipt",
  "shopping-bag", "shopping-cart", "stamp", "store", "ticket", "wallet",
  // health / medical
  "bandage", "glasses", "heart", "heart-hands", "heartbreak", "heartbeat",
  "hospital-sign", "life-ring", "note-medical", "pharmacy", "pill", "skull",
  // communication / people
  "baby", "child", "comment", "comment-add", "comment-exclamation",
  "comment-info", "envelope", "envelope-open", "exclamation",
  "exclamation-triangle", "female", "info-circle", "mailbox", "male", "person",
  "phone", "question", "question-circle", "send", "user", "user-circle",
  "users",
  // office / notes
  "book", "book-open", "books", "note", "note-clipboard", "note-sticky",
  "paint-brush", "palette", "pen", "pen-nib", "pencil", "scissors", "scroll",
  // status / feedback / time
  "alarm-clock", "alarm-exclamation", "alarm-plus", "bell", "bell-add",
  "bell-ring", "bell-slash", "bells", "check", "check-badge", "check-circle",
  "clock", "clock-fast", "cross", "equals", "divide", "flag", "history",
  "hourglass", "minus", "plus", "star", "star-half", "timer", "timer-fast",
  "times", "watch", "watch-fitness",
  // navigation / places
  "arrow", "arrow-circle", "arrow-external", "caret", "chevron",
  "chevron-double", "house", "landmark", "map", "map-marker", "road",
  "route", "stop-sign", "street-view", "u-turn",
  // misc
  "barcode", "calendar", "crown", "disc", "gift", "qr",
];

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.json();
}

async function main() {
  // 1. Live name list of the set (flat list under category keys).
  const collection = await getJson(`${API}/collection?prefix=${PREFIX}`);
  const all = new Set(Object.values(collection).flat());
  const missing = CURATED.filter((n) => !all.has(n));
  if (missing.length) console.warn(`[glyphs] not in set, dropped: ${missing.join(", ")}`);
  const names = CURATED.filter((n) => all.has(n));
  if (!names.length) throw new Error("No curated names matched the live collection");

  // 2. Bodies for the curated names in one batched request.
  const data = await getJson(`${API}/${PREFIX}.json?icons=${names.join(",")}`);
  const width = data.width ?? 80;
  const height = data.height ?? 80;
  const got = names.filter((n) => data.icons?.[n]?.body);
  const lost = names.filter((n) => !data.icons?.[n]?.body);
  if (lost.length) console.warn(`[glyphs] no body returned, dropped: ${lost.join(", ")}`);
  if (!got.length) throw new Error("Iconify returned no icon bodies");

  // 3. Generate the TypeScript module. JSON.stringify each body: SVG markup
  //    only ever needs quote/escape handling, never template interpolation.
  const entries = got
    .map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(data.icons[n].body)},`)
    .join("\n");
  const src = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Curated subset of the Iconify "Glyphs" icon set (MIT, gorango/glyphs),
 * stroke-based on an ${width}x${height} grid. Regenerate with:
 *
 *   npm run icons:fetch
 *
 * GLYPHS      name -> inner-SVG body (rendered by <Glyph> in icons.tsx)
 * GLYPH_NAMES the curated names — also fed to the AI category prompt
 */
export const GLYPH_WIDTH = ${width};
export const GLYPH_HEIGHT = ${height};

export const GLYPH_NAMES: string[] = [
${names.map((n) => `  ${JSON.stringify(n)},`).join("\n")}
];

export const GLYPHS: Record<string, string> = {
${entries}
};
`;
  writeFileSync(OUT, src, "utf8");
  console.log(`[glyphs] wrote ${OUT} (${got.length}/${names.length} icons, ${width}x${height})`);
}

main().catch((e) => {
  console.error("[glyphs] fetch failed:", e.message);
  process.exit(1);
});
