"use client";

import { useId } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Glyph } from "../icons";

// Geometry copied 1:1 from the Vision UI Dashboard demo (creative-tim):
// 200x200 wrap, viewBox 100 100 200 200, r=92.5, 15px stroke, -90deg rotation
// so progress starts at 12 o'clock, gradient from transparent to the gauge
// color, round line caps, 400ms dashoffset transition.
const R = 92.5;
const CIRC = 2 * Math.PI * R;
const STROKE = 15;
const MUTED = "#a0aec0";

function clamp(n: number) {
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
}

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(
    h.slice(4, 6),
    16,
  )}, ${alpha})`;
}

export interface CircleProgressProps {
  /** Progress fraction 0..1 (clamped). */
  fraction: number;
  /** Gradient end color, e.g. "#0075ff". The start stop is the same color at alpha 0. */
  color: string;
  /** Track circle stroke. Default transparent (demo "Safety" ring). */
  track?: string;
  /** Wrap width/height — a number in px or any CSS length (e.g. "min(200px, 100%)"). */
  size?: number | string;
  /** Content centered inside the circle (icon / stacked text). */
  children?: ReactNode;
}

/**
 * Full-circle progress gauge exactly as rendered by the Vision UI Dashboard
 * demo ("circle-progress-wrap"): the demo's gauge is a complete 360° ring,
 * not an ApexCharts radial bar.
 */
export function CircleProgress({
  fraction,
  color,
  track = "transparent",
  size = 200,
  children,
}: CircleProgressProps) {
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const offset = CIRC * (1 - clamp(fraction));
  const wrap: CSSProperties = {
    width: size,
    aspectRatio: "1 / 1",
    position: "relative",
    flexShrink: 1,
    minWidth: 0,
  };
  return (
    <div style={wrap}>
      <svg
        viewBox="100 100 200 200"
        width="100%"
        height="100%"
        style={{ transform: "rotate(-90deg)", overflow: "visible" }}
        aria-hidden="true"
      >
        <linearGradient
          id={id}
          x1="0%"
          y1="0%"
          x2="0%"
          y2="100%"
          gradientTransform="rotate(90, .5, .5)"
        >
          <stop offset="0" stopColor={hexToRgba(color, 0)} />
          <stop offset="100" stopColor={color} />
        </linearGradient>
        <circle cx="200" cy="200" r={R} stroke={track} strokeWidth={STROKE} fill="none" />
        <circle
          cx="200"
          cy="200"
          r={R}
          fill="none"
          strokeWidth={STROKE}
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke={`url(#${id})`}
          style={{ transition: "stroke-dashoffset 400ms" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export interface SatisfactionGaugeProps {
  /** Progress fraction 0..1 (clamped). */
  fraction: number;
  /** Big value centered in the circle, e.g. "72%". */
  value: string;
  /** Small caption under the value, e.g. "3 of 4 read". */
  caption?: string;
  /** Centered icon above the value (defaults to a 30px white check). */
  icon?: ReactNode;
  size?: number | string;
}

/**
 * The demo's "Satisfaction Rate" widget: full blue circle
 * (transparent→#0075ff gradient over a #22234B track) with a 30px white icon,
 * the value and a caption stacked in the center below it, and 0% / 100%
 * pinned to the left and right of the circle.
 */
export function SatisfactionGauge({
  fraction,
  value,
  caption,
  icon,
  size = "min(200px, 100%)",
}: SatisfactionGaugeProps) {
  return (
    <div className="flex w-full items-center justify-center gap-2">
      <span className="shrink-0 text-xs text-[#a0aec0]">0%</span>
      <CircleProgress fraction={fraction} color="#0075ff" track="#22234B" size={size}>
        <div className="flex flex-col items-center">
          {icon ?? <Glyph name="check" className="h-[30px] w-[30px] text-white" />}
          <div className="text-[30px] font-medium leading-[1.375] text-white">{value}</div>
          {caption ? <div className="text-xs text-[#a0aec0]">{caption}</div> : null}
        </div>
      </CircleProgress>
      <span className="shrink-0 text-xs text-[#a0aec0]">100%</span>
    </div>
  );
}

export interface RingGaugeProps {
  /** Progress fraction 0..1 (clamped). */
  fraction: number;
  /** Big value in the ring center, e.g. "9.3". */
  value: string;
  /** Small caption above the value, e.g. "Safety". */
  top?: string;
  /** Small caption below the value, e.g. "Total Score". */
  bottom?: string;
  size?: number | string;
}

/**
 * The demo's "Safety / Total Score" ring as-is: full teal circle
 * (transparent→#05CD99 gradient, no track) with a 14px caption, 48px score
 * and 14px caption stacked in the center.
 */
export function RingGauge({
  fraction,
  value,
  top,
  bottom,
  size = "min(200px, 100%)",
}: RingGaugeProps) {
  return (
    <CircleProgress fraction={fraction} color="#05cd99" size={size}>
      <div className="text-center" style={{ padding: "0 8%" }}>
        {top ? <div className="text-sm font-bold text-[#a0aec0]">{top}</div> : null}
        <div className="text-[48px] font-bold leading-[1.2] text-white">{value}</div>
        {bottom ? <div className="text-sm font-bold text-[#a0aec0]">{bottom}</div> : null}
      </div>
    </CircleProgress>
  );
}

export { MUTED };
