import Link from "next/link";
import { search } from "@/lib/models";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const PRIORITY_BADGE: Record<string, string> = {
  critical: "border-rose-400/40 bg-rose-500/10 text-rose-300",
  high: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  normal: "border-white/10 bg-white/5 text-slate-300",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const trimmed = q.trim();
  const { sources, updates } = trimmed.length >= 2 ? search(trimmed) : { sources: [], updates: [] };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Search: “{trimmed}”</h1>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Projects ({sources.length})
        </h2>
        {sources.length === 0 ? (
          <p className="text-sm text-slate-500">No matching projects.</p>
        ) : (
          <ul className="space-y-2">
            {sources.map((s) => (
              <li key={s.id} className="glass px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Link
                    href={
                      s.type === "github"
                        ? `/repos/${s.id}`
                        : s.type === "rss"
                          ? `/updates?source_id=${s.id}`
                          : `/websites/${s.id}`
                    }
                    className="font-medium hover:text-violet-300"
                  >
                    {s.name || s.url}
                  </Link>
                  <span className="badge">{s.type}</span>
                  {s.category && <span className="badge">{s.category}</span>}
                </div>
                {s.goal && <p className="mt-1 text-xs text-slate-400">{s.goal}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Updates ({updates.length})
        </h2>
        {updates.length === 0 ? (
          <p className="text-sm text-slate-500">No matching updates.</p>
        ) : (
          <ul className="space-y-2">
            {updates.map((u) => (
              <li key={u.id} className="glass px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Link
                    href={`/updates/${u.id}`}
                    className="min-w-0 flex-1 truncate font-medium hover:text-violet-300"
                    title={u.title}
                  >
                    {u.title}
                  </Link>
                  <span className="badge">{u.kind}</span>
                  <span className={`badge border ${PRIORITY_BADGE[u.priority] ?? PRIORITY_BADGE.normal}`}>
                    {u.priority}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatDateTime(u.created_at)}
                  </span>
                </div>
                {u.summary && <p className="mt-1 text-xs text-slate-400">{u.summary}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
