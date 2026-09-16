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
  critical: "border-red-800 bg-red-950/60",
  high: "border-amber-800 bg-amber-950/40",
  normal: "border-slate-800 bg-slate-900",
};

export default function UpdateItem({ u }: { u: UpdateView }) {
  return (
    <li
      className={`rounded border px-3 py-2 ${STYLES[u.priority] ?? STYLES.normal} ${
        u.read_at ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
            u.priority === "critical"
              ? "bg-red-700 text-white"
              : u.priority === "high"
                ? "bg-amber-700 text-white"
                : "bg-slate-700 text-slate-300"
          }`}
        >
          {u.priority}
        </span>
        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
          {u.kind}
        </span>
        <span className="font-medium">{u.title}</span>
        <span className="text-xs text-slate-500">
          {u.source_type} · {u.source_name}
        </span>
        {u.url && (
          <a href={u.url} target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:underline">
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
