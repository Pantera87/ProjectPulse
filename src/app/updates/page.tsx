import Link from "next/link";
import { getDb } from "@/lib/db";
import UpdateItem, { type UpdateView } from "@/components/update-item";
import MarkAllRead from "@/components/mark-all";
import ClearUpdates from "@/components/clear-updates";
import SourceFilter from "@/components/source-filter";

export const dynamic = "force-dynamic";

const chip = (active: boolean) => `chip ${active ? "chip-active" : ""}`;

export default async function UpdatesPage({
  searchParams,
}: {
  searchParams: Promise<{ priority?: string; source_id?: string; window?: string }>;
}) {
  const p = await searchParams;
  const d = getDb();

  const where: string[] = [];
  const vals: unknown[] = [];
  if (p.priority) {
    where.push("u.priority = ?");
    vals.push(p.priority);
  }
  if (p.source_id) {
    where.push("u.source_id = ?");
    vals.push(Number(p.source_id));
  }
  if (p.window) {
    where.push("u.created_at >= datetime('now', ?)");
    vals.push(`-${Number(p.window) || 7} days`);
  }
  const rows = d
    .prepare(
      `SELECT u.*, s.name AS source_name, s.type AS source_type
       FROM updates u JOIN sources s ON s.id = u.source_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY
         CASE u.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
         u.created_at DESC
       LIMIT 200`
    )
    .all(...vals) as UpdateView[];

  const sources = d.prepare("SELECT id, name, url FROM sources").all() as {
    id: number;
    name: string | null;
    url: string;
  }[];

  const href = (patch: Record<string, string | undefined>) => {
    const kept: Record<string, string> = {};
    for (const [k, v] of Object.entries({
      priority: p.priority,
      window: p.window,
      source_id: p.source_id,
      ...patch,
    }))
      if (v) kept[k] = v;
    const qs = new URLSearchParams(kept).toString();
    return qs ? `/updates?${qs}` : "/updates";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">
          {p.window ? `Digest — last ${p.window} days` : "Updates"}
        </h1>
        <MarkAllRead />
        <ClearUpdates />
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
        <span className="flex items-center gap-1">
          priority:
          <Link href={href({ priority: "" })} className={chip(!p.priority)}>all</Link>
          <Link href={href({ priority: "critical" })} className={chip(p.priority === "critical")}>critical</Link>
          <Link href={href({ priority: "high" })} className={chip(p.priority === "high")}>high</Link>
          <Link href={href({ priority: "normal" })} className={chip(p.priority === "normal")}>normal</Link>
        </span>
        <span className="flex items-center gap-1">
          window:
          <Link href={href({ window: "" })} className={chip(!p.window)}>all time</Link>
          <Link href={href({ window: "1" })} className={chip(p.window === "1")}>1d</Link>
          <Link href={href({ window: "7" })} className={chip(p.window === "7")}>7d</Link>
          <Link href={href({ window: "30" })} className={chip(p.window === "30")}>30d</Link>
        </span>
        <SourceFilter sources={sources} current={p.source_id ?? ""} />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No updates match these filters.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((u) => (
            <UpdateItem key={u.id} u={u} />
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-600">
        Showing {rows.length} update{rows.length === 1 ? "" : "s"}.{" "}
        <Link href="/" className="text-indigo-300 hover:underline">
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}
