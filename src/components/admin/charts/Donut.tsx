import React, { useMemo } from "react";
import { Empty } from "../ui";

export type DonutSlice = {
  id: string;
  label: string;
  value: number;
  color?: string;
};

type DonutProps = {
  data: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: React.ReactNode;
  legend?: boolean;
  formatValue?: (v: number) => string;
};

const DEFAULT_COLORS = [
  "var(--primary-500)",
  "var(--info)",
  "var(--success)",
  "var(--warning)",
  "var(--danger)",
  "#a855f7",
];

function polar(cx: number, cy: number, r: number, angle: number) {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const;
}

function arcPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  start: number,
  end: number,
) {
  const large = end - start > Math.PI ? 1 : 0;
  const [x1, y1] = polar(cx, cy, rOuter, start);
  const [x2, y2] = polar(cx, cy, rOuter, end);
  const [x3, y3] = polar(cx, cy, rInner, end);
  const [x4, y4] = polar(cx, cy, rInner, start);
  return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4} Z`;
}

export function Donut({
  data,
  size = 160,
  thickness = 22,
  centerLabel,
  legend = true,
  formatValue = (v) => String(v),
}: DonutProps) {
  const total = data.reduce((a, b) => a + b.value, 0);

  const slices = useMemo(() => {
    if (total <= 0) return [];
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 2;
    const rInner = r - thickness;
    let angle = -Math.PI / 2;
    return data.map((d, i) => {
      const portion = d.value / total;
      const delta = portion * Math.PI * 2;
      const startAngle = angle;
      const endAngle = angle + delta;
      angle = endAngle;
      const safeEnd = delta > 0 ? endAngle - 0.001 : endAngle;
      return {
        ...d,
        color: d.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
        path: arcPath(cx, cy, r, rInner, startAngle, safeEnd),
        portion,
      };
    });
  }, [data, size, thickness, total]);

  if (total <= 0) {
    return <Empty title="Sem dados" compact />;
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img">
          {slices.map((s) => (
            <path key={s.id} d={s.path} fill={s.color} />
          ))}
        </svg>
        {centerLabel && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            {centerLabel}
          </div>
        )}
      </div>
      {legend && (
        <div className="flex w-full flex-col gap-1.5">
          {slices.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 text-xs"
            >
              <span className="flex items-center gap-2 text-text-base">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: s.color }}
                />
                <span className="truncate">{s.label}</span>
              </span>
              <span className="shrink-0 tabular-nums text-text-muted">
                {formatValue(s.value)}{" "}
                <span className="opacity-60">
                  ({(s.portion * 100).toFixed(0)}%)
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
