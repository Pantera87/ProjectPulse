import Link from "next/link";
import type { CSSProperties } from "react";
import { Glyph } from "../icons";

export interface KpiCardProps {
  label: string;
  value: number | string;
  /** Glyph name rendered in the gradient icon square. */
  glyph: string;
  /** When set, the whole card links there (e.g. /updates?priority=critical). */
  href?: string;
  /** Optional one-line detail under the value. */
  sub?: string;
  /** Bump to retrigger the count-flash animation (0 = never flashed). */
  flashTick?: number;
  delayMs?: number;
}

/**
 * Dashboard KPI card in the reference layout: small label on top, large
 * number under it, gradient icon square on the right.
 */
export default function KpiCard({
  label,
  value,
  glyph,
  href,
  sub,
  flashTick = 0,
  delayMs = 0,
}: KpiCardProps) {
  const inner = (
    <>
      <span className="min-w-0 flex-1 pl-1">
        <span className="block truncate text-[11px] font-medium uppercase tracking-wider text-slate-400">
          {label}
        </span>
        {/* keying on flashTick remounts the span so count-flash replays */}
        <span
          key={flashTick > 0 ? `flash-${flashTick}` : "static"}
          className={`mt-0.5 block text-2xl font-semibold tracking-tight text-white ${
            flashTick > 0 ? "count-flash" : ""
          }`}
        >
          {value}
        </span>
        {sub && (
          <span className="block truncate text-[11px] text-slate-500">{sub}</span>
        )}
      </span>
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl brand-tile text-white shadow-lg"
        aria-hidden="true"
      >
        <Glyph name={glyph} className="h-5 w-5" />
      </span>
    </>
  );

  const cls = "glass glass-hover glass-tile rise flex items-center gap-3 p-4";
  const style: CSSProperties = { "--delay": `${delayMs}ms` } as CSSProperties;

  if (href) {
    return (
      <Link href={href} className={cls} style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={cls} style={style}>
      {inner}
    </div>
  );
}
