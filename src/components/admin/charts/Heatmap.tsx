import { useMemo } from "react";
import { Empty } from "../ui";

type HeatmapProps = {
  data: number[];
  labels?: string[];
  columnLabels?: string[];
  rows?: number;
  cellSize?: number;
  gap?: number;
  colorFrom?: string;
  colorTo?: string;
  emptyLabel?: string;
};

export function Heatmap({
  data,
  labels,
  columnLabels,
  rows = 7,
  cellSize = 14,
  gap = 3,
  colorFrom = "var(--primary-500)",
  colorTo = "var(--bg-surface-hover)",
  emptyLabel = "Sem dados",
}: HeatmapProps) {
  const { max, cols } = useMemo(() => {
    const max = Math.max(1, ...data);
    const cols = Math.ceil(data.length / rows);
    return { max, cols };
  }, [data, rows]);

  const hasData = data.some((v) => v > 0);
  if (!hasData) return <Empty title={emptyLabel} compact />;

  const totalW = cols * (cellSize + gap);
  const totalH = rows * (cellSize + gap);

  return (
    <div className="flex w-full flex-col gap-2">
      <svg
        width={totalW}
        height={totalH}
        className="max-w-full"
        role="img"
      >
        {data.map((v, i) => {
          const col = Math.floor(i / rows);
          const row = i % rows;
          const intensity = v / max;
          const x = col * (cellSize + gap);
          const y = row * (cellSize + gap);
          const fill = intensity > 0 ? colorFrom : colorTo;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={cellSize}
              height={cellSize}
              rx={3}
              fill={fill}
              opacity={intensity > 0 ? 0.25 + intensity * 0.75 : 1}
            >
              <title>
                {labels?.[i] ?? `#${i}`}: {v}
              </title>
            </rect>
          );
        })}
      </svg>
      {columnLabels && (
        <div
          className="flex text-[10px] text-text-muted"
          style={{ gap: gap, width: totalW }}
        >
          {columnLabels.map((l, i) => (
            <span
              key={i}
              style={{ width: cellSize, textAlign: "center" }}
              className="truncate"
            >
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
