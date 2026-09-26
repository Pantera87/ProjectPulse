"use client";

import Image from "next/image";
import Link from "next/link";
import AiBusyRing from "./ai-busy-ring";
import NavLinks from "./nav-links";

/**
 * Left application sidebar (desktop): logo, stacked navigation, and the
 * transient AI-working indicator. Hidden below the lg breakpoint (the
 * mobile top bar carries the horizontal nav instead).
 */
export default function Sidebar({ unread, critical }: { unread: number; critical: number }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-5 border-r border-white/10 bg-[var(--background)]/60 px-4 py-5 backdrop-blur-xl lg:flex">
      <Link
        href="/"
        className="flex items-center gap-2.5 px-1"
        aria-label="ProjectPulse home"
      >
        <Image
          src="/logo256transparent.png"
          alt=""
          aria-hidden="true"
          width={48}
          height={48}
          className="logo-pulse h-12 w-12 shrink-0"
        />
        <span
          className="brand-word text-xl font-bold tracking-tight"
          data-text="ProjectPulse"
        >
          ProjectPulse
        </span>
      </Link>

      <nav className="flex flex-col gap-1" aria-label="Main">
        <NavLinks variant="vertical" unread={unread} critical={critical} />
      </nav>

      <div className="flex flex-col items-start gap-2 px-1">
        <AiBusyRing />
      </div>
    </aside>
  );
}