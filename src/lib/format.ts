/**
 * Deterministic timestamp formatting that renders identically on the
 * server (Node) and during client hydration.
 *
 * Locale-dependent formatting like Date.prototype.toLocaleString() with the
 * user's locale produces different output on the server vs. the browser,
 * which causes React hydration mismatches. Pinning the locale to "en-US" and
 * the timezone to UTC makes the string stable across both environments.
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
}
