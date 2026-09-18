"use client";

import { useState } from "react";
import type { ScreenshotTheme } from "@/lib/screenshots";

interface Props {
  initialTheme: ScreenshotTheme;
}

/**
 * Screenshot theme setting — controls the color scheme headless Chrome emulates
 * when rendering page screenshots (dark is the default). Applies to newly
 * captured screenshots only; previously stored images are untouched.
 */
export default function ScreenshotSettings({ initialTheme }: Props) {
  const [theme, setTheme] = useState<ScreenshotTheme>(initialTheme);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    const r = await fetch("/api/settings/screenshot-theme", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ theme }),
    }).catch(() => null);
    const j = ((await r?.json().catch(() => null)) ?? null) as
      | { ok?: boolean; error?: string }
      | null;
    setSaving(false);
    if (!j?.ok) {
      setError(j?.error ?? "Save failed");
      return;
    }
    setSaved(true);
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-400">
        Color scheme headless Chrome uses when rendering page screenshots. Applies to
        newly captured screenshots — existing images are unchanged.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as ScreenshotTheme)}
            className="input-glass px-3 py-1.5 text-sm"
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
          theme
        </label>
        <button onClick={save} disabled={saving} className="btn-primary px-4 py-2 text-sm">
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-xs text-emerald-300">Saved.</span>}
        {error && <span className="text-sm text-rose-400">{error}</span>}
      </div>
    </div>
  );
}
