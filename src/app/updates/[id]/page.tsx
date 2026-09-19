import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import AiBadge from "@/components/ai-badge";
import MarkReadButton from "@/components/mark-read";

export const dynamic = "force-dynamic";

interface UpdateDetail {
  id: number;
  priority: string;
  kind: string;
  title: string;
  summary: string | null;
  url: string | null;
  created_at: string;
  read_at: string | null;
  payload_json?: string | null;
  source_id: number;
  source_name: string | null;
  source_type: string;
  source_url: string;
}

const PRIORITY_BADGE: Record<string, string> = {
  critical: "border-rose-400/50 bg-rose-500/20 text-rose-300",
  high: "border-amber-400/50 bg-amber-400/20 text-amber-300",
  normal: "border-white/15 bg-white/10 text-slate-300",
};

const SOURCE_DETAIL_HREF: Record<string, (id: number) => string> = {
  github: (id) => `/repos/${id}`,
  website: (id) => `/websites/${id}`,
  rss: (id) => `/updates?source_id=${id}`,
};

export default async function UpdateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const d = getDb();
  const u = d
    .prepare(
      `SELECT u.*, s.name AS source_name, s.type AS source_type, s.url AS source_url
       FROM updates u JOIN sources s ON s.id = u.source_id
       WHERE u.id = ?`
    )
    .get(Number(id)) as UpdateDetail | undefined;
  if (!u) notFound();

  let aiJudged = false;
  let aiSummary = false;
  try {
    const p = u.payload_json ? JSON.parse(u.payload_json) : null;
    aiJudged = !!p?.semantic;
    aiSummary = p?.summarySource === "ai";
  } catch {
    // unparseable payload — no AI markings
  }
  const sourceHref = (SOURCE_DETAIL_HREF[u.source_type] ?? ((i: number) => `/updates?source_id=${i}`))(
    u.source_id
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/updates" className="text-sm text-indigo-300 hover:underline">
          ← All updates
        </Link>
      </div>

      <article className="glass-strong rise space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${
              PRIORITY_BADGE[u.priority] ?? PRIORITY_BADGE.normal
            }`}
          >
            {u.priority}
          </span>
          <span className="badge">{u.kind}</span>
          {(aiJudged || aiSummary) && (
            <AiBadge
              title={
                aiJudged
                  ? "Matched and prioritized by AI"
                  : "Summary written by AI"
              }
            />
          )}
          <span className="ml-auto text-xs text-slate-500">
            {formatDateTime(u.created_at)}
          </span>
        </div>

        <h1 className="text-xl font-semibold leading-snug">{u.title}</h1>

        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
          <span>
            {u.source_type} ·{" "}
            <Link href={sourceHref} className="text-indigo-300 hover:underline">
              {u.source_name ?? u.source_url}
            </Link>
          </span>
          {u.url && (
            <a
              href={u.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-indigo-300 hover:underline"
            >
              open source ↗
            </a>
          )}
        </div>

        {u.summary && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-300">
            {u.summary}
          </p>
        )}

        <div className="flex items-center gap-3 border-t border-white/10 pt-3">
          <MarkReadButton id={u.id} isRead={!!u.read_at} />
        </div>
      </article>
    </div>
  );
}
