"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  sourceId: number;
  initial: { releases: boolean; readme: boolean; commits: boolean };
}

const ITEMS = [
  {
    key: "releases" as const,
    label: "New releases",
    desc: "Every new release creates an update.",
  },
  {
    key: "readme" as const,
    label: "README changes",
    desc: "Creates an update whenever the README content changes.",
  },
  {
    key: "commits" as const,
    label: "New commits",
    desc: "Every new commit creates an update.",
  },
];

/**
 * Keywordless change-tracking toggles for a GitHub source. Independent of
 * the keyword rules — each toggle creates updates on the event itself.
 */
export default function TrackingToggles({ sourceId, initial }: Props) {
  const [values, setValues] = useState(initial);
  const [status, setStatus] = useState<string | null>(null);
  const router = useRouter();

  async function toggle(key: (typeof ITEMS)[number]["key"], checked: boolean) {
    setValues((v) => ({ ...v, [key]: checked }));
    const res = await fetch(`/api/sources/${sourceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [`track_${key}`]: checked }),
    });
    setStatus(res.ok ? "Saved" : "Save failed");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {ITEMS.map((it) => (
        <label
          key={it.key}
          className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
        >
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
      ))}
      {status && <span className="text-xs text-emerald-400">{status}</span>}
    </div>
  );
}
