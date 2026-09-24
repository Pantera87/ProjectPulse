"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./sidebar";
import TopBar from "./top-bar";

/**
 * Client shell: sidebar + top bar + content column. /login gets a bare
 * shell (no chrome) so the sign-in card stays centered and clean.
 */
export default function AppShell({
  unread,
  critical,
  children,
}: {
  unread: number;
  critical: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const bare = pathname.startsWith("/login");

  if (bare) return <>{children}</>;

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <Sidebar unread={unread} critical={critical} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar unread={unread} critical={critical} />
        <main className="app-shell mx-auto flex-1 px-4 py-6">{children}</main>
        <footer className="app-shell mx-auto flex items-center justify-between px-4 pb-4 text-xs text-slate-500">
          <span>ProjectPulse — local project tracker.</span>
          <a
            href="https://github.com/pantera87/ProjectPulse"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-300 hover:underline"
          >
            GitHub
          </a>
        </footer>
      </div>
    </div>
  );
}