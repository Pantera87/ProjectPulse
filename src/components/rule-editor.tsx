"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Rule {
  id: string;
  priority: "critical" | "high" | "normal";
  keywords: string[];
  sources: string[];
  negate?: string[];
  labels?: string[];
}

interface Props {
  sourceId: number;
  type: string;
  rules: Rule[];
}

const SOURCE_OPTIONS: Record<string, string[]> = {
  website: ["content"],
  github: ["releases", "readme", "commits"],
  rss: ["feed"],
};

const inputCls =
  "w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200";

export default function RuleEditor({ sourceId, type, rules: initial }: Props) {
  const [rules, setRules] = useState<Rule[]>(initial);
  const [status, setStatus] = useState<string | null>(null);
  const router = useRouter();

  const opts = SOURCE_OPTIONS[type] ?? ["content"];

  function update(i: number, patch: Partial<Rule>) {
    setRules((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function save() {
    const cleaned = rules
      .map((r) => ({
        ...r,
        keywords: r.keywords.filter(Boolean),
        labels: (r.labels ?? []).filter(Boolean),
        negate: (r.negate ?? []).filter(Boolean),
        sources: r.sources.length ? r.sources : opts,
      }))
      .filter((r) => r.keywords.length > 0 || (r.labels ?? []).length > 0);
    const res = await fetch(`/api/sources/${sourceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rules_json: JSON.stringify(cleaned) }),
    });
    setStatus(res.ok ? "Rules saved" : "Save failed");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {rules.map((r, i) => (
        <div key={r.id} className="rounded border border-slate-800 bg-slate-900 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={r.priority}
              onChange={(e) => update(i, { priority: e.target.value as Rule["priority"] })}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
            >
              <option value="critical">critical</option>
              <option value="high">high</option>
              <option value="normal">normal</option>
            </select>
            <input
              value={r.keywords.join(", ")}
              onChange={(e) =>
                update(i, { keywords: e.target.value.split(",").map((s) => s.trim()) })
              }
              placeholder="keywords, e.g. rocm, amd, hip"
              className="min-w-52 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
            />
            {type === "github" && (
              <input
                value={(r.labels ?? []).join(", ")}
                onChange={(e) =>
                  update(i, { labels: e.target.value.split(",").map((s) => s.trim()) })
                }
                placeholder="issue labels (optional)"
                className="w-44 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
              />
            )}
            <button
              onClick={() => setRules((rs) => rs.filter((_, j) => j !== i))}
              className="rounded border border-red-800 px-2 py-1 text-xs text-red-400"
            >
              Remove
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex gap-2">
              {opts.map((o) => (
                <label key={o} className="flex items-center gap-1 text-slate-400">
                  <input
                    type="checkbox"
                    checked={r.sources.includes(o)}
                    onChange={(e) =>
                      update(i, {
                        sources: e.target.checked
                          ? [...r.sources, o]
                          : r.sources.filter((s) => s !== o),
                      })
                    }
                  />
                  {o}
                </label>
              ))}
            </div>
            <input
              value={(r.negate ?? []).join(", ")}
              onChange={(e) =>
                update(i, { negate: e.target.value.split(",").map((s) => s.trim()) })
              }
              placeholder="negate keywords (optional)"
              className="w-48 rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs"
            />
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <button
          onClick={() =>
            setRules((rs) => [
              ...rs,
              {
                id: `r${Date.now()}`,
                priority: "critical",
                keywords: [],
                sources: [...opts],
              },
            ])
          }
          className="rounded border border-slate-600 px-3 py-1 text-sm text-slate-300"
        >
          + Add rule
        </button>
        <button
          onClick={save}
          className="rounded bg-sky-600 px-4 py-1 text-sm text-white hover:bg-sky-500"
        >
          Save rules
        </button>
        {status && <span className="text-xs text-emerald-400">{status}</span>}
      </div>
    </div>
  );
}
