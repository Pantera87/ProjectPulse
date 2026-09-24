"use client";

import { useEffect, useRef, useState } from "react";

export interface KebabItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export default function KebabMenu({
  items,
  title = "More actions",
}: {
  items: KebabItem[];
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost h-7 w-7 justify-center px-0 text-base"
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          className="glass absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden py-1 text-sm"
        >
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                if (it.disabled) return;
                setOpen(false);
                it.onClick();
              }}
              className={`block w-full px-3 py-1.5 text-left transition disabled:opacity-40 ${
                it.danger
                  ? "text-red-300 hover:bg-red-500/15"
                  : "text-slate-200 hover:bg-white/10"
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
