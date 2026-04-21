import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { AdminTab, AdminReports } from "../../types";
import { fetchAdminReports } from "../../services/api";
import {
  HeroKpis,
  PeriodFilter,
  RevenueChart,
  WidgetGrid,
  useOverviewFilters,
} from "./overview";

interface Props {
  reports: AdminReports;
  setReports: (r: AdminReports) => void;
  reportPeriod: number;
  setReportPeriod: (p: number) => void;
  allTickets: any[];
  refunds: any[];
  changeRequests: any[];
  navigateTo: (tab: AdminTab) => void;
}

export function AdminOverview({
  reports,
  setReports,
  reportPeriod,
  setReportPeriod,
  allTickets,
  refunds,
  changeRequests,
  navigateTo,
}: Props) {
  const { period, setPeriod, series, setSeries, compare, setCompare } =
    useOverviewFilters(reportPeriod);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (period !== reportPeriod) {
      setReportPeriod(period);
      void refresh(period);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  // Ensure fresh shape (previousSalesHistory/previousTestsHistory) on mount
  useEffect(() => {
    if (!reports.previousSalesHistory || !reports.previousTestsHistory) {
      void refresh(period);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh(p: number = period) {
    setLoading(true);
    try {
      const data = await fetchAdminReports(p);
      setReports(data);
    } catch (err) {
      console.warn("Failed to refresh reports:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-text-base">Visão Geral</h2>
            <p className="text-xs text-text-muted">
              Desempenho do negócio nos últimos {period} dias
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PeriodFilter value={period} onChange={setPeriod} disabled={loading} />
            <button
              type="button"
              onClick={() => refresh()}
              disabled={loading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border-base/60 bg-bg-surface text-text-muted shadow-[var(--shadow-card-sm)] hover:bg-bg-surface-hover active:scale-95 disabled:opacity-50"
              aria-label="Recarregar"
              title="Recarregar"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </header>

        <HeroKpis
          reports={reports}
          activeSeries={series}
          onSelectSeries={setSeries}
          loading={loading}
        />

        <RevenueChart
          reports={reports}
          series={series}
          compare={compare}
          onToggleCompare={() => {
            const next = !compare;
            setCompare(next);
            if (next && !reports.previousSalesHistory) {
              void refresh(period);
            }
          }}
          period={period}
        />

        <WidgetGrid
          reports={reports}
          allTickets={allTickets}
          refunds={refunds}
          changeRequests={changeRequests}
          navigateTo={navigateTo}
          period={period}
        />
      </div>
    </div>
  );
}
