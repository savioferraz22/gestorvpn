export function scaleLinear(
  domain: [number, number],
  range: [number, number],
) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (value: number) => r0 + ((value - d0) / span) * (r1 - r0);
}

export function scaleBand(
  count: number,
  range: [number, number],
  paddingInner = 0.2,
) {
  const [r0, r1] = range;
  const total = r1 - r0;
  const step = total / Math.max(1, count);
  const bandWidth = step * (1 - paddingInner);
  const offset = (step - bandWidth) / 2;
  return {
    step,
    bandWidth,
    x: (i: number) => r0 + i * step + offset,
  };
}

export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const mant = value / base;
  let nice: number;
  if (mant <= 1) nice = 1;
  else if (mant <= 2) nice = 2;
  else if (mant <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

export function niceTicks(max: number, steps = 4): number[] {
  const m = niceMax(max);
  const step = m / steps;
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) out.push(step * i);
  return out;
}

export function catmullRomPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}
