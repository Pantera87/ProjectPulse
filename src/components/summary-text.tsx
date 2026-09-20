"use client";

/**
 * Renders a stored AI project summary. AI summaries are bullet lists (one
 * point per line) — render them as a proper list; any non-bullet summary
 * (older rows, non-AI providers) falls back to plain text.
 * (The "AI" corner badge lives on the surrounding summary box.)
 */
export default function SummaryText({ text }: { text: string }) {
  const items = text
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
  const isList = items.length >= 2 && text.split("\n").some((l) => /^\s*[-*•]/.test(l));
  return (
    <p className="leading-relaxed">
      {isList ? (
        <span className="inline">
          {items.map((it, i) => (
            <span key={i} className="block">
              • {it}
            </span>
          ))}
        </span>
      ) : (
        text
      )}
    </p>
  );
}