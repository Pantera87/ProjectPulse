"use client";

import { useEffect, useState } from "react";
import { Glyph } from "./icons";
import type { ThemeName } from "./theme-toggle";

/**
 * Settings-page theme picker: switches data-theme on <html> between
 * "aurora" (reference look, default) and "pulse" (original theme) and
 * persists it under localStorage("pp-theme") — same key the top-bar
 * toggle and the pre-paint bootstrap use.
 */
export default function ThemeSettings() {
  const [theme, setTheme] = useState<ThemeName>("aurora");

  useEffect(() => {
    setTheme(
      (document.documentElement.getAttribute("data-theme") as ThemeName) ?? "aurora"
    );
  }, []);

  function pick(next: ThemeName) {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("pp-theme", next);
    } catch {
      // private mode — the switch still works for this page load
    }
    setTheme(next);
  }

  const options: { id: ThemeName; name: string; desc: string; icon: string }[] = [
    {
      id: "aurora",
      name: "Aurora",
      desc: "Reference theme — blue-dominant navy, Inter, emerald accents. Default.",
      icon: "sparkles",
    },
    {
      id: "pulse",
      name: "Pulse",
      desc: "The original ProjectPulse theme — violet glow, Geist Sans.",
      icon: "heart",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((o) => {
        const active = theme === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => pick(o.id)}
            className={`rounded-xl border p-3 text-left transition ${
              active
                ? "border-blue-400/50 bg-blue-500/10 shadow-[0_0_18px_-6px_rgba(59,130,246,0.6)]"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            }`}
            aria-pressed={active}
          >
            <span className="flex items-center gap-2 font-medium text-slate-100">
              <Glyph name={o.icon} className="h-4 w-4" />
              {o.name}
              {active && (
                <span className="ml-auto rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                  active
                </span>
              )}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-slate-400">
              {o.desc}
            </span>
          </button>
        );
      })}
    </div>
  );
}