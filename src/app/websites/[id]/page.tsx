import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, type SourceRow } from "@/lib/db";
import { rulesOf } from "@/lib/models";
import { isMuted } from "@/lib/check";
import SourceActions from "@/components/source-actions";
import FloatingCheckButton from "@/components/floating-check-button";
import AiBadge from "@/components/ai-badge";
import EditMeta from "@/components/edit-meta";
import RuleEditor from "@/components/rule-editor";
import SnapshotViewer from "@/components/snapshot-viewer";
import SummaryText from "@/components/summary-text";
import SummarySizeSelect from "@/components/summary-size-select";

export const dynamic = "force-dynamic";

export default async function WebsiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const v = typeof sp.v === "string" ? sp.v : undefined;
  const diff = typeof sp.diff === "string" ? sp.diff : undefined;
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
        {source.goal && (
          <p className="text-sm text-slate-400">
            {source.goal_source === "ai" && (
              <>
                <AiBadge title="Goal extracted by AI" />{" "}
              </>
            )}
            {source.goal}
          </p>
        )}
        {source.project_summary && (
          <div className="relative mt-2 max-w-2xl rounded-lg border border-violet-400/20 bg-violet-400/10 px-3 py-2 text-sm text-slate-300">
            <AiBadge corner title="Summary written by AI" />
            <span className="mr-2 inline-flex items-center gap-1.5 font-semibold text-violet-300">
              summary
            </span>
            <SummaryText text={source.project_summary} />
          </div>
        )}
        <p className="mt-1 text-xs text-slate-500">{source.url}</p>
      </div>

      <SourceActions
        id={source.id}
        type={source.type}
        watchEnabled={source.watch_enabled === 1}
        muted={isMuted(source)}
        intervalHours={source.check_interval_hours}
        lastCheckedAt={source.last_checked_at}
        lastError={source.last_error}
      />

      <FloatingCheckButton id={source.id} />

      <SnapshotViewer sourceId={source.id} baseHref={`/websites/${id}`} v={v} diff={diff} />

      <section className="glass space-y-3 p-4">
        <h2 className="font-semibold">Details</h2>
        <EditMeta
          sourceId={source.id}
          initial={{
            name: source.name,
            goal: source.goal,
            goal_source: source.goal_source,
            category: source.category,
            category_source: source.category_source,
            subcategory: source.subcategory,
            subcategory_source: source.subcategory_source,
            notes: source.notes,
          }}
        />
        <SummarySizeSelect sourceId={source.id} initial={source.summary_size} />
      </section>

      <section className="glass space-y-3 p-4">
        <h2 className="font-semibold">Update rules (keywords)</h2>
        <p className="text-xs text-slate-500">
          When any keyword appears in newly added page content, the update gets
          the rule&apos;s priority.
        </p>
        <RuleEditor sourceId={source.id} type={source.type} rules={rulesOf(source)} />
      </section>
    </div>
  );
}
