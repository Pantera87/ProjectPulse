"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Priority } from "@/lib/db";

type TrackKey = "releases" | "readme" | "commits";

const SEVERITY_OPTIONS: Priority[] = ["normal", "high", "critical"];

const SEVERITY_KEY: Record<
  TrackKey,
  "releaseSeverity" | "readmeSeverity" | "commitSeverity"
> = {
  releases: "releaseSeverity",
  readme: "readmeSeverity",
  commits: "commitSeverity",
};

interface Props {
  sourceId: number;
  initial: {
    releases: boolean;
    readme: boolean;
    commits: boolean;
    releaseSeverity: Priority;
    readmeSeverity: Priority;
    commitSeverity: Priority;
  };
}

const ITEMS: { key: TrackKey; label: string; desc: string }[] = [
  {
    key: "releases",
    label: "New releases",
    desc: "Every new release creates an update.",
  },
  {
    key: "readme",
    label: "README changes",
    desc: "Creates an update whenever the README content changes.",
  },
  {
    key: "commits",
    label: "New commits",
    desc: "Every new commit creates an update.",
  },
];

const TRACK_FIELD: Record<TrackKey, string> = {
  releases: "track_releases",
  readme: "track_readme",
  commits: "track_commits",
};

const SEVERITY_FIELD: Record<TrackKey, string> = {
  releases: "release_severity",
  readme: "readme_severity",
  commits: "commit_severity",
};

/**
 * Keywordless change-tracking toggles for a GitHub source. Independent of
 * the keyword rules — each toggle creates updates on the event itself.
 */
export default function TrackingToggles({ sourceId, initial }: Props) {
  const [values, setValues] = useState(initial);
  const [status, setStatus] = useState<string | null>(null);
  const router = useRouter();

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/sources/${sourceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setStatus(res.ok ? "Saved" : "Save failed");
    router.refresh();
  }

  function toggle(key: TrackKey, checked: boolean) {
    setValues((v) => ({ ...v, [key]: checked }));
    void patch({ [TRACK_FIELD[key]]: checked });
  }

  function setSeverity(key: TrackKey, value: Priority) {
    setValues((v) => ({ ...v, [SEVERITY_KEY[key]]: value }));
    void patch({ [SEVERITY_FIELD[key]]: value });
  }

  const severity: Record<TrackKey, Priority> = {
    releases: values.releaseSeverity,
    readme: values.readmeSeverity,
    commits: values.commitSeverity,
  };

  return (
    <div className="space-y-2">
      {ITEMS.map((it) => (
        <div
          key={it.key}
          className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
        >
          <label className="flex flex-1 cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={values[it.key]}
              onChange={(e) => toggle(it.key, e.target.checked)}
              className="mt-0.5 accent-violet-500"
            />
            <span>
              <span className="block text-sm font-medium text-slate-200">
                {it.label}
              </span>
              <span className="block text-xs text-slate-500">{it.desc}</span>
            </span>
          </label>
          <select
            value={severity[it.key]}
            onChange={(e) => setSeverity(it.key, e.target.value as Priority)}
            title="Severity for this track's updates"
            className="shrink-0 rounded-md border border-white/15 bg-slate-900 px-2 py-1 text-xs text-slate-200 focus:outline-none"
          >
            {SEVERITY_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
      ))}
      {status && <span className="text-xs text-emerald-400">{status}</span>}
    </div>
  );
}
