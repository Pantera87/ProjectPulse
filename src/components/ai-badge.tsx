/**
 * Small "AI" badge marking content produced by an AI provider: project
 * summaries, AI-classified categories, AI-extracted goals, AI-written update
 * summaries and AI semantic matches. Server-safe (no hooks) — usable in both
 * server components and client components.
 */
export default function AiBadge({ title }: { title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex shrink-0 items-center rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-300"
    >
      AI
    </span>
  );
}
