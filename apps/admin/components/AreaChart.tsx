'use client';

import { useId, useMemo, useState } from 'react';

export type ChartPoint = { label: string; value: number };

type Props = {
  points: ChartPoint[];
  /** Format a value for the y-axis + hover tooltip. */
  format?: (v: number) => string;
  /** Show roughly this many x-axis labels (rest are thinned out). */
  maxXLabels?: number;
  height?: number;
  /** Line/area accent. Defaults to the theme primary. */
  color?: string;
};

// Build a smooth (monotone-ish) cubic path through the points so the line reads
// like a real chart instead of jagged segments.
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const d: string[] = [`M ${pts[0].x} ${pts[0].y}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];
    const t = 0.18;
    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;
    d.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`);
  }
  return d.join(' ');
}

export function AreaChart({
  points,
  format = (v) => String(v),
  maxXLabels = 8,
  height = 180,
  color = '#7c83ff',
}: Props) {
  const uid = useId().replace(/[:]/g, '');
  const [hover, setHover] = useState<number | null>(null);

  const W = 760;
  const H = 240;
  const padL = 8;
  const padR = 8;
  const padT = 14;
  const padB = 8;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // Round the axis top up to an even integer ≥ 2 so the three y-labels
  // (max, max/2, 0) are always distinct whole numbers — otherwise a tiny peak
  // like 1 renders as "1 / 0.5→1 / 0" (duplicate "1").
  const rawMax = Math.max(1, ...points.map((p) => p.value));
  const max = rawMax <= 2 ? 2 : Math.ceil(rawMax / 2) * 2;
  const n = points.length;

  const coords = useMemo(
    () =>
      points.map((p, i) => ({
        x: padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW),
        y: padT + innerH - (p.value / max) * innerH,
        ...p,
      })),
    [points, n, max, innerW, innerH]
  );

  const linePath = smoothPath(coords);
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x} ${padT + innerH} L ${coords[0].x} ${padT + innerH} Z`
      : '';

  // Horizontal grid lines + y labels at 0 / 50% / 100%.
  const gridVals = [0, 0.5, 1];
  const labelEvery = Math.max(1, Math.ceil(n / maxXLabels));

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* grid */}
        {gridVals.map((g) => {
          const y = padT + innerH - g * innerH;
          return (
            <line
              key={g}
              x1={padL}
              y1={y}
              x2={W - padR}
              y2={y}
              stroke="#262a37"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              strokeDasharray={g === 0 ? undefined : '3 4'}
            />
          );
        })}

        {areaPath && <path d={areaPath} fill={`url(#fill-${uid})`} />}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* hover marker */}
        {hover != null && coords[hover] && (
          <>
            <line
              x1={coords[hover].x}
              y1={padT}
              x2={coords[hover].x}
              y2={padT + innerH}
              stroke={color}
              strokeWidth={1}
              strokeOpacity={0.5}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={coords[hover].x} cy={coords[hover].y} r={3.5} fill={color}
              vectorEffect="non-scaling-stroke" />
          </>
        )}

        {/* invisible hit columns */}
        {coords.map((c, i) => (
          <rect
            key={i}
            x={padL + (n <= 1 ? 0 : ((i - 0.5) / (n - 1)) * innerW)}
            y={0}
            width={n <= 1 ? innerW : innerW / (n - 1)}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>

      {/* y-axis labels (HTML so they don't distort with preserveAspectRatio=none) */}
      <div className="pointer-events-none absolute inset-y-0 left-0 flex flex-col justify-between py-[14px] text-[10px] text-muted">
        <span>{format(max)}</span>
        <span>{format(max / 2)}</span>
        <span>{format(0)}</span>
      </div>

      {/* hover tooltip */}
      {hover != null && coords[hover] && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] shadow-card"
          style={{
            left: `${(coords[hover].x / W) * 100}%`,
            top: `${(coords[hover].y / H) * (height - 0) - 8}px`,
          }}
        >
          <div className="font-medium text-text">{format(coords[hover].value)}</div>
          <div className="text-muted">{coords[hover].label}</div>
        </div>
      )}

      {/* x-axis labels */}
      <div className="absolute inset-x-0 -bottom-4 flex justify-between px-1 text-[9px] leading-none text-muted">
        {points.map((p, i) => (
          <span key={i} className="flex-1 text-center">
            {i % labelEvery === 0 ? p.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
