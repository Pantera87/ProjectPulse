"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Glyph } from "./icons";

const NAV = [
  { href: "/", label: "Dashboard", icon: "activity" },
  { href: "/websites", label: "Websites", icon: "globe" },
  { href: "/repos", label: "GitHub", icon: "github" },
  { href: "/feeds", label: "Feeds", icon: "rss" },
  { href: "/updates", label: "Updates", icon: "bell" },
  { href: "/settings", label: "Settings", icon: "cog" },
];

/**
 * Horizontal chip row (mobile top bar) or stacked vertical items (desktop
 * sidebar). The vertical active state uses a blue gradient fill; the
 * Updates item carries the unread badge.
 */
export default function NavLinks({
  unread,
  critical,
  variant = "horizontal",
}: {
  unread: number;
  critical: number;
  variant?: "horizontal" | "vertical";
}) {
  const pathname = usePathname();
  return (
    <>
      {NAV.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(item.href + "/");
        const badge =
          item.href === "/updates" && unread > 0 ? (
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                critical > 0 ? "bg-red-500/80 text-white" : "bg-white/15 text-white"
              }`}
            >
              {unread}
            </span>
          ) : null;

        if (variant === "vertical") {
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "nav-item-active text-white"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Glyph name={item.icon} className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {badge}
            </Link>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-3 py-1.5 text-sm transition ${
              active
                ? "chip chip-active"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            {item.label}
            {badge}
          </Link>
        );
      })}
    </>
  );
}