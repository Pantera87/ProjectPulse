import Link from "next/link";
import { getDb } from "@/lib/db";
import { createTwoFilesPatch } from "diff";
/**
 * Server component: renders the selected snapshot version in a sandboxed
 * iframe, or a unified diff between two versions.
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
      `SELECT id, version, fetched_at, title, LENGTH(html) AS size FROM snapshots
       WHERE source_id = ? ORDER BY version DESC`
    )
    .all(sourceId) as { id: number; version: number; fetched_at: string; title: string | null; size: number }[];

  if (diff) {
    const [a, b] = diff.split("-").map(Number);
    const older = d
      .prepare("SELECT html FROM snapshots WHERE source_id = ? AND version = ?")
      .get(sourceId, a) as { html: string } | undefined;
    const newer = d
      .prepare("SELECT html FROM snapshots WHERE source_id = ? AND version = ?")
      .get(sourceId, b) as { html: string } | undefined;
    const patch =
      older && newer
        ? createTwoFilesPatch(`v${a}`, `v${b}`, older.html, newer.html, "", "", {
            context: 3,
          })
        : "(snapshot no longer available)";
    return (
      <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-4">
        <Link href={baseHref} className="text-sm text-sky-400 hover:underline">
          ← Back
        </Link>
        <h2 className="font-semibold">Diff v{a} → v{b}</h2>
        <pre className="max-h-[70vh] overflow-auto whitespace-pre text-xs text-slate-300">
          {patch}
        </pre>
      </section>
    );
  }

  const version = v ? Number(v) : snapshots[0]?.version ?? 0;
  const row = snapshots.find((s) => s.version === version);
  const html = row
    ? (
        d.prepare("SELECT html FROM snapshots WHERE source_id = ? AND version = ?")
          .get(sourceId, version) as { html: string }
      ).html
    : null;

  return (
    <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">Snapshot (read offline)</h2>
        {snapshots.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {snapshots.slice(0, 10).map((s) => (
              <Link
                key={s.version}
                href={s.version === version ? baseHref : `${baseHref}?v=${s.version}`}
                className={`rounded px-2 py-0.5 text-xs ${
                  s.version === version
                    ? "bg-sky-600 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
                title={new Date(s.fetched_at).toLocaleString()}
              >
                v{s.version}
              </Link>
            ))}
          </div>
        )}
        {snapshots.length >= 2 && (
          <Link
            href={`${baseHref}?diff=${snapshots[1].version}-${snapshots[0].version}`}
            className="text-sm text-sky-400 hover:underline"
          >
            Diff v{snapshots[1].version} → v{snapshots[0].version}
          </Link>
        )}
      </div>
      {html ? (
        <iframe
          title="website snapshot"
          sandbox=""
          srcDoc={html}
          className="h-[70vh] w-full rounded border border-slate-800 bg-white"
        />
      ) : (
        <p className="text-sm text-slate-500">
          No snapshot yet — run “Check now” to capture the first snapshot.
        </p>
      )}
    </section>
  );
}
