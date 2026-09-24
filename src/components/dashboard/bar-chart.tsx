export interface BarItem {
  label: string;
  value: number;
}

export interface BarChartProps {
  items: BarItem[];
}

/**
 * Simple horizontal bar list (no chart dependency): label, gradient track,
 * count. The caller pre-filters / sorts / slices.
 */
export default function BarChart({ items }: BarChartProps) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        No unread updates right now.
      </p>
    );
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-2.5">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-2">
          <span
            className="w-24 shrink-0 truncate text-xs text-slate-400"
            title={it.label}
          >
            {it.label}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
            <span
              className="block h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-500"
              style={{
                width: `${it.value === 0 ? 0 : Math.max(6, (it.value / max) * 100)}%`,
              }}
            />
          </span>
          <span className="w-8 shrink-0 text-right text-xs font-medium text-slate-300">
            {it.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface VerticalBarsProps {
  /** Values left-to-right (7 entries: 6 days ago ... today). */
  data: number[];
  /** One short label per bar (weekday names). */
  labels: string[];
}

/** Round a max up to a pleasant axis ceiling (1/2/2.5/5 x 10^k). */
function niceMax(v: number): number {
  if (v <= 5) return 5;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * p;
}

/**
 * Reference-style vertical bar chart (the Vision UI "Active Users" widget):
 * thin white pill bars (12px wide, fully rounded ends), a small light y-axis
 * and no grid lines. Hand-built SVG, no dependencies.
 */
export function VerticalBars({ data, labels }: VerticalBarsProps) {
  const W = 340;
  const H = 150;
  const padLeft = 30;
  const padRight = 6;
  const padTop = 8;
  const padBottom = 20;
  const n = data.length;
  const max = niceMax(Math.max(...data, 1));
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;
  const slot = plotW / Math.max(n, 1);
  const barW = 12;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  if (data.every((v) => v === 0)) {
    return (
      <div className="flex min-h-[140px] items-center justify-center">
        <p className="text-sm text-slate-500">
          No activity recorded in the last 7 days yet
        </p>
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Bar chart: ${data.reduce((a, b) => a + b, 0)} updates over ${n} days`}>
      {ticks.map((f) => {
        const gy = H - padBottom - f * plotH;
        return (
          <text key={f} x={padLeft - 5} y={gy + 3} textAnchor="end" fontSize="9" fill="#e2e8f0">
            {f * max >= 1000 ? `${(f * max) / 1000}k` : `${Math.round(f * max)}`}
          </text>
        );
      })}

      {data.map((v, i) => {
        const h = (v / max) * plotH;
        const bx = padLeft + i * slot + (slot - barW) / 2;
        const by = H - padBottom - h;
        return (
          <g key={i}>
            <rect
              x={bx}
              y={by}
              width={barW}
              height={Math.max(h, v > 0 ? barW : 0)}
              rx={barW / 2}
              fill="#ffffff"
            >
              <title>{`${labels[i] ?? ""}: ${v} update${v === 1 ? "" : "s"}`}</title>
            </rect>
            <text x={padLeft + i * slot + slot / 2} y={H - 5} textAnchor="middle" fontSize="8.5" fill="#718096">
              {labels[i] ?? ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}