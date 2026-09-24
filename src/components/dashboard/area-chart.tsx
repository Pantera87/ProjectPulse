import { useId } from "react";

export interface AreaChartProps {
  /** Values left→right (7 entries: 6 days ago … today). */
  data: number[];
  /** One short label per data point (weekday names). */
  labels: string[];
}

/** Round a max up to a pleasant axis ceiling (1/2/2.5/5 × 10^k). */
function niceMax(v: number): number {
  if (v <= 5) return 5;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * p;
}

function fmtTick(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return `${v}`;
}

/** Catmull-Rom → cubic Bézier smoothing (the reference's wavy line). */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/**
 * Hand-built inline-SVG area chart in the reference style: labelled y-axis,
 * dashed grid lines, smooth gradient-stroked line over a soft gradient fill.
 */
export default function AreaChart({ data, labels }: AreaChartProps) {
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9]/g, "");

  const W = 420;
  const H = 190;
  const padLeft = 34;
  const padRight = 8;
  const padTop = 10;
  const padBottom = 24;
  const n = data.length;
  const max = niceMax(Math.max(...data, 1));

  const x = (i: number) => padLeft + (i * (W - padLeft - padRight)) / Math.max(n - 1, 1);
  const y = (v: number) => H - padBottom - (v / max) * (H - padTop - padBottom);

  const pts = data.map((v, i) => ({ x: x(i), y: y(v) }));
  const line = smoothPath(pts);
  const area = `${line} L ${x(n - 1).toFixed(1)} ${(H - padBottom).toFixed(1)} L ${x(0).toFixed(1)} ${(H - padBottom).toFixed(1)} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Area chart: ${data.reduce((a, b) => a + b, 0)} updates over ${n} days`}>
      <defs>
        <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2152ff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#2152ff" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id={`stroke-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2152ff" />
          <stop offset="100%" stopColor="#02c6f3" />
        </linearGradient>
      </defs>

      {ticks.map((f) => {
        const gy = (H - padBottom) - f * (H - padTop - padBottom);
        return (
          <g key={f}>
            <line
              x1={padLeft}
              x2={W - padRight}
              y1={gy}
              y2={gy}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="1"
              strokeDasharray={f === 0 ? undefined : "3 4"}
            />
            <text x={padLeft - 6} y={gy + 3} textAnchor="end" fontSize="9" fill="#64748b">
              {fmtTick(Math.round(f * max))}
            </text>
          </g>
        );
      })}

      <path d={area} fill={`url(#area-${id})`} />
      <path
        d={line}
        fill="none"
        stroke={`url(#stroke-${id})`}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="#0f1a33" stroke="#02c6f3" strokeWidth="1.5">
          <title>{`${labels[i] ?? ""}: ${data[i]} update${data[i] === 1 ? "" : "s"}`}</title>
        </circle>
      ))}

      {labels.map((l, i) => (
        <text key={`${l}-${i}`} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#64748b">
          {l}
        </text>
      ))}
    </svg>
  );
}


