import { catmullRomPath, scaleLinear } from "./scale";

type SparklineProps = {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  fill?: boolean;
  className?: string;
};

export function Sparkline({
  data,
  width = 80,
  height = 24,
  color = "var(--primary-500)",
  strokeWidth = 1.5,
  fill = true,
  className = "",
}: SparklineProps) {
  if (!data || data.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        className={className}
        aria-hidden="true"
      />
    );
  }
  const pad = 1.5;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const x = scaleLinear([0, Math.max(1, data.length - 1)], [pad, pad + w]);
  const y = scaleLinear([max, min], [pad, pad + h]);
  const points = data.map((v, i) => ({ x: x(i), y: y(v) }));
  const d = catmullRomPath(points);
  const areaD =
    fill && points.length > 1
      ? `${d} L ${points[points.length - 1].x} ${pad + h} L ${points[0].x} ${pad + h} Z`
      : "";
  const gradId = `spark-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <svg
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
    >
      {fill && (
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {fill && areaD && <path d={areaD} fill={`url(#${gradId})`} />}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default Sparkline;
