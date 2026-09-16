"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/websites", label: "Websites" },
  { href: "/repos", label: "GitHub" },
  { href: "/feeds", label: "Feeds" },
  { href: "/updates", label: "Updates" },
  { href: "/settings", label: "Settings" },
];

export default function NavLinks({ unread, critical }: { unread: number; critical: number }) {
  const pathname = usePathname();
  return (
    <>
      {NAV.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(item.href + "/");
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
            {item.href === "/updates" && unread > 0 && (
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                  critical > 0 ? "bg-red-500/80 text-white" : "bg-white/15 text-white"
                }`}
              >
                {unread}
              </span>
            )}
          </Link>
        );
      })}
    </>
  );
}