import Link from "next/link";
import { getDb, type SourceRow } from "@/lib/db";
import { isMuted } from "@/lib/check";
import SourceCard from "@/components/source-card";

export const dynamic = "force-dynamic";

const PRIORITY_STYLES: Record<string, string> = {
  critical: "bg-red-950/60 border-red-800",
  high: "bg-amber-950/40 border-amber-800",
  normal: "bg-slate-900 border-slate-800",
};

export default function DashboardPage() {
  const d = getDb();

  const counts = d
    .prepare(
      `SELECT
         SUM(CASE WHEN read_at IS NULL AND priority='critical' THEN 1 ELSE 0 END) AS critical,
         SUM(CASE WHEN read_at IS NULL AND priority='high' THEN 1 ELSE 0 END) AS high,
         SUM(CASE WHEN read_at IS NULL AND priority='normal' THEN 1 ELSE 0 END) AS normal,
         SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END) AS total
       FROM updates`
    )
    .get() as {
    critical: number | null;
    high: number | null;
    normal: number | null;
    total: number | null;
  };

  const sources = d.prepare("SELECT * FROM sources ORDER BY id DESC").all() as SourceRow[];

  const recent = d
    .prepare(
      `SELECT u.*, s.name AS source_name, s.type AS source_type
       FROM updates u JOIN sources s ON s.id = u.source_id
       ORDER BY u.created_at DESC LIMIT 10`
    )
    .all() as {
    id: number;
    priority: string;
    kind: string;
    title: string;
    summary: string | null;
    url: string | null;
    created_at: string;
    read_at: string | null;
    source_name: string | null;
    source_type: string;
  }[];

  // Group sources by category (extracted goal heuristic)
  const byCategory = new Map<string, SourceRow[]>();
  for (const s of sources) {
    const cat = s.category ?? "uncategorized";
    const list = byCategory.get(cat) ?? [];
    list.push(s);
    byCategory.set(cat, list);
  }
  const categories = [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="space-y-8">
      {/* Unread counters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["critical", "Critical", counts.critical ?? 0, PRIORITY_STYLES.critical],
            ["high", "High", counts.high ?? 0, PRIORITY_STYLES.high],
            ["normal", "Normal", counts.normal ?? 0, PRIORITY_STYLES.normal],
            ["total", "Unread total", counts.total ?? 0, "bg-slate-900 border-slate-700"],
          ] as [string, string, number, string][]
        ).map(([key, label, value, cls]) => (
          <Link
            key={key}
            href={key === "total" ? "/updates" : `/updates?priority=${key}`}
            className={`rounded-lg border p-4 ${cls} hover:brightness-125`}
          >
            <div className="text-3xl font-semibold">{value}</div>
            <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
          </Link>
        ))}
      </div>

      {/* Recent updates */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent updates</h2>
          <Link href="/updates" className="text-sm text-sky-400 hover:underline">
            View all →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">
            No updates yet. Add a website, GitHub repo or feed and run “Check now”.
          </p>
        ) : (
          <ul className="space-y-2">
            {recent.map((u) => (
              <li
                key={u.id}
                className={`rounded border px-3 py-2 ${PRIORITY_STYLES[u.priority] ?? PRIORITY_STYLES.normal} ${
                  u.read_at ? "opacity-60" : ""
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <PriorityDot priority={u.priority} />
                  <span className="font-medium">{u.title}</span>
                  <span className="text-xs text-slate-500">
                    {u.source_type} · {u.source_name}
                  </span>
                  <span className="ml-auto text-xs text-slate-500">
                    {new Date(u.created_at).toLocaleString()}
                  </span>
                </div>
                {u.summary && (
                  <p className="mt-1 line-clamp-2 pl-5 text-xs text-slate-400">{u.summary}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Projects grouped by category */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Projects</h2>
        {sources.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nothing tracked yet — add projects under Websites, GitHub or Feeds.
          </p>
        ) : (
          <div className="space-y-5">
            {categories.map(([cat, list]) => (
              <div key={cat}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {cat} <span className="text-slate-600">({list.length})</span>
                </h3>
                <div className="space-y-2">
                  {list.map((s) => (
                    <SourceCard key={s.id} source={s} muted={isMuted(s)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function PriorityDot({ priority }: { priority: string }) {
  const color =
    priority === "critical"
      ? "bg-red-500"
      : priority === "high"
        ? "bg-amber-500"
        : "bg-slate-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}
