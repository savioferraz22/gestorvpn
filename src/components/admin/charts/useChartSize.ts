import { useEffect, useRef, useState } from "react";

export function useChartSize<T extends HTMLElement>(defaultWidth = 400) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(defaultWidth);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setWidth(Math.round(w));
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return { ref, width };
}
