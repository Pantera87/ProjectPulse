import Link from "next/link";
import Image from "next/image";
import type { SourceRow } from "@/lib/db";
import SourceActions from "./source-actions";
import AiBadge from "./ai-badge";
import CategoryIcon from "./category-icon";
import { Glyph, KIND_ICON } from "./icons";
import Time from "./time";
import StatusDot from "./status-dot";

const TYPE_BADGE: Record<string, string> = {
  website: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  github: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  rss: "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300",
};

// Glyph name for the source type icon (compact/minimal densities); the
// tile behind it is the shared brand gradient (.brand-tile).
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
  categoryIcon = null,
}: {
  source: SourceRow;
  muted: boolean;
  /** Denser card for the dashboard grid layout (shorthand for density="compact"). */
  compact?: boolean;
  /** Unread count, shown as a badge in compact mode. */
  unread?: number;
  /**
   * Card density for dashboard grids: "comfortable" (default) full card,
   * "compact" name + latest update + hover popover, "minimal" one status line.
   */
  density?: "comfortable" | "compact" | "minimal";
  /** Newest update of this source, shown as the card's second line. */
  latest?: { id: number; kind: string; priority: string; title: string; created_at: string } | null;
  /** Update count per day, last 7 days (index 0 = 6 days ago) — sparkline. */
  activity?: number[] | null;
  /** AI-picked glyph for the source's category (categories table). */
  categoryIcon?: string | null;
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
        <span
          className="h-3.5 w-1 shrink-0 rounded-full aurora-stripe"
          title={source.category ?? "uncategorized"}
        />
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

  if (mode === "compact") {
    return (
      <div className="glass glass-hover group relative flex h-full flex-col gap-2 p-2.5">
        <span
          className="absolute inset-y-2 left-0 w-1 rounded-r-full aurora-stripe"
          aria-hidden="true"
        />
        <div className="flex items-center gap-1.5">
          <CategoryIcon
            category={source.category ?? "uncategorized"}
            size="sm"
            icon={categoryIcon}
          />
          {source.type === "github" && source.logo && (
            <Image
              src={`/api/sources/${source.id}/logo`}
              alt=""
              width={16}
              height={16}
              className="h-4 w-4 shrink-0 rounded"
            />
          )}
          <Link
            href={detailHref}
            className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100 transition hover:text-violet-300"
            title={source.name || source.url}
          >
            {source.name || source.url}
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
          {activity && (
            <span
              className="flex h-3 shrink-0 items-end gap-px"
              title={`Updates, last 7 days: ${activity.join(", ")}`}
            >
              {activity.map((n, i) => (
                <span
                  key={i}
                  className={`w-1 rounded-sm ${
                    n === 0 ? "bg-white/10" : "bg-gradient-to-t from-violet-500 to-fuchsia-400"
                  }`}
                  style={{ height: `${Math.max(20, Math.min(100, n * 25))}%` }}
                />
              ))}
            </span>
          )}
          {unread > 0 && (
            <span className="count-pill shrink-0" title={`${unread} unread`}>
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </div>
        {latest && (
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
            <Link
              href={`/updates/${latest.id}`}
              className="min-w-0 flex-1 truncate text-slate-400 transition hover:text-slate-200"
              title={latest.title}
            >
              {latest.title}
            </Link>
            <Time iso={latest.created_at} className="shrink-0 text-[11px] text-slate-500" />
          </div>
        )}

        <div className="flex min-w-0 items-center gap-1.5 text-xs">
          <span className="badge shrink-0 px-1.5 py-0.5" title={source.category ?? "uncategorized"}>
            {source.category ?? "uncategorized"}
          </span>
          {(source.goal || source.project_summary) && (
            <span
              className="min-w-0 flex-1 truncate text-slate-500"
              title={source.goal || source.project_summary || undefined}
            >
              {source.goal ?? source.project_summary}
            </span>
          )}
        </div>
        {source.type !== "rss" && (
          <SourceActions
            id={source.id}
            type={source.type}
            watchEnabled={source.watch_enabled === 1}
            muted={muted}
            intervalHours={source.check_interval_hours}
            lastCheckedAt={source.last_checked_at}
            lastError={source.last_error}
            compact
          />
        )}
      </div>
    );
  }

  return (
    <div className="glass glass-hover glass-shine relative p-3.5">
      <span
        className="absolute inset-y-3 left-0 w-1 rounded-r-full aurora-stripe"
        aria-hidden="true"
      />
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {source.type === "github" && source.logo && (
              <Image
                src={`/api/sources/${source.id}/logo`}
                alt=""
                width={20}
                height={20}
                className="h-5 w-5 rounded"
              />
            )}
            <Link
              href={detailHref}
              className="font-medium text-slate-100 transition hover:text-violet-300"
            >
              {source.name || source.url}
            </Link>
            <span
              className={`badge border ${TYPE_BADGE[source.type] ?? TYPE_BADGE.website}`}
            >
              <Glyph name={TYPE_ICON[source.type] ?? "globe"} className="mr-1 h-3 w-3" />
              {source.type}
            </span>
            {source.category && (
              <span
                className="badge"
                title={
                  source.category_source === "heuristic"
                    ? "Category guessed from keywords — not very accurate; verify or set it manually"
                    : source.category_source === "ai"
                      ? "Category assigned by AI"
                      : undefined
                }
              >
                {source.category_source === "ai" && (
                  <span className="mr-1">
                    <AiBadge title="Category assigned by AI" />
                  </span>
                )}
                {source.category}
                {source.category_source === "heuristic" && (
                  <span className="text-amber-300"> ?</span>
                )}
              </span>
            )}
            {source.subcategory && (
              <span className="badge opacity-70">{source.subcategory}</span>
            )}
            {muted && (
              <span className="badge border-amber-400/40 bg-amber-400/10 text-amber-300">
                muted
              </span>
            )}
          </div>
          {source.goal && (
            <p className="mt-1 line-clamp-2 text-sm text-slate-400" title={source.goal}>
              {source.goal_source === "ai" && (
                <>
                  <AiBadge title="Goal extracted by AI" />{" "}
                </>
              )}
              {source.goal}
            </p>
          )}
          {source.project_summary && (
            <p
              className="mt-1 line-clamp-2 text-xs text-violet-300/90"
              title={source.project_summary}
            >
              <AiBadge title="Summary written by AI" /> · {source.project_summary}
            </p>
          )}
        </div>
        {source.type !== "rss" && (
          <SourceActions
            id={source.id}
            type={source.type}
            watchEnabled={source.watch_enabled === 1}
            muted={muted}
            intervalHours={source.check_interval_hours}
            lastCheckedAt={source.last_checked_at}
            lastError={source.last_error}
          />
        )}
      </div>
    </div>
  );
}
