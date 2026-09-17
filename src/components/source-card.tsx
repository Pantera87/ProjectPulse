import Link from "next/link";
import type { SourceRow } from "@/lib/db";
import SourceActions from "./source-actions";
import { Glyph } from "./icons";

const TYPE_BADGE: Record<string, string> = {
  website: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  github: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  rss: "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300",
};

const TYPE_ICON: Record<string, string> = {
  website: "globe",
  github: "git-branch",
  rss: "rss",
};

export default function SourceCard({
  source,
  muted,
  compact = false,
  unread = 0,
}: {
  source: SourceRow;
  muted: boolean;
  /** Denser card for the dashboard grid layout. */
  compact?: boolean;
  /** Unread count, shown as a badge in compact mode. */
  unread?: number;
}) {
  const detailHref =
    source.type === "github"
      ? `/repos/${source.id}`
      : source.type === "rss"
        ? `/updates?source_id=${source.id}`
        : `/websites/${source.id}`;

  if (compact) {
    return (
      <div className="glass glass-hover glass-shine flex h-full flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {source.type === "github" && source.logo && (
            <img
              src={`/api/sources/${source.id}/logo`}
              alt=""
              className="h-5 w-5 shrink-0 rounded"
            />
          )}
          <Link
            href={detailHref}
            className="min-w-0 flex-1 truncate font-medium text-slate-100 transition hover:text-violet-300"
            title={source.name || source.url}
          >
            {source.name || source.url}
          </Link>
          <span
            className={`badge border ${TYPE_BADGE[source.type] ?? TYPE_BADGE.website}`}
          >
            <Glyph name={TYPE_ICON[source.type] ?? "globe"} className="mr-1 h-3 w-3" />
            {source.type}
          </span>
          {unread > 0 && (
            <span className="badge border-rose-400/40 bg-rose-500/10 text-rose-300">
              {unread} unread
            </span>
          )}
          {muted && (
            <span className="badge border-amber-400/40 bg-amber-400/10 text-amber-300">
              muted
            </span>
          )}
        </div>
        {(source.goal || source.project_summary) && (
          <div>
            {source.goal && (
              <p className="line-clamp-1 text-sm text-slate-400" title={source.goal}>
                {source.goal}
              </p>
            )}
            {source.project_summary && (
              <p
                className="line-clamp-1 text-xs text-violet-300/90"
                title={source.project_summary}
              >
                <span className="font-semibold">AI</span> · {source.project_summary}
              </p>
            )}
          </div>
        )}
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
    <div className="glass glass-hover glass-shine p-3.5">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {source.type === "github" && source.logo && (
              <img
                src={`/api/sources/${source.id}/logo`}
                alt=""
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
                    : undefined
                }
              >
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
              {source.goal}
            </p>
          )}
          {source.project_summary && (
            <p
              className="mt-1 line-clamp-2 text-xs text-violet-300/90"
              title={source.project_summary}
            >
              <span className="font-semibold">AI</span> · {source.project_summary}
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
