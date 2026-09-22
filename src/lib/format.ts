/**
 * Deterministic timestamp formatting that renders identically on the
 * server (Node) and during client hydration.
 *
 * Locale-dependent formatting like Date.prototype.toLocaleString() with the
 * user's locale produces different output on the server vs. the browser,
 * which causes React hydration mismatches. Pinning the locale to "en-US" and
 * a fixed timezone keeps the string stable across both environments.
 *
 * The timezone comes from the TZ environment variable (set in
 * docker-compose.yml). On the server it is read at request time; client
 * components render timestamps through the <Time/> component, which asks
 * the server for it via /api/timezone — so changing TZ in the compose file
 * (and restarting the container) is enough, no image rebuild required.
 */

/** The IANA timezone the UI should display in, falling back to UTC. */
export function displayTimezone(): string {
  const tz = process.env.TZ || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/**
 * Display name for a GitHub source in the updates feed: auto-filled names
 * arrive as the API's "owner/repo" full name, but updates only show the
 * repository name (e.g. "ProjectPulse", not "owner/ProjectPulse").
 * Non-GitHub sources and custom names pass through unchanged.
 */
export function repoDisplayName(
  sourceType: string,
  name: string | null | undefined
): string | null | undefined {
  if (!name) return name;
  if (sourceType !== "github") return name;
  const m = name.match(/^[\w.-]+\/([\w.-]+)$/);
  return m ? m[1] : name;
}

export function formatDateTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    timeZone: timeZone || displayTimezone(),
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
}
