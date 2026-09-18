import { getDb, type SourceRow } from "@/lib/db";
import { isMuted } from "@/lib/check";
import SourceCard from "@/components/source-card";
import AddSourceForm from "@/components/add-source";
import RefreshAll from "@/components/refresh-all";

export const dynamic = "force-dynamic";

export default function WebsitesPage() {
  const d = getDb();
  const rows = d
    .prepare("SELECT * FROM sources WHERE type = 'website' ORDER BY id DESC")
    .all() as SourceRow[];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Websites</h1>
        <RefreshAll type="website" />
      </div>
      <AddSourceForm type="website" />
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          No websites saved yet. Add a project website above — a snapshot is stored
          immediately for offline reading, and you can turn on update tracking.
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
