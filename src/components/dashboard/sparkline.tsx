import { useId } from "react";

/**
 * Thin 7-day line sparkline for the source-card stat tiles: brand-gradient
 * polyline over the last 7 daily update counts (index 0 = 6 days ago) with a
 * subtle area fill. All-zero data renders a flat baseline. The <title> child
 * keeps the hover tooltip (per-day counts) from the old mini bar-chart.
 */
export default function Sparkline({
  data,
  width = 120,
  height = 28,
}: {
  data: number[];
  width?: number;
  height?: number;
}) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const max = Math.max(1, ...data);
  const step = width / Math.max(1, data.length - 1);
  const points = data
    .map(
      (v, i) =>
        `${(i * step).toFixed(2)},${(
          height - 1.5 - (v / max) * (height - 3)
        ).toFixed(2)}`
    )
    .join(" ");
  const lineId = `spk-line-${gid}`;
  const areaId = `spk-area-${gid}`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
    >
      <title>Updates, last 7 days: {data.join(", ")}</title>
      <defs>
        <linearGradient id={lineId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#e879f9" />
        </linearGradient>
        <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e879f9" stopOpacity="0.22" />
          <stop offset="1" stopColor="#e879f9" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={`url(#${areaId})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={`url(#${lineId})`}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}