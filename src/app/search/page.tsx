import Link from "next/link";
import { search } from "@/lib/models";

export const dynamic = "force-dynamic";

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
              <li key={s.id} className="rounded border border-slate-800 bg-slate-900 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Link
                    href={
                      s.type === "github"
                        ? `/repos/${s.id}`
                        : s.type === "rss"
                          ? `/updates?source_id=${s.id}`
                          : `/websites/${s.id}`
                    }
                    className="font-medium hover:text-sky-300"
                  >
                    {s.name || s.url}
                  </Link>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                    {s.type}
                  </span>
                  {s.category && (
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                      {s.category}
                    </span>
                  )}
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
          <ul className="space-y-1">
            {updates.map((u) => (
              <li key={u.id} className="text-sm text-slate-300">
                {u.title}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
