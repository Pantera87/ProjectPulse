import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, type SourceRow } from "@/lib/db";
import { rulesOf } from "@/lib/models";
import SourceActions from "@/components/source-actions";
import EditMeta from "@/components/edit-meta";
import RuleEditor from "@/components/rule-editor";
import SnapshotViewer from "@/components/snapshot-viewer";

export const dynamic = "force-dynamic";

interface Params {
  id: string;
  v?: string;
  diff?: string;
}

export default async function WebsiteDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id, v, diff } = await params;
  const d = getDb();
  const source = d
    .prepare("SELECT * FROM sources WHERE id = ? AND type = 'website'")
    .get(Number(id)) as SourceRow | undefined;
  if (!source) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/websites" className="text-sm text-indigo-300 hover:underline">
          ← Websites
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{source.name || source.url}</h1>
        {source.goal && <p className="text-sm text-slate-400">{source.goal}</p>}
        {source.project_summary && (
          <div className="mt-2 max-w-2xl rounded-lg border border-violet-400/20 bg-violet-400/10 px-3 py-2 text-sm text-slate-300">
            <span className="font-semibold text-violet-300">AI summary · </span>
            {source.project_summary}
          </div>
        )}
        <p className="mt-1 text-xs text-slate-500">{source.url}</p>
      </div>

      <SourceActions
        id={source.id}
        type={source.type}
        watchEnabled={source.watch_enabled === 1}
        mutedUntil={source.muted_until}
        intervalHours={source.check_interval_hours}
        lastCheckedAt={source.last_checked_at}
        lastError={source.last_error}
      />

      <SnapshotViewer sourceId={source.id} baseHref={`/websites/${id}`} v={v} diff={diff} />

      <section className="glass space-y-3 p-4">
        <h2 className="font-semibold">Details</h2>
        <EditMeta
          sourceId={source.id}
          initial={{
            name: source.name,
            goal: source.goal,
            category: source.category,
            notes: source.notes,
          }}
        />
      </section>

      <section className="glass space-y-3 p-4">
        <h2 className="font-semibold">Update rules (keywords)</h2>
        <p className="text-xs text-slate-500">
          When any keyword appears in newly added page content, the update gets the
          rule&apos;s priority. Example: keywords “rocm, amd” with priority critical.
        </p>
        <RuleEditor sourceId={source.id} type={source.type} rules={rulesOf(source)} />
      </section>
    </div>
  );
}
