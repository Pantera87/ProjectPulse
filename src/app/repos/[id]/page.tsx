import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, type SourceRow } from "@/lib/db";
import { rulesOf } from "@/lib/models";
import SourceActions from "@/components/source-actions";
import EditMeta from "@/components/edit-meta";
import RuleEditor from "@/components/rule-editor";
import MarkReadButton from "@/components/mark-read";

export const dynamic = "force-dynamic";

export default async function RepoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const d = getDb();
  const source = d
    .prepare("SELECT * FROM sources WHERE id = ? AND type = 'github'")
    .get(Number(id)) as SourceRow | undefined;
  if (!source) notFound();

  const updates = d
    .prepare(
      `SELECT * FROM updates WHERE source_id = ? ORDER BY created_at DESC LIMIT 15`
    )
    .all(Number(id)) as {
    id: number;
    priority: string;
    kind: string;
    title: string;
    summary: string | null;
    url: string | null;
    created_at: string;
    read_at: string | null;
  }[];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/repos" className="text-sm text-sky-400 hover:underline">
          ← GitHub
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{source.name || source.url}</h1>
        {source.goal && <p className="text-sm text-slate-400">{source.goal}</p>}
        <a href={source.url} target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:underline">
          {source.url}
        </a>
      </div>

      <SourceActions
        id={source.id}
        type="github"
        watchEnabled={source.watch_enabled === 1}
        mutedUntil={source.muted_until}
        intervalHours={source.check_interval_hours}
        lastCheckedAt={source.last_checked_at}
        lastError={source.last_error}
      />

      <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-semibold">Watch rules</h2>
        <p className="text-xs text-slate-500">
          Critical rules (e.g. keywords “amd, rocm, hip”) flag matching releases,
          README or commit text at that priority. GitHub milestones and major semver
          bumps are always flagged as <em>high</em>. Add issue labels to watch new
          labeled issues/PRs.
        </p>
        <RuleEditor sourceId={source.id} type="github" rules={rulesOf(source)} />
      </section>

      <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-4">
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

      <section className="space-y-2">
        <h2 className="font-semibold">Recent updates</h2>
        {updates.length === 0 ? (
          <p className="text-sm text-slate-500">
            No updates yet — the first “Check now” records the current state as the
            baseline (existing releases, milestones).
          </p>
        ) : (
          <ul className="space-y-2">
            {updates.map((u) => (
              <li
                key={u.id}
                className={`flex flex-wrap items-center gap-2 rounded border px-3 py-2 text-sm ${
                  u.priority === "critical"
                    ? "border-red-800 bg-red-950/60"
                    : u.priority === "high"
                      ? "border-amber-800 bg-amber-950/40"
                      : "border-slate-800 bg-slate-900"
                } ${u.read_at ? "opacity-60" : ""}`}
              >
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                  {u.kind}
                </span>
                <span className="font-medium">{u.title}</span>
                {u.url && (
                  <a href={u.url} target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:underline">
                    link
                  </a>
                )}
                <span className="ml-auto text-xs text-slate-500">
                  {new Date(u.created_at).toLocaleString()}
                </span>
                <MarkReadButton id={u.id} isRead={!!u.read_at} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
