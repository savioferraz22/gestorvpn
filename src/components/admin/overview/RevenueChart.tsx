import { useMemo } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { AdminReports } from "../../../types";
import { Card } from "../ui";
import { AreaChart, type AreaSeries } from "../charts";
import type { OverviewSeries } from "./useOverviewFilters";

type RevenueChartProps = {
  reports: AdminReports;
  series: OverviewSeries;
  compare: boolean;
  onToggleCompare: () => void;
  period: number;
};

const SERIES_META: Record<
  OverviewSeries,
  { label: string; color: string; format: (v: number) => string; integer: boolean }
> = {
  revenue: {
    label: "Receita",
    color: "var(--primary-500)",
    format: (v) => `R$ ${Number(v).toFixed(2).replace(".", ",")}`,
    integer: false,
  },
  sales: {
    label: "Vendas",
    color: "var(--success)",
    format: (v) => String(Math.round(v)),
    integer: true,
  },
  tests: {
    label: "Testes",
    color: "var(--warning)",
    format: (v) => String(Math.round(v)),
    integer: true,
  },
};

function shortDate(iso: string) {
  const parts = iso.slice(5).split("-");
  return parts.length === 2 ? `${parts[1]}/${parts[0]}` : iso;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function tooltipDate(iso: string) {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts.map(Number);
  const date = new Date(y, (m ?? 1) - 1, d);
  const wd = WEEKDAYS[date.getDay()] ?? "";
  return `${wd} · ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

function pickValues(
  reports: AdminReports,
  series: OverviewSeries,
  previous: boolean,
): { date: string; value: number }[] {
  if (series === "tests") {
    const src = previous ? reports.previousTestsHistory : reports.testsHistory;
    return (src ?? []).map((d) => ({ date: d.date, value: d.count }));
  }
  const src = previous ? reports.previousSalesHistory : reports.salesHistory;
  return (src ?? []).map((d) => ({
    date: d.date,
    value: series === "revenue" ? d.revenue : d.count,
  }));
}

function computeStats(values: number[]) {
  if (values.length === 0) {
    return { total: 0, avg: 0, max: 0, min: 0, nonZero: 0 };
  }
  const nonZeroValues = values.filter((v) => v > 0);
  const total = values.reduce((a, b) => a + b, 0);
  const max = Math.max(...values);
  const min = nonZeroValues.length > 0 ? Math.min(...nonZeroValues) : 0;
  return {
    total,
    avg: total / values.length,
    max,
    min,
    nonZero: nonZeroValues.length,
  };
}

function deltaPct(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function StatCell({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: string;
  delta?: number | null;
  tone?: "default" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-success"
      : tone === "negative"
        ? "text-danger"
        : "text-text-base";
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border-base/40 bg-bg-surface-hover/40 px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <span className={`text-sm font-bold tabular-nums ${toneClass}`}>{value}</span>
      {delta != null && Number.isFinite(delta) && (
        <span
          className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${
            delta >= 0 ? "text-success" : "text-danger"
          }`}
        >
          {delta >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {Math.abs(delta).toFixed(1)}%
        </span>
      )}
    </div>
  );
}

export function RevenueChart({
  reports,
  series,
  compare,
  onToggleCompare,
  period,
}: RevenueChartProps) {
  const meta = SERIES_META[series];

  const currentPoints = useMemo(
    () => pickValues(reports, series, false),
    [reports, series],
  );
  const previousPoints = useMemo(
    () => pickValues(reports, series, true),
    [reports, series],
  );

  const labels = currentPoints.map((d) => shortDate(d.date));
  const tooltipLabels = currentPoints.map((d) => tooltipDate(d.date));
  const currentValues = currentPoints.map((d) => d.value);
  const previousValues = previousPoints.map((d) => d.value);

  const seriesData: AreaSeries[] = [
    {
      id: "current",
      label: `${meta.label} (atual)`,
      color: meta.color,
      data: currentValues,
    },
  ];

  if (compare && previousValues.length > 0) {
    // Align previous series to current length (pad/truncate)
    const aligned =
      previousValues.length === currentValues.length
        ? previousValues
        : currentValues.map((_, i) => previousValues[i] ?? 0);
    seriesData.push({
      id: "previous",
      label: `${meta.label} (período anterior)`,
      color: "var(--text-muted)",
      data: aligned,
      dashed: true,
    });
  } else if (compare && previousValues.length === 0) {
    // Fallback: flat line at previous total average
    const prevTotal =
      series === "revenue"
        ? reports.previousRevenue
        : series === "sales"
          ? reports.previousSales
          : reports.previousTests;
    if (prevTotal != null && currentValues.length > 0) {
      const avg = prevTotal / currentValues.length;
      seriesData.push({
        id: "previous",
        label: `${meta.label} (anterior — média)`,
        color: "var(--text-muted)",
        data: new Array(currentValues.length).fill(avg),
        dashed: true,
      });
    }
  }

  const curr = computeStats(currentValues);
  const prev = computeStats(previousValues);

  const fmt = meta.format;
  const totalDelta = deltaPct(curr.total, prev.total);
  const avgDelta = deltaPct(curr.avg, prev.avg);
  const maxDelta = deltaPct(curr.max, prev.max);

  return (
    <Card padding="md">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-text-base">
            {meta.label} — últimos {period} dias
          </h3>
          <p className="text-xs text-text-muted">
            Série diária · clique nos KPIs acima para alternar
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border-base/60 bg-bg-surface-hover/50 px-2.5 py-1 text-xs">
          <input
            type="checkbox"
            checked={compare}
            onChange={onToggleCompare}
            className="h-3.5 w-3.5 accent-primary-600"
          />
          <span className="font-medium text-text-muted">Comparar anterior</span>
        </label>
      </div>

      <AreaChart
        series={seriesData}
        labels={labels}
        tooltipLabels={tooltipLabels}
        height={240}
        formatY={(v) =>
          series === "revenue"
            ? v >= 1000
              ? `${(v / 1000).toFixed(1)}k`
              : Math.round(v).toString()
            : String(Math.round(v))
        }
        formatTooltip={fmt}
      />

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCell
          label={series === "revenue" ? "Receita total" : "Total"}
          value={fmt(curr.total)}
          delta={compare ? totalDelta : undefined}
        />
        <StatCell label="Média diária" value={fmt(curr.avg)} delta={compare ? avgDelta : undefined} />
        <StatCell label="Maior dia" value={fmt(curr.max)} delta={compare ? maxDelta : undefined} />
        <StatCell
          label="Menor dia"
          value={curr.nonZero > 0 ? fmt(curr.min) : "—"}
        />
      </div>

      {series !== "tests" && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCell
            label="Vendas"
            value={String(reports.totalSales)}
            delta={
              compare && reports.previousSales
                ? deltaPct(reports.totalSales, reports.previousSales)
                : undefined
            }
          />
          <StatCell
            label="Ticket médio"
            value={`R$ ${(reports.avgTicket ?? 0).toFixed(2).replace(".", ",")}`}
          />
          <StatCell label="Dias ativos" value={`${curr.nonZero}/${currentValues.length}`} />
          {compare && previousValues.length > 0 ? (
            <StatCell
              label="Período anterior"
              value={fmt(prev.total)}
              tone={totalDelta != null && totalDelta >= 0 ? "positive" : "negative"}
            />
          ) : (
            <StatCell label="Conversão" value={`${reports.conversionRate}%`} />
          )}
        </div>
      )}
    </Card>
  );
}
