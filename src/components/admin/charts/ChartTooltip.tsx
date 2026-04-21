import React from "react";

export type TooltipRow = {
  color?: string;
  label: string;
  value: React.ReactNode;
};

type ChartTooltipProps = {
  x: number;
  y: number;
  title?: React.ReactNode;
  rows: TooltipRow[];
  containerWidth: number;
};

export function ChartTooltip({
  x,
  y,
  title,
  rows,
  containerWidth,
}: ChartTooltipProps) {
  const estimatedWidth = 160;
  const rightSide = x + estimatedWidth + 12 > containerWidth;
  const left = rightSide ? x - estimatedWidth - 10 : x + 10;
  const top = Math.max(4, y - 8);
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-[140px] rounded-xl border border-border-base bg-bg-surface p-2.5 text-xs shadow-[var(--shadow-card-md)]"
      style={{ left, top }}
    >
      {title && (
        <div className="mb-1 text-[11px] font-semibold text-text-muted">
          {title}
        </div>
      )}
      <div className="flex flex-col gap-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-text-muted">
              {r.color && (
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: r.color }}
                />
              )}
              {r.label}
            </span>
            <span className="font-semibold tabular-nums text-text-base">
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
