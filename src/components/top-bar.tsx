"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NavLinks from "./nav-links";
import SearchBox from "./search-box";
import ThemeToggle from "./theme-toggle";
import AiStatus from "./ai-status";

const SECTIONS: { prefix: string; label: string }[] = [
  { prefix: "/websites", label: "Websites" },
  { prefix: "/repos", label: "GitHub" },
  { prefix: "/feeds", label: "Feeds" },
  { prefix: "/updates", label: "Updates" },
  { prefix: "/settings", label: "Settings" },
  { prefix: "/search", label: "Search" },
];

/**
 * Top bar: breadcrumb (Home / <Section>) + page title on the left, search
 * box and the theme toggle on the right. On mobile it also carries the
 * horizontal nav chips and the logo (the sidebar is hidden there).
 */
export default function TopBar({ unread, critical }: { unread: number; critical: number }) {
  const pathname = usePathname();
  const section = SECTIONS.find((s) => pathname === s.prefix || pathname.startsWith(s.prefix + "/"));
  const label = section?.label ?? "Dashboard";

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[var(--background)]/70 backdrop-blur-xl">
      <div className="app-shell mx-auto flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        {/* Mobile-only logo + horizontal nav (sidebar is lg+ only). */}
        <div className="flex w-full items-center gap-2 lg:hidden">
          <Link href="/" className="mr-2 flex items-center" aria-label="ProjectPulse home">
            <Image
              src="/logo.png"
              alt=""
              aria-hidden="true"
              width={48}
              height={48}
              className="h-8 w-8 shrink-0"
            />
          </Link>
          <div className="flex flex-wrap items-center gap-1">
            <NavLinks unread={unread} critical={critical} />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 lg:flex-none">
          <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
            <Link href="/" className="hover:text-slate-300 hover:underline">
              Home
            </Link>
            <span className="mx-1" aria-hidden="true">
              /
            </span>
            <span aria-current="page" className="text-slate-300">
              {label}
            </span>
          </nav>
          <h1 className="truncate text-base font-semibold text-slate-100">{label}</h1>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <AiStatus />
          <SearchBox />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}