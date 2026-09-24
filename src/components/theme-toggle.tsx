"use client";

import { useEffect, useState } from "react";
import { Glyph } from "./icons";

export type ThemeName = "vision" | "pulse";

const THEME_KEY = "pp-theme";

/**
 * Pre-paint theme bootstrap. Runs in <head> before first paint so the
 * chosen theme (persisted in localStorage) never flashes. Default theme
 * is "vision" (the reference look); "pulse" keeps the original palette.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});t=t==="pulse"?"pulse":"vision";document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

/**
 * Icon button that flips data-theme on <html> between "vision" (default
 * reference theme) and "pulse" (the original theme, kept as backup) and
 * persists the choice under localStorage("pp-theme").
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<ThemeName | null>(null);

  useEffect(() => {
    setTheme(
      (document.documentElement.getAttribute("data-theme") as ThemeName) ?? "vision"
    );
  }, []);

  function toggle() {
    const next: ThemeName = theme === "pulse" ? "vision" : "pulse";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // private mode — the switch still works for this page load
    }
    setTheme(next);
  }

  const isPulse = theme === "pulse";
  return (
    <button
      type="button"
      onClick={toggle}
      className={`rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10 hover:text-white ${className}`}
      title={
        isPulse
          ? "Switch to Vision theme"
          : "Switch to Pulse theme (original look)"
      }
      aria-label={
        isPulse
          ? "Switch to Vision theme"
          : "Switch to Pulse theme (original look)"
      }
    >
      <Glyph name={isPulse ? "sun" : "moon"} className="h-4 w-4" />
    </button>
  );
}