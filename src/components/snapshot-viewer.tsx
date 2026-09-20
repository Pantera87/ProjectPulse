import Link from "next/link";
import { getDb } from "@/lib/db";
import { createTwoFilesPatch } from "diff";
import { readHtml } from "@/lib/text";
import { formatDateTime } from "@/lib/format";
import SnapshotDeleteButton from "./snapshot-delete-button";
/**
 * Server component: renders the selected snapshot version in a sandboxed
 * iframe (the offline archived copy when available, otherwise the raw
 * stored HTML), or a unified diff between two versions.
 */
export default function SnapshotViewer({
  sourceId,
  baseHref,
  v,
  diff,
}: {
  sourceId: number;
  baseHref: string;
  v?: string;
  diff?: string;
}) {
  const d = getDb();
  const snapshots = d
    .prepare(
      `SELECT id, version, fetched_at, title,
         LENGTH(COALESCE(html_local, html)) AS size,
         html_local IS NOT NULL AS archived
       FROM snapshots
       WHERE source_id = ? ORDER BY version DESC`
    )
    .all(sourceId) as {
    id: number;
    version: number;
    fetched_at: string;
    title: string | null;
    size: number;
    archived: number;
  }[];

  if (diff) {
    const [a, b] = diff.split("-").map(Number);
    const older = d
      .prepare("SELECT html FROM snapshots WHERE source_id = ? AND version = ?")
      .get(sourceId, a) as { html: unknown } | undefined;
    const newer = d
      .prepare("SELECT html FROM snapshots WHERE source_id = ? AND version = ?")
      .get(sourceId, b) as { html: unknown } | undefined;
    const patch =
      older && newer
        ? createTwoFilesPatch(
            `v${a}`,
            `v${b}`,
            readHtml(older.html),
            readHtml(newer.html),
            "",
            "",
            { context: 3 }
          )
        : "(snapshot no longer available)";
    return (
      <section className="glass space-y-3 p-4">
        <Link href={baseHref} className="text-sm text-indigo-300 hover:underline">
          ← Back
        </Link>
        <h2 className="font-semibold">Diff v{a} → v{b}</h2>
        <pre className="max-h-[70vh] overflow-auto whitespace-pre rounded-lg border border-white/10 bg-[#080c20]/70 p-3 text-xs text-slate-300">
          {patch}
        </pre>
      </section>
    );
  }

  const version = v ? Number(v) : snapshots[0]?.version ?? 0;
  const row = snapshots.find((s) => s.version === version);
  const html = row
    ? readHtml(
        (
          d
            .prepare("SELECT html FROM snapshots WHERE source_id = ? AND version = ?")
            .get(sourceId, version) as { html: unknown }
        ).html
      )
    : null;
  // The archived copy is self-contained (assets rewritten to local URLs),
  // so it renders fully offline; prefer it over the raw HTML view.
  const archived = row?.archived
    ? readHtml(
        (
          d
            .prepare(
              "SELECT html_local FROM snapshots WHERE source_id = ? AND version = ?"
            )
            .get(sourceId, version) as { html_local: unknown }
        ).html_local
      )
    : null;

  return (
    <section className="glass space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">
          Snapshot {archived ? "(offline archive)" : "(read offline)"}
        </h2>
        {snapshots.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {snapshots.slice(0, 10).map((s) => (
              <Link
                key={s.version}
                href={s.version === version ? baseHref : `${baseHref}?v=${s.version}`}
                className={`chip ${s.version === version ? "chip-active" : ""}`}
                title={
                  formatDateTime(s.fetched_at) + (s.archived ? " · offline archive" : "")
                }
              >
                v{s.version}
              </Link>
            ))}
          </div>
        )}
        {snapshots.length >= 2 && (
          <Link
            href={`${baseHref}?diff=${snapshots[1].version}-${snapshots[0].version}`}
            className="text-sm text-indigo-300 hover:underline"
          >
            Diff v{snapshots[1].version} → v{snapshots[0].version}
          </Link>
        )}
        {snapshots.length > 0 && (
          <span className="ml-auto">
            <SnapshotDeleteButton sourceId={sourceId} />
          </span>
        )}
      </div>
      {archived ? (
        <div className="space-y-2">
          <iframe
            title="website snapshot (archived)"
            sandbox=""
            srcDoc={archived}
            className="h-[70vh] w-full rounded-lg border border-white/15 bg-white"
          />
          <p className="text-xs text-slate-500">
            Self-contained offline copy: referenced assets are stored locally.{" "}
            <a
              href={`/api/sources/${sourceId}/snapshots?version=${version}&raw=1`}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-300 hover:underline"
            >
              open raw HTML
            </a>
          </p>
        </div>
      ) : html ? (
        <iframe
          title="website snapshot"
          sandbox=""
          srcDoc={html}
          className="h-[70vh] w-full rounded-lg border border-white/15 bg-white"
        />
      ) : (
        <p className="text-sm text-slate-500">
          No snapshot yet — run “Check now” to capture the first snapshot.
        </p>
      )}
    </section>
  );
}
