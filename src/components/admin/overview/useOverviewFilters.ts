import { useCallback, useEffect, useState } from "react";

export type OverviewSeries = "revenue" | "sales" | "tests";

const KEY_PERIOD = "admin:overview:period";
const KEY_SERIES = "admin:overview:series";
const KEY_COMPARE = "admin:overview:compare";

function readNum(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    if (!v) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function readString<T extends string>(key: string, fallback: T, allowed: T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    if (v && allowed.includes(v)) return v;
    return fallback;
  } catch {
    return fallback;
  }
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === "1") return true;
    if (v === "0") return false;
    return fallback;
  } catch {
    return fallback;
  }
}

export function useOverviewFilters(initialPeriod = 30) {
  const [period, setPeriodState] = useState<number>(() =>
    readNum(KEY_PERIOD, initialPeriod),
  );
  const [series, setSeriesState] = useState<OverviewSeries>(() =>
    readString<OverviewSeries>(KEY_SERIES, "revenue", ["revenue", "sales", "tests"]),
  );
  const [compare, setCompareState] = useState<boolean>(() =>
    readBool(KEY_COMPARE, false),
  );

  useEffect(() => {
    try {
      localStorage.setItem(KEY_PERIOD, String(period));
    } catch {}
  }, [period]);

  useEffect(() => {
    try {
      localStorage.setItem(KEY_SERIES, series);
    } catch {}
  }, [series]);

  useEffect(() => {
    try {
      localStorage.setItem(KEY_COMPARE, compare ? "1" : "0");
    } catch {}
  }, [compare]);

  const setPeriod = useCallback((p: number) => setPeriodState(p), []);
  const setSeries = useCallback((s: OverviewSeries) => setSeriesState(s), []);
  const setCompare = useCallback((v: boolean) => setCompareState(v), []);

  return { period, setPeriod, series, setSeries, compare, setCompare };
}
