"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";

const TZ_KEY = "pp_display_tz";

let tzPromise: Promise<string> | null = null;

/** Ask the server for the configured display timezone (fetched once per page load). */
function loadTimezone(): Promise<string> {
  if (!tzPromise) {
    tzPromise = fetch("/api/timezone")
      .then((r) => r.json())
      .then((d) => (d && typeof d.timezone === "string" && d.timezone ? d.timezone : "UTC"))
      .catch(() => "UTC");
  }
  return tzPromise;
}

/**
 * Renders a timestamp in the timezone configured via the TZ environment
 * variable (docker-compose.yml). The timezone is fetched from the server
 * once per page load (and cached in localStorage), so changing TZ in the
 * compose file takes effect on the next page load — no image rebuild.
 */
export default function Time({
  iso,
  className,
}: {
  iso: string | null | undefined;
  className?: string;
}) {
  const [tz, setTz] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem(TZ_KEY)
  );

  useEffect(() => {
    let alive = true;
    loadTimezone().then((t) => {
      try {
        window.localStorage.setItem(TZ_KEY, t);
      } catch {}
      if (alive) setTz(t);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <span className={className} suppressHydrationWarning>
      {formatDateTime(iso, tz ?? undefined)}
    </span>
  );
}
