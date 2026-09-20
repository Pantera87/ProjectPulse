#!/usr/bin/env node
/**
 * Fetch a curated subset of Iconify icon sets and generate
 * src/lib/glyphs.generated.ts.
 *
 * Primary set: "Glyphs" by Goran Spasojevic (gorango/glyphs), MIT license —
 * https://icon-sets.iconify.design/glyphs/ (no attribution required).
 * Stroke-based on an 80x80 grid (fill="none" stroke="currentColor"), the
 * same visual family as the hand-drawn icons in src/components/icons.tsx.
 *
 * Filler set: "Lucide" (ISC license) fills lifestyle gaps the "Glyphs" set
 * has none of (coffee/food/drink, a few plants and travel items). It is
 * 24x24 with a 2px stroke, so generated entries carry their own dimensions
 * (GLYPH_DIMS) and <Glyph> renders them on the matching grid.
 *
 * What the generated file provides (single source of truth):
 *   GLYPHS  — name -> inner-SVG body, rendered by <Glyph> in icons.tsx
 *   GLYPH_NAMES — the curated names, appended to the AI category prompt so
 *                 the model can pick a glyph for each new category
 *   GLYPH_DIMS — per-icon grid size + stroke width for every icon that is
 *                not on the primary 80x80 grid (stroke 4)
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
// Default grid: the primary "glyphs" set. Icons off this grid get their own
// entry in the generated GLYPH_DIMS map (see <Glyph> in src/components/icons.tsx).
const GLYPH_WIDTH = 80;
const GLYPH_HEIGHT = 80;
const GLYPH_STROKE = 4;
const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "lib",
  "glyphs.generated.ts"
);

/**
 * Curated base glyph names from the primary "Glyphs" set (style variants
 * -bold/-duo/-outline excluded) for classifying projects — software AND
 * lifestyle (plants, cars, travel, weather, …). Every name is validated
 * against the live collection at generation time.
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
  "shield", "shield-exclamation", "virus",
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
  "route", "stop-sign", "street-view",
  // misc
  "barcode", "calendar", "crown", "disc", "gift", "qr",
  // plants / nature
  "hand-holding-seedling", "leaf-1", "maple-leaf", "palm-tree", "tree-1",
  // cars / vehicles
  "car-wash", "garage", "kick-scooter", "race-car", "ship-water",
  // travel / outdoors
  "camp", "campfire", "hotel", "tent",
  // weather (dawn/dusk + extremes)
  "sunny-mostly", "sunrise", "sunset", "temperature-cold", "temperature-hot",
  "windsock",
];

/**
 * Lifestyle icons the "Glyphs" set has none of (verified against the live
 * Lucide collection): coffee/food/drink plus a few plant and travel extras.
 * Rendered on a 24x24 grid — see GLYPH_DIMS in the generated file.
 */
const LUCIDE = [
  // coffee / food / drink
  "beer", "banana", "cake", "candy", "carrot", "cherry", "citrus", "coffee",
  "cookie", "croissant", "cup-soda", "donut", "egg", "fish", "grape", "martini",
  "milk", "pizza", "popcorn", "salad", "sandwich", "shrimp", "soup", "utensils",
  "utensils-crossed", "wine", "ice-cream-bowl", "ice-cream-cone",
  // plants
  "clover", "flower", "flower-2", "rose", "sprout", "trees",
  // travel / outdoors
  "luggage", "map-pin", "mountain", "mountain-snow", "tractor",
];

/**
 * Source sets, in priority order (first set wins on a name collision).
 * strokeWidth is the inherited stroke <Glyph> uses for the set's grid.
 */
const SETS = [
  {
    prefix: "glyphs", // MIT — primary 80x80 stroke set
    strokeWidth: GLYPH_STROKE,
    names: CURATED,
  },
  {
    prefix: "lucide", // ISC — lifestyle gaps the "glyphs" set doesn't cover
    strokeWidth: 2,
    names: LUCIDE,
  },
];

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const names = []; // ordered, deduped (first set wins)
  const bodies = {};
  const dims = {};

  for (const set of SETS) {
    // 1. Live name list of the set (flat list under category keys).
    const collection = await getJson(`${API}/collection?prefix=${set.prefix}`);
    const all = new Set(
      Object.values(collection).flat().filter((x) => typeof x === "string")
    );
    const missing = set.names.filter((n) => !all.has(n));
    if (missing.length)
      console.warn(`[glyphs] ${set.prefix}: not in set, dropped: ${missing.join(", ")}`);
    const wanted = set.names.filter((n) => all.has(n));
    if (!wanted.length) continue;

    // 2. Bodies for the wanted names in one batched request.
    const data = await getJson(`${API}/${set.prefix}.json?icons=${wanted.join(",")}`);
    const width = data.width ?? 80;
    const height = data.height ?? 80;
    const got = wanted.filter((n) => data.icons?.[n]?.body);
    const lost = wanted.filter((n) => !data.icons?.[n]?.body);
    if (lost.length)
      console.warn(`[glyphs] ${set.prefix}: no body returned, dropped: ${lost.join(", ")}`);

    for (const n of got) {
      if (bodies[n]) {
        console.warn(`[glyphs] name collision across sets, keeping first: ${n}`);
        continue;
      }
      bodies[n] = data.icons[n].body;
      dims[n] = {
        w: data.icons[n].width ?? width,
        h: data.icons[n].height ?? height,
        sw: set.strokeWidth,
      };
      names.push(n);
    }
  }
  if (!names.length) throw new Error("No curated names matched the live collections");

  // 3. Generate the TypeScript module. JSON.stringify each body: SVG markup
  //    only ever needs quote/escape handling, never template interpolation.
  const entries = names
    .map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(bodies[n])},`)
    .join("\n");
  // Only icons off the primary 80x80/stroke-4 grid need their own entry.
  const dimEntries = names
    .filter((n) => dims[n].w !== GLYPH_WIDTH || dims[n].h !== GLYPH_HEIGHT || dims[n].sw !== GLYPH_STROKE)
    .map(
      (n) =>
        `  ${JSON.stringify(n)}: { w: ${dims[n].w}, h: ${dims[n].h}, sw: ${dims[n].sw} },`
    )
    .join("\n");
  const src = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Curated subset of two Iconify icon sets, stroke-based (fill="none"
 * stroke="currentColor"):
 *   "Glyphs" (MIT, gorango/glyphs) on an 80x80 grid, stroke 4, and
 *   "Lucide" (ISC) on a 24x24 grid, stroke 2, for lifestyle icons the
 *   primary set lacks. Regenerate with:
 *
 *   npm run icons:fetch
 *
 * GLYPHS       name -> inner-SVG body (rendered by <Glyph> in icons.tsx)
 * GLYPH_NAMES  the curated names — also fed to the AI category prompt
 * GLYPH_DIMS   grid size + stroke width for every icon NOT on the default
 *              80x80 grid (GLYPH_WIDTH/GLYPH_HEIGHT, stroke
 *              GLYPH_STROKE_WIDTH)
 */
export const GLYPH_WIDTH = ${GLYPH_WIDTH};
export const GLYPH_HEIGHT = ${GLYPH_HEIGHT};
export const GLYPH_STROKE_WIDTH = ${GLYPH_STROKE};

export const GLYPH_NAMES: string[] = [
${names.map((n) => `  ${JSON.stringify(n)},`).join("\n")}
];

export const GLYPH_DIMS: Record<string, { w: number; h: number; sw: number }> = {
${dimEntries}
};

export const GLYPHS: Record<string, string> = {
${entries}
};
`;
  writeFileSync(OUT, src, "utf8");
  console.log(`[glyphs] wrote ${OUT} (${names.length} icons)`);
}

main().catch((e) => {
  console.error("[glyphs] fetch failed:", e.message);
  process.exit(1);
});
