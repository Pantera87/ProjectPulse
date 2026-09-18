import Link from "next/link";
import { notFound } from "next/navigation";
import fs from "node:fs";
import path from "node:path";
import { getDb, dataDir, type SourceRow } from "@/lib/db";
import { rulesOf } from "@/lib/models";
import { isMuted } from "@/lib/check";
import { formatDateTime } from "@/lib/format";
import SourceActions from "@/components/source-actions";
import EditMeta from "@/components/edit-meta";
import RuleEditor from "@/components/rule-editor";
import TrackingToggles from "@/components/tracking-toggles";
import MarkReadButton from "@/components/mark-read";
import SnapshotViewer from "@/components/snapshot-viewer";
import ScreenshotDeleteButton from "@/components/screenshot-delete-button";
import SummaryText from "@/components/summary-text";
import SummarySizeSelect from "@/components/summary-size-select";

export const dynamic = "force-dynamic";

export default async function RepoDetailPage({
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
    .prepare("SELECT * FROM sources WHERE id = ? AND type = 'github'")
    .get(Number(id)) as SourceRow | undefined;
  if (!source) notFound();

  const hasRepoShot = fs.existsSync(
    path.join(dataDir(), `screenshots/github-${source.id}.png`)
  );

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
        <Link href="/repos" className="text-sm text-indigo-300 hover:underline">
          ← GitHub
        </Link>
        <div className="mt-1 flex items-center gap-3">
          {source.logo && (
            <img
              src={`/api/sources/${source.id}/logo`}
              alt=""
              className="h-10 w-10 rounded-lg border border-white/15 bg-white/5"
            />
          )}
          <h1 className="text-xl font-semibold">{source.name || source.url}</h1>
        </div>
        {source.goal && <p className="text-sm text-slate-400">{source.goal}</p>}
        {source.project_summary && (
          <div className="mt-2 max-w-2xl rounded-lg border border-violet-400/20 bg-violet-400/10 px-3 py-2 text-sm text-slate-300">
            <span className="mr-2 font-semibold text-violet-300">AI summary</span>
            <SummaryText text={source.project_summary} />
          </div>
        )}
        <a href={source.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-300 hover:underline">
          {source.url}
        </a>
      </div>

      <SourceActions
        id={source.id}
        type="github"
        watchEnabled={source.watch_enabled === 1}
        muted={isMuted(source)}
        intervalHours={source.check_interval_hours}
        lastCheckedAt={source.last_checked_at}
        lastError={source.last_error}
      />

      <section className="glass space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Repository screenshot</h2>
          <div className="flex items-center gap-3">
            {hasRepoShot && <ScreenshotDeleteButton sourceId={source.id} />}
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-indigo-300 hover:underline"
            >
              Open on GitHub →
            </a>
          </div>
        </div>
        {hasRepoShot ? (
          <img
            src={`/api/sources/${source.id}/screenshot?repo=1`}
            alt="GitHub repository page"
            className="w-full rounded-lg border border-white/15 bg-white"
          />
        ) : (
          <p className="text-sm text-slate-500">
            No screenshot yet — run “Check now” to capture the repository page
            (it is also captured automatically on the next scheduled check,
            and re-captured whenever the README changes).
          </p>
        )}
      </section>

      <SnapshotViewer sourceId={source.id} baseHref={`/repos/${id}`} v={v} diff={diff} />

      <section className="glass space-y-3 p-4">
        <h2 className="font-semibold">Track changes</h2>
        <p className="text-xs text-slate-500">
          Create an update on these events — no keywords required. Milestones
          (new / completed) are always tracked as <em>high</em>.
        </p>
        <TrackingToggles
          sourceId={source.id}
          initial={{
            releases: (source.track_releases ?? 1) !== 0,
            readme: source.track_readme === 1,
            commits: source.track_commits === 1,
          }}
        />
      </section>

      <section className="glass space-y-3 p-4">
        <h2 className="font-semibold">Keyword rules</h2>
        <p className="text-xs text-slate-500">
          Each rule has keywords (and optionally issue labels) plus checkboxes
          selecting <em>where</em> those keywords are searched: release notes,
          README and commit messages. A hit creates an update at the
          rule&apos;s priority — critical rules are the strongest signal.
        </p>
        <RuleEditor sourceId={source.id} type="github" rules={rulesOf(source)} />
      </section>

      <section className="glass space-y-3 p-4">
        <h2 className="font-semibold">Details</h2>
        <EditMeta
          sourceId={source.id}
          initial={{
            name: source.name,
            goal: source.goal,
            category: source.category,
            subcategory: source.subcategory,
            notes: source.notes,
          }}
        />
        <SummarySizeSelect sourceId={source.id} initial={source.summary_size} />
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
                className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm backdrop-blur-md ${
                  u.priority === "critical"
                    ? "border-rose-500/40 bg-rose-500/10"
                    : u.priority === "high"
                      ? "border-amber-400/40 bg-amber-400/10"
                      : "border-white/10 bg-white/5"
                } ${u.read_at ? "opacity-60" : ""}`}
              >
                <span className="badge">{u.kind}</span>
                <span className="font-medium">{u.title}</span>
                {u.url && (
                  <a href={u.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-300 hover:underline">
                    link
                  </a>
                )}
                <span className="ml-auto text-xs text-slate-500">
                  {formatDateTime(u.created_at)}
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
