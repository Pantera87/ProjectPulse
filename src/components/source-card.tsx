"use client";

import Link from "next/link";
import Image from "next/image";
import type { SourceRow } from "@/lib/db";
import SourceActions from "./source-actions";
import AiBadge from "./ai-badge";
import Sparkline from "./dashboard/sparkline";
import { Glyph, KIND_ICON } from "./icons";
import Time from "./time";
import StatusDot from "./status-dot";

// Glyph name for the source type icon tile; the gradient behind it is the
// shared brand tile (.brand-tile).
const TYPE_ICON: Record<string, string> = {
  website: "globe",
  github: "github",
  rss: "rss",
};

const PRIORITY_DOT: Record<string, string> = {
  critical: "bg-rose-400",
  high: "bg-amber-400",
  normal: "bg-sky-400",
};

export default function SourceCard({
  source,
  muted,
  compact = false,
  unread = 0,
  density,
  latest = null,
  activity = null,
  newsSinceCheck = 0,
}: {
  source: SourceRow;
  muted: boolean;
  /** Denser card for the dashboard grid layout (shorthand for density="compact"). */
  compact?: boolean;
  /** Unread count, shown as the big number in the stat tile. */
  unread?: number;
  /**
   * Card density for dashboard grids: "comfortable" (default) full stat
   * tile, "compact" tile without the latest-update/goal lines,
   * "minimal" one status line.
   */
  density?: "comfortable" | "compact" | "minimal";
  /** Newest update of this source, shown on comfortable tiles. */
  latest?: { id: number; kind: string; priority: string; title: string; created_at: string } | null;
  /** Update count per day, last 7 days (index 0 = 6 days ago) — sparkline. */
  activity?: number[] | null;
  /** Updates created since the last check of this source ("+N since last check"). */
  newsSinceCheck?: number;
}) {
  const mode = density ?? (compact ? "compact" : "comfortable");
  const detailHref =
    source.type === "github"
      ? `/repos/${source.id}`
      : source.type === "rss"
        ? `/feeds/${source.id}`
        : `/websites/${source.id}`;

  if (mode === "minimal") {
    return (
      <div className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-white/5">
        <span className="h-3.5 w-1 shrink-0 rounded-full aurora-stripe" />
        <StatusDot
          lastCheckedAt={source.last_checked_at}
          intervalHours={source.check_interval_hours}
          lastError={source.last_error}
        />
        <Link
          href={detailHref}
          className="min-w-0 flex-1 truncate text-sm text-slate-200 transition hover:text-violet-300"
          title={source.name || source.url}
        >
          {source.name || source.url}
        </Link>
        {latest && (
          <Time iso={latest.created_at} className="shrink-0 text-[11px] text-slate-500" />
        )}
        {unread > 0 && (
          <span className="count-pill shrink-0" title={`${unread} unread`}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </div>
    );
  }

  // "comfortable" + "compact" share the stat-tile layout (type icon tile,
  // name, big unread number, sparkline, "+N since last check"); comfortable
  // adds the latest-update line and the goal text. Only the name links to
  // the source detail page — the tile itself is not an anchor, so the
  // SourceActions buttons/kebab stay plain buttons (no nested HTML).
  const isComfortable = mode === "comfortable";
  const name = source.name || source.url;
  return (
    <div className="glass glass-hover glass-shine relative flex h-full flex-col gap-2.5 p-3">
        <span
          className="absolute inset-y-2.5 left-0 w-1 rounded-r-full aurora-stripe"
          aria-hidden="true"
        />
        {/* Top row: name (link to detail), muted marker, type glyph tile, actions. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            href={detailHref}
            className="min-w-0 flex-1 truncate font-medium text-slate-100 hover:text-violet-300"
            title={`Open ${name} ↗`}
          >
            {name}
          </Link>
          {muted && (
            <span
              className="shrink-0 text-amber-300/80"
              title="Muted — new updates are hidden"
            >
              <Glyph name="bell-off" className="h-3.5 w-3.5" />
            </span>
          )}
          <span
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md brand-tile text-white shadow-md"
            title={source.type}
          >
            <Glyph name={TYPE_ICON[source.type] ?? "globe"} className="h-3 w-3" />
          </span>
          {source.type !== "rss" && (
            <span className="ml-auto shrink-0">
              <SourceActions
                id={source.id}
                type={source.type}
                watchEnabled={source.watch_enabled === 1}
                muted={muted}
                intervalHours={source.check_interval_hours}
                lastCheckedAt={source.last_checked_at}
                lastError={source.last_error}
                compact={mode === "compact"}
              />
            </span>
          )}
        </div>

        {/* Metric row: big unread number, category pill in the middle,
            sparkline + since-last-check badge on the right. */}
        <div className="flex min-w-0 items-end justify-between gap-2">
          {/* Grid: col 1 = counter, col 2 = logo + "repository".
              Row 1: number (logo cell is centered against it) /
              Row 2: "unread" + "repository" — same grid row, so they
              always align. */}
          <div className="grid shrink-0 grid-cols-[auto_auto] gap-x-2.5">
            <div className="text-3xl font-semibold leading-tight tracking-tight text-white">
              {unread}
            </div>
            <div className="flex items-center">
              {source.logo && (
                <Image
                  src={`/api/sources/${source.id}/logo`}
                  alt=""
                  width={30}
                  height={30}
                  className="h-[30px] w-[30px] shrink-0 rounded-md border border-white/15 bg-white/5"
                />
              )}
            </div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              unread
            </div>
            {source.logo && (
              <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                repository
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            {activity && <Sparkline data={activity} />}
            {newsSinceCheck > 0 && (
              <span
                className="badge inline-flex shrink-0 items-center border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                title="Updates created since the last check of this source"
              >
                +{newsSinceCheck} since last check
              </span>
            )}
            {(source.category || source.subcategory) && (
              <div className="flex min-w-0 flex-col items-center justify-end gap-1">
                {source.category && (
                  <span
                    className="max-w-full truncate rounded-full bg-white px-3 py-1 text-xs font-bold uppercase text-slate-900"
                    title={source.category}
                  >
                    {source.category}
                  </span>
                )}
                {source.subcategory && (
                  <span
                    className="max-w-full truncate text-[11px] text-slate-400"
                    title={source.subcategory}
                  >
                    {source.subcategory}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {isComfortable && latest && (
          <div className="flex items-center gap-1.5 text-xs">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                PRIORITY_DOT[latest.priority] ?? PRIORITY_DOT.normal
              }`}
            />
            <Glyph
              name={KIND_ICON[latest.kind] ?? "layers"}
              className="h-3 w-3 shrink-0 text-slate-500"
            />
            <span className="min-w-0 flex-1 truncate text-slate-400" title={latest.title}>
              {latest.title}
            </span>
            <Time iso={latest.created_at} className="shrink-0 text-[11px] text-slate-500" />
          </div>
        )}
        {isComfortable && source.goal && (
          <p className="line-clamp-2 text-sm text-slate-400" title={source.goal}>
            {source.goal_source === "ai" && (
              <>
                <AiBadge title="Goal extracted by AI" />{" "}
              </>
            )}
            {source.goal}
          </p>
        )}
        {source.last_checked_at && (
          <div className="mt-auto flex items-center gap-1 text-[11px] text-slate-500">
            <StatusDot
              lastCheckedAt={source.last_checked_at}
              intervalHours={source.check_interval_hours}
              lastError={source.last_error}
            />
            last checked <Time iso={source.last_checked_at} />
          </div>
        )}
      </div>
  );

}
