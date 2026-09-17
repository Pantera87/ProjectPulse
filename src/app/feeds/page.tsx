import { getDb, type SourceRow } from "@/lib/db";
import { isMuted } from "@/lib/check";
import SourceCard from "@/components/source-card";
import AddSourceForm from "@/components/add-source";
import RefreshAll from "@/components/refresh-all";

export const dynamic = "force-dynamic";

export default function FeedsPage() {
  const d = getDb();
  const rows = d
    .prepare("SELECT * FROM sources WHERE type = 'rss' ORDER BY id DESC")
    .all() as SourceRow[];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">RSS / Atom feeds</h1>
        <RefreshAll />
      </div>
      <AddSourceForm type="rss" />
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          No feeds added. RSS feeds are the most reliable way to track a project&apos;s
          changelog or blog — new entries appear in the Updates feed automatically.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((s) => (
            <div key={s.id}>
              <SourceCard source={s} muted={isMuted(s)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
