import Link from "next/link";
import type { SourceRow } from "@/lib/db";
import SourceActions from "./source-actions";

const TYPE_BADGE: Record<string, string> = {
  website: "bg-sky-950 text-sky-300 border-sky-800",
  github: "bg-slate-800 text-slate-200 border-slate-600",
  rss: "bg-orange-950 text-orange-300 border-orange-800",
};

export default function SourceCard({ source, muted }: { source: SourceRow; muted: boolean }) {
  const detailHref =
    source.type === "github"
      ? `/repos/${source.id}`
      : source.type === "rss"
        ? `/updates?source_id=${source.id}`
        : `/websites/${source.id}`;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={detailHref}
              className="font-medium text-slate-100 hover:text-sky-300"
            >
              {source.name || source.url}
            </Link>
            <span
              className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${TYPE_BADGE[source.type]}`}
            >
              {source.type}
            </span>
            {source.category && (
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                {source.category}
              </span>
            )}
            {muted && (
              <span className="rounded bg-amber-950 px-1.5 py-0.5 text-[10px] text-amber-400">
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
