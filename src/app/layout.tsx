import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { ensureStartup } from "@/lib/startup";
import { getDb } from "@/lib/db";
import SearchBox from "@/components/search-box";

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

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/websites", label: "Websites" },
  { href: "/repos", label: "GitHub" },
  { href: "/feeds", label: "Feeds" },
  { href: "/updates", label: "Updates" },
  { href: "/settings", label: "Settings" },
];

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
    <nav className="border-b border-slate-800 bg-slate-950/60">
      <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-3">
        <Link href="/" className="mr-4 font-semibold text-sky-400">
          ● ProjectPulse
        </Link>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            {item.label}
            {item.href === "/updates" && unread > 0 && (
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                  critical > 0 ? "bg-red-600 text-white" : "bg-slate-700 text-slate-200"
                }`}
              >
                {unread}
              </span>
            )}
          </Link>
        ))}
        <div className="ml-auto flex items-center gap-2">
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
      <body className="min-h-full flex flex-col bg-[#0b1120]">
        <Nav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="mx-auto w-full max-w-6xl px-4 pb-4 text-xs text-slate-600">
          ProjectPulse — local project tracker. Data lives in the <code>/data</code> volume.
        </footer>
      </body>
    </html>
  );
}
