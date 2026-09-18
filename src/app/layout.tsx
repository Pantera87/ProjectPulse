import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { ensureStartup } from "@/lib/startup";
import { getDb } from "@/lib/db";
import SearchBox from "@/components/search-box";
import AiStatus from "@/components/ai-status";
import AiActivityProvider from "@/components/ai-activity-provider";
import AiBusyRing from "@/components/ai-busy-ring";
import Aurora from "@/components/aurora";
import NavLinks from "@/components/nav-links";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ProjectPulse",
  description: "Track project websites, GitHub repos and feeds for updates",
};

function Nav() {
  let unread = 0;
  let critical = 0;
  try {
    const d = getDb();
    const row = d
      .prepare(
        `SELECT COUNT(*) AS c,
                SUM(CASE WHEN priority = 'critical' THEN 1 ELSE 0 END) AS crit
         FROM updates WHERE read_at IS NULL`
      )
      .get() as { c: number; crit: number | null };
    unread = row.c;
    critical = row.crit ?? 0;
  } catch {
    // DB not ready (first boot) — render without badge
  }
  return (
    <nav className="sticky top-0 z-40 border-b border-white/10 bg-[#060814]/70 backdrop-blur-xl">
      <div className="app-shell mx-auto flex flex-wrap items-center gap-x-1 gap-y-2 px-4 py-3">
        <Link
          href="/"
          className="mr-4 flex items-center gap-2"
          aria-label="ProjectPulse home"
        >
          <img
            src="/logo.png"
            alt=""
            aria-hidden="true"
            className="h-8 w-8 shrink-0"
          />
          <span className="grad-text text-sm font-semibold leading-none">
            ProjectPulse
          </span>
        </Link>
        <NavLinks unread={unread} critical={critical} />
        <div className="ml-auto flex items-center gap-2">
          <AiBusyRing />
          <AiStatus />
          <SearchBox />
        </div>
      </div>
    </nav>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  ensureStartup();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Aurora />
        {/* Shared AI-activity context: the nav ring, the check buttons and
            the status badge all see live "AI is processing" state. */}
        <AiActivityProvider>
          <Nav />
          <main className="app-shell mx-auto flex-1 px-4 py-6">{children}</main>
        </AiActivityProvider>
        <footer className="app-shell mx-auto px-4 pb-4 text-xs text-slate-500">
          ProjectPulse — local project tracker.
        </footer>
      </body>
    </html>
  );
}
