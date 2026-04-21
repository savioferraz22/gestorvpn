import React, { useMemo, useState } from "react";
import { catmullRomPath, niceTicks, scaleLinear } from "./scale";
import { useChartSize } from "./useChartSize";
import { ChartTooltip, type TooltipRow } from "./ChartTooltip";
import { Empty } from "../ui";

export type AreaSeries = {
  id: string;
  label: string;
  color?: string;
  data: number[];
  dashed?: boolean;
};

type AreaChartProps = {
  series: AreaSeries[];
  height?: number;
  labels?: string[];
  tooltipLabels?: string[];
  formatY?: (v: number) => string;
  formatTooltip?: (v: number) => string;
  showGrid?: boolean;
  showAxis?: boolean;
  emptyLabel?: string;
};

const DEFAULT_COLORS = [
  "var(--primary-500)",
  "var(--info)",
  "var(--success)",
  "var(--warning)",
];

export function AreaChart({
  series,
  height = 220,
  labels,
  tooltipLabels,
  formatY = (v) => String(Math.round(v)),
  formatTooltip,
  showGrid = true,
  showAxis = true,
  emptyLabel = "Sem dados no período",
}: AreaChartProps) {
  const { ref, width } = useChartSize<HTMLDivElement>(600);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const hasData = series.some((s) => s.data.some((v) => v !== 0));

  const padding = { top: 12, right: 12, bottom: showAxis ? 24 : 8, left: showAxis ? 36 : 8 };
  const innerW = Math.max(1, width - padding.left - padding.right);
  const innerH = Math.max(1, height - padding.top - padding.bottom);

  const { max, xScale, yScale, ticks, paths } = useMemo(() => {
    const allValues = series.flatMap((s) => s.data);
    const rawMax = allValues.length ? Math.max(...allValues) : 1;
    const ticks = niceTicks(rawMax, 4);
    const max = ticks[ticks.length - 1] || 1;
    const length = series[0]?.data.length ?? 0;
    const xScale = scaleLinear(
      [0, Math.max(1, length - 1)],
      [padding.left, padding.left + innerW],
    );
    const yScale = scaleLinear([max, 0], [padding.top, padding.top + innerH]);
    const paths = series.map((s, idx) => {
      const color = s.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
      const pts = s.data.map((v, i) => ({ x: xScale(i), y: yScale(v) }));
      const d = catmullRomPath(pts);
      const area =
        pts.length > 1
          ? `${d} L ${pts[pts.length - 1].x} ${padding.top + innerH} L ${pts[0].x} ${padding.top + innerH} Z`
          : "";
      return { id: s.id, color, d, area, dashed: !!s.dashed, points: pts };
    });
    return { max, xScale, yScale, ticks, paths };
  }, [series, innerW, innerH, padding.left, padding.top]);

  if (!hasData) {
    return (
      <div ref={ref} style={{ height }} className="relative">
        <Empty title={emptyLabel} compact />
      </div>
    );
  }

  const length = series[0]?.data.length ?? 0;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const rel = (px - padding.left) / innerW;
    const idx = Math.max(0, Math.min(length - 1, Math.round(rel * (length - 1))));
    setHoverX(idx);
  }

  const tooltipRows: TooltipRow[] | null =
    hoverX == null
      ? null
      : series.map((s, idx) => ({
          color: s.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
          label: s.label,
          value: (formatTooltip ?? formatY)(s.data[hoverX] ?? 0),
        }));

  const hoverPxX = hoverX != null ? xScale(hoverX) : null;

  return (
    <div ref={ref} style={{ height }} className="relative w-full">
      <svg
        width={width}
        height={height}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverX(null)}
        role="img"
      >
        <defs>
          {paths.map((p) => (
            <linearGradient
              key={p.id}
              id={`area-${p.id}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={p.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={p.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {showGrid &&
          ticks.map((t, i) => (
            <line
              key={i}
              x1={padding.left}
              x2={padding.left + innerW}
              y1={yScale(t)}
              y2={yScale(t)}
              stroke="var(--border-base)"
              strokeDasharray="3 3"
              opacity={i === 0 ? 0.6 : 0.35}
            />
          ))}

        {showAxis &&
          ticks.map((t, i) => (
            <text
              key={`yl-${i}`}
              x={padding.left - 6}
              y={yScale(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-text-muted"
              style={{ fontSize: 10 }}
            >
              {formatY(t)}
            </text>
          ))}

        {paths.map((p) => (
          <g key={p.id}>
            {!p.dashed && p.area && (
              <path d={p.area} fill={`url(#area-${p.id})`} />
            )}
            <path
              d={p.d}
              fill="none"
              stroke={p.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={p.dashed ? "4 4" : undefined}
            />
          </g>
        ))}

        {hoverPxX != null && (
          <g>
            <line
              x1={hoverPxX}
              x2={hoverPxX}
              y1={padding.top}
              y2={padding.top + innerH}
              stroke="var(--text-muted)"
              strokeDasharray="2 3"
              opacity={0.6}
            />
            {paths.map((p) => {
              const y = p.points[hoverX!]?.y;
              if (y == null) return null;
              return (
                <circle
                  key={p.id}
                  cx={hoverPxX}
                  cy={y}
                  r={3.5}
                  fill="var(--bg-surface)"
                  stroke={p.color}
                  strokeWidth={2}
                />
              );
            })}
          </g>
        )}

        {showAxis && labels && labels.length > 0 && (
          <g>
            {[0, Math.floor((length - 1) / 2), length - 1]
              .filter((i, idx, arr) => arr.indexOf(i) === idx && i >= 0)
              .map((i) => (
                <text
                  key={`xl-${i}`}
                  x={xScale(i)}
                  y={padding.top + innerH + 16}
                  textAnchor="middle"
                  className="fill-text-muted"
                  style={{ fontSize: 10 }}
                >
                  {labels[i] ?? ""}
                </text>
              ))}
          </g>
        )}
      </svg>

      {hoverX != null && tooltipRows && (
        <ChartTooltip
          x={hoverPxX ?? 0}
          y={padding.top}
          title={tooltipLabels?.[hoverX] ?? labels?.[hoverX]}
          rows={tooltipRows}
          containerWidth={width}
        />
      )}
    </div>
  );
}
