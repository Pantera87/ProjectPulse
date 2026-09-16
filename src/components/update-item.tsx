import MarkReadButton from "./mark-read";

export interface UpdateView {
  id: number;
  priority: string;
  kind: string;
  title: string;
  summary: string | null;
  url: string | null;
  created_at: string;
  read_at: string | null;
  source_name: string | null;
  source_type: string;
}

const STYLES: Record<string, string> = {
  critical: "border-rose-500/40 bg-rose-500/10 shadow-[0_0_22px_-8px_rgba(244,63,94,0.5)]",
  high: "border-amber-400/40 bg-amber-400/10",
  normal: "border-white/10 bg-white/5",
};

const PRIORITY_BADGE: Record<string, string> = {
  critical: "border-rose-400/50 bg-rose-500/20 text-rose-300",
  high: "border-amber-400/50 bg-amber-400/20 text-amber-300",
  normal: "border-white/15 bg-white/10 text-slate-300",
};

export default function UpdateItem({ u }: { u: UpdateView }) {
  return (
    <li
      className={`rounded-xl border px-3 py-2 backdrop-blur-md ${STYLES[u.priority] ?? STYLES.normal} ${
        u.read_at ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
            PRIORITY_BADGE[u.priority] ?? PRIORITY_BADGE.normal
          }`}
        >
          {u.priority}
        </span>
        <span className="badge">{u.kind}</span>
        <span className="font-medium">{u.title}</span>
        <span className="text-xs text-slate-500">
          {u.source_type} · {u.source_name}
        </span>
        {u.url && (
          <a href={u.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-300 hover:underline">
            open
          </a>
        )}
        <span className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          {new Date(u.created_at).toLocaleString()}
          <MarkReadButton id={u.id} isRead={!!u.read_at} />
        </span>
      </div>
      {u.summary && (
        <p className="mt-1 line-clamp-3 whitespace-pre-line pl-1 text-xs text-slate-400">
          {u.summary}
        </p>
      )}
    </li>
  );
}
