import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ensureStartup } from "@/lib/startup";
import { getDb } from "@/lib/db";
import AiActivityProvider from "@/components/ai-activity-provider";
import Aurora from "@/components/aurora";
import AppShell from "@/components/app-shell";
import { THEME_BOOTSTRAP_SCRIPT } from "@/components/theme-toggle";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Reference-theme body font (Inter). Toggled via data-theme — see the
// --font-sans mapping in globals.css.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Aurora theme reference font (Plus Jakarta). Aurora uses this via
// --font-sans: var(--font-pjs) in globals.css.
const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-pjs",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  // Canonical base for resolving relative metadata URLs (OG/Twitter images).
  // The app runs on user-defined domains, so anchor the social image on the
  // GitHub Pages landing page, which serves the same image.
  metadataBase: new URL("https://pantera87.github.io/ProjectPulse/"),
  title: {
    default: "ProjectPulse — Self-hosted Project Tracker & Changelog Monitor",
    template: "%s — ProjectPulse",
  },
  description:
    "Self-hosted project tracker and changelog monitor: snapshot websites, follow GitHub releases and milestones, watch RSS/Atom feeds — with priority keyword rules and optional local AI (Ollama) summaries.",
  keywords: [
    "self-hosted",
    "project tracker",
    "changelog monitor",
    "website change monitor",
    "github releases",
    "rss",
    "local ai",
    "ollama",
    "docker",
  ],
  applicationName: "ProjectPulse",
  icons: { icon: "/logo256transparent.png" },
  openGraph: {
    type: "website",
    siteName: "ProjectPulse",
    title: "ProjectPulse — Self-hosted Project Tracker & Changelog Monitor",
    description:
      "Snapshot websites, follow GitHub releases and RSS feeds, keyword rules with priorities, AI summaries via local Ollama.",
    images: [{ url: "/assets/og-image.png", alt: "ProjectPulse dashboard" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ProjectPulse — Self-hosted Project Tracker & Changelog Monitor",
    description:
      "Snapshot websites, follow GitHub releases and RSS feeds, keyword rules with priorities, AI summaries via local Ollama.",
    images: ["/assets/og-image.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  ensureStartup();
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
    <html
      lang="en"
      data-theme="aurora"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${plusJakarta.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Aurora />
        {/* Shared AI-activity context: the sidebar ring, the check buttons and
            the status badge all see live "AI is processing" state. */}
        <AiActivityProvider>
          <AppShell unread={unread} critical={critical}>
            {children}
          </AppShell>
        </AiActivityProvider>
      </body>
    </html>
  );
}
