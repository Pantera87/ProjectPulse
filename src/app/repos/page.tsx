import { getDb, type SourceRow } from "@/lib/db";
import { isMuted } from "@/lib/check";
import SourceCard from "@/components/source-card";
import AddSourceForm from "@/components/add-source";
import RefreshAll from "@/components/refresh-all";

export const dynamic = "force-dynamic";

export default function ReposPage() {
  const d = getDb();
  const rows = d
    .prepare("SELECT * FROM sources WHERE type = 'github' ORDER BY id DESC")
    .all() as SourceRow[];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">GitHub</h1>
        <RefreshAll type="github" />
      </div>
      <AddSourceForm type="github" />
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          No repos tracked yet. Add one as <code>owner/repo</code>. Priority keyword
          rules, milestones and issue labels are configured on the repo detail page.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((s) => (
            <SourceCard key={s.id} source={s} muted={isMuted(s)} />
          ))}
        </div>
      )}
    </div>
  );
}
