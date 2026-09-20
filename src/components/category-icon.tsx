import { Glyph } from "./icons";
import { GLYPHS } from "@/lib/glyphs.generated";

/**
 * Auto-assigns a glyph + gradient to any category string (AI-assigned
 * categories are free text, e.g. "ai", "cnc", "cnc-controller-firmware").
 * Known domains use keyword rules; anything else falls back to a
 * deterministic hash so the same category always renders the same icon.
 *
 * When the AI picked a specific glyph for the category at classification
 * time (see the categories table / category-icons.ts), that curated Glyphs
 * icon takes precedence; the keyword/hash rules stay as the fallback.
 */

type Rule = [RegExp, string, string];

const RULES: Rule[] = [
  [
    /\b(ai|ml|llm|inference|neural|model|transformer)\b|machine[- ]learning|artificial/,
    "sparkles",
    "from-violet-500 to-fuchsia-500",
  ],
  [
    /cnc|machin|gcode|laser|3d[- ]?print|printing|robot|drone|firmware|hardware|sensor|pcb|electronic/,
    "tool",
    "from-amber-500 to-orange-600",
  ],
  [/gpu|graphics|render|vulkan|cuda|opencl|opengl|shader/, "cpu", "from-emerald-500 to-teal-500"],
  [/storage|database|\bdb\b|sql|backup|archive|file[- ]?system|disk|raid/, "database", "from-sky-500 to-blue-600"],
  [/media|video|stream|image|photo|camera|transcode|player/, "video", "from-rose-500 to-pink-600"],
  [/audio|music|sound/, "music", "from-fuchsia-500 to-pink-500"],
  [/security|auth|password|crypto|encrypt|firewall|vulnerab|privacy/, "shield", "from-red-500 to-rose-600"],
  [
    /dev ?tool|build|test|ci\/?cd|linter|compiler|sdk|framework|ide|editor|debug/,
    "code",
    "from-indigo-500 to-violet-600",
  ],
  [/\bos\b|linux|kernel|desktop|server|container|docker|kubernetes|virtual/, "monitor", "from-cyan-500 to-sky-600"],
  [/network|wifi|router|proxy|dns|vpn|\blan\b/, "wifi", "from-blue-500 to-cyan-500"],
  [/web|frontend|front[- ]?end|website|\bui\b|design|\bcss\b|javascript|typescript|react/, "globe", "from-blue-500 to-indigo-600"],
  [/game|gaming/, "gamepad", "from-purple-500 to-violet-600"],
  [/mobile|android|\bios\b/, "smartphone", "from-teal-500 to-emerald-600"],
  [/health|medical|bio|fitness/, "heart", "from-rose-500 to-red-500"],
  [/plant|garden|nature|agri|botan|flora|seeds?\b|orchard|greenhouse|herb|vegetable/, "seedling", "from-green-500 to-emerald-600"],
  [/\bcoffee|cafe|\btea\b|bake|food|recipe|restaurant|kitchen|\bdrink|barista|brew/, "coffee", "from-amber-600 to-orange-500"],
  [/\bcar(s)?\b|vehicle|driving|garage|automot|motorcycle|racing|fleet/, "car", "from-slate-500 to-slate-600"],
  [/\btravel|trip|tourism|vacation|hotel|camp|camping|hiking|outdoor/, "ticket", "from-sky-400 to-blue-500"],
  [/weather|forecast/, "sun", "from-amber-400 to-orange-500"],
  [/finance|payment|trading|bank|budget/, "trending", "from-green-500 to-emerald-600"],
  [/science|research|\bdata\b|analytic/, "star", "from-amber-400 to-yellow-500"],
  [/\bidea|blog|journal|writing|reading|course|notes?\b/, "lightbulb-1", "from-violet-400 to-purple-500"],
  [/uncategorized/, "folder", "from-slate-500 to-slate-600"],
];

const FALLBACK: { glyph: string; gradient: string }[] = [
  { glyph: "box", gradient: "from-blue-500 to-indigo-600" },
  { glyph: "layers", gradient: "from-violet-500 to-purple-600" },
  { glyph: "bolt", gradient: "from-amber-500 to-yellow-500" },
  { glyph: "star", gradient: "from-fuchsia-500 to-pink-600" },
  { glyph: "globe", gradient: "from-cyan-500 to-sky-600" },
  { glyph: "grid", gradient: "from-emerald-500 to-teal-600" },
];

export function iconForCategory(category: string | null | undefined): { glyph: string; gradient: string } {
  const c = (category ?? "uncategorized").toLowerCase();
  for (const [re, glyph, gradient] of RULES) {
    if (re.test(c)) return { glyph, gradient };
  }
  let h = 0;
  for (let i = 0; i < c.length; i++) h = (h * 31 + c.charCodeAt(i)) >>> 0;
  return FALLBACK[h % FALLBACK.length];
}

export default function CategoryIcon({
  category,
  size = "md",
  icon = null,
}: {
  category: string;
  size?: "sm" | "md";
  /** AI-picked glyph name for this category (validated against GLYPHS). */
  icon?: string | null;
}) {
  const { glyph, gradient } = iconForCategory(category);
  const name = icon && GLYPHS[icon] ? icon : glyph;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center bg-gradient-to-br text-white shadow-md ${gradient} ${
        size === "sm" ? "h-5 w-5 rounded-md" : "h-7 w-7 rounded-lg"
      }`}
      aria-hidden="true"
    >
      <Glyph name={name} className={size === "sm" ? "h-3 w-3" : "h-4 w-4"} />
    </span>
  );
}
