import React, { useMemo, useState } from "react";
import { niceTicks, scaleBand, scaleLinear } from "./scale";
import { useChartSize } from "./useChartSize";
import { ChartTooltip, type TooltipRow } from "./ChartTooltip";
import { Empty } from "../ui";

export type BarSeries = {
  id: string;
  label: string;
  color?: string;
  data: number[];
};

type BarChartProps = {
  series: BarSeries[];
  labels?: string[];
  height?: number;
  mode?: "grouped" | "stacked" | "single";
  formatY?: (v: number) => string;
  formatTooltip?: (v: number) => string;
  showAxis?: boolean;
  showGrid?: boolean;
  emptyLabel?: string;
};

const DEFAULT_COLORS = [
  "var(--primary-500)",
  "var(--info)",
  "var(--success)",
  "var(--warning)",
];

export function BarChart({
  series,
  labels,
  height = 200,
  mode = "single",
  formatY = (v) => String(Math.round(v)),
  formatTooltip,
  showAxis = true,
  showGrid = true,
  emptyLabel = "Sem dados no período",
}: BarChartProps) {
  const { ref, width } = useChartSize<HTMLDivElement>(600);
  const [hover, setHover] = useState<number | null>(null);

  const hasData = series.some((s) => s.data.some((v) => v !== 0));
  const padding = { top: 10, right: 8, bottom: showAxis ? 22 : 6, left: showAxis ? 32 : 6 };
  const innerW = Math.max(1, width - padding.left - padding.right);
  const innerH = Math.max(1, height - padding.top - padding.bottom);

  const { bands, yScale, ticks } = useMemo(() => {
    const length = series[0]?.data.length ?? 0;
    const stacked = series[0]?.data.map((_, i) =>
      series.reduce((acc, s) => acc + (s.data[i] ?? 0), 0),
    ) ?? [];
    const rawMax =
      mode === "stacked"
        ? Math.max(1, ...stacked)
        : Math.max(1, ...series.flatMap((s) => s.data));
    const ticks = niceTicks(rawMax, 4);
    const max = ticks[ticks.length - 1] || 1;
    const bands = scaleBand(length, [padding.left, padding.left + innerW], 0.25);
    const yScale = scaleLinear([max, 0], [padding.top, padding.top + innerH]);
    return { bands, yScale, ticks };
  }, [series, mode, innerW, innerH, padding.left, padding.top]);

  if (!hasData) {
    return (
      <div ref={ref} style={{ height }} className="relative">
        <Empty title={emptyLabel} compact />
      </div>
    );
  }

  const length = series[0]?.data.length ?? 0;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - padding.left;
    const idx = Math.max(0, Math.min(length - 1, Math.floor(px / bands.step)));
    setHover(idx);
  }

  const tooltipRows: TooltipRow[] | null =
    hover == null
      ? null
      : series.map((s, idx) => ({
          color: s.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
          label: s.label,
          value: (formatTooltip ?? formatY)(s.data[hover] ?? 0),
        }));

  return (
    <div ref={ref} style={{ height }} className="relative w-full">
      <svg
        width={width}
        height={height}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        role="img"
      >
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

        {/* bars */}
        {Array.from({ length }).map((_, i) => {
          const bandX = bands.x(i);
          if (mode === "stacked") {
            let acc = 0;
            return (
              <g key={i}>
                {series.map((s, sIdx) => {
                  const value = s.data[i] ?? 0;
                  const y0 = yScale(acc);
                  acc += value;
                  const y1 = yScale(acc);
                  const barH = Math.max(0, y0 - y1);
                  const color = s.color ?? DEFAULT_COLORS[sIdx % DEFAULT_COLORS.length];
                  return (
                    <rect
                      key={s.id}
                      x={bandX}
                      y={y1}
                      width={bands.bandWidth}
                      height={barH}
                      fill={color}
                      rx={3}
                      opacity={hover == null || hover === i ? 1 : 0.45}
                    />
                  );
                })}
              </g>
            );
          }
          if (mode === "grouped") {
            const gap = 2;
            const sub = (bands.bandWidth - gap * (series.length - 1)) / series.length;
            return (
              <g key={i}>
                {series.map((s, sIdx) => {
                  const value = s.data[i] ?? 0;
                  const y = yScale(value);
                  const color = s.color ?? DEFAULT_COLORS[sIdx % DEFAULT_COLORS.length];
                  return (
                    <rect
                      key={s.id}
                      x={bandX + sIdx * (sub + gap)}
                      y={y}
                      width={sub}
                      height={yScale(0) - y}
                      fill={color}
                      rx={3}
                      opacity={hover == null || hover === i ? 1 : 0.45}
                    />
                  );
                })}
              </g>
            );
          }
          const s = series[0];
          const value = s.data[i] ?? 0;
          const y = yScale(value);
          const color = s.color ?? DEFAULT_COLORS[0];
          return (
            <rect
              key={i}
              x={bandX}
              y={y}
              width={bands.bandWidth}
              height={yScale(0) - y}
              fill={color}
              rx={3}
              opacity={hover == null || hover === i ? 1 : 0.45}
            />
          );
        })}

        {showAxis && labels && labels.length > 0 && (
          <g>
            {[0, Math.floor((length - 1) / 2), length - 1]
              .filter((i, idx, arr) => arr.indexOf(i) === idx && i >= 0)
              .map((i) => (
                <text
                  key={`xl-${i}`}
                  x={bands.x(i) + bands.bandWidth / 2}
                  y={padding.top + innerH + 14}
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
      {hover != null && tooltipRows && (
        <ChartTooltip
          x={bands.x(hover) + bands.bandWidth / 2}
          y={padding.top}
          title={labels?.[hover]}
          rows={tooltipRows}
          containerWidth={width}
        />
      )}
    </div>
  );
}
