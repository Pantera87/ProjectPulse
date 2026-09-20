/**
 * Small "AI" badge marking content produced by an AI provider: project
 * summaries, AI-classified categories, AI-extracted goals, AI-written update
 * summaries and AI semantic matches. Server-safe (no hooks) — usable in both
 * server components and client components.
 *
 * By default it flows inline with the text it annotates. Pass `corner` to pin
 * it to the top-right corner of a `relative` parent (a card, box or row).
 */
import { Glyph } from "./icons";

export default function AiBadge({
  title,
  corner = false,
  small = false,
}: {
  title?: string;
  corner?: boolean;
  /** Compact size for use inside inputs/tight spots. */
  small?: boolean;
}) {
  return (
    <span
      title={title}
      className={
        corner
          ? "absolute -right-2 -top-2 z-10 inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300"
          : small
            ? "inline-flex shrink-0 items-center gap-0.5 rounded-full border border-amber-400/30 bg-amber-400/15 px-1 py-px text-[8px] font-semibold leading-none text-amber-300"
            : "inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300"
      }
    >
      <Glyph name="sparkles" className={small ? "h-2 w-2" : "h-3 w-3"} />
      AI
    </span>
  );
}
