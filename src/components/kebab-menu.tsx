"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface KebabItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** Menu width in px (matches the `w-56` class) — used for viewport clamping. */
const MENU_WIDTH = 224;
/** Estimated height of one row + container padding, for the up/down flip. */
const ROW_HEIGHT = 32;
const MENU_PAD = 8;

export default function KebabMenu({
  items,
  title = "More actions",
}: {
  items: KebabItem[];
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // The menu is portaled to <body>, so both the trigger and the menu
      // must count as "inside".
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // The menu is position:fixed, so it would drift with the page — close on
    // scroll/resize instead of chasing the layout.
    const onMove = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    // Right-align with the button, clamped to the viewport.
    const left = Math.max(
      8,
      Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)
    );
    // Open below; flip above when there is no room and the top fits.
    const height = items.length * ROW_HEIGHT + MENU_PAD;
    const below = r.bottom + 4;
    const top =
      below + height > window.innerHeight && r.top - height - 4 > 8
        ? Math.max(8, r.top - height - 4)
        : below;
    setPos({ top, left });
    setOpen(true);
  };

  return (
    <div ref={ref} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="btn-ghost h-7 w-7 justify-center px-0 text-base"
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⋯
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="glass fixed z-50 w-56 overflow-hidden py-1 text-sm"
            style={{ top: pos.top, left: pos.left }}
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
          </div>,
          document.body
        )}
    </div>
  );
}
