import Link from "next/link";
import type { SourceRow } from "@/lib/db";
import SourceActions from "./source-actions";

const TYPE_BADGE: Record<string, string> = {
  website: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  github: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  rss: "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300",
};

export default function SourceCard({ source, muted }: { source: SourceRow; muted: boolean }) {
  const detailHref =
    source.type === "github"
      ? `/repos/${source.id}`
      : source.type === "rss"
        ? `/updates?source_id=${source.id}`
        : `/websites/${source.id}`;

  return (
    <div className="glass glass-hover p-3.5">
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
              {source.type}
            </span>
            {source.category && <span className="badge">{source.category}</span>}
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
        </div>
        {source.type !== "rss" && (
          <SourceActions
            id={source.id}
            type={source.type}
            watchEnabled={source.watch_enabled === 1}
            mutedUntil={source.muted_until}
            intervalHours={source.check_interval_hours}
            lastCheckedAt={source.last_checked_at}
            lastError={source.last_error}
          />
        )}
      </div>
    </div>
  );
}
