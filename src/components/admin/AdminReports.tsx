import { useMemo, useState } from "react";
import {
  Award,
  BarChart2,
  DollarSign,
  Layers,
  RefreshCw,
  Share2,
  ShoppingCart,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { fetchAdminReports } from "../../services/api";
import type { AdminReports as AdminReportsData } from "../../types";
import { Card, Chip, Empty, SectionHeader, Stat } from "./ui";
import { AreaChart, BarChart, Donut, type DonutSlice } from "./charts";
import { PeriodFilter } from "./overview/PeriodFilter";

interface Props {
  reports: AdminReportsData;
  setReports: (r: AdminReportsData) => void;
  reportPeriod: number;
  setReportPeriod: (p: number) => void;
}

const fmt = (v: number) => `R$ ${Number(v).toFixed(2).replace(".", ",")}`;

const TYPE_LABELS: Record<string, string> = {
  renewal: "Renovação",
  new_device: "Novo aparelho",
  reseller_hire: "Contratação revenda",
  reseller_renewal: "Renovação revenda",
  reseller_logins_increase: "Aumento de logins",
  reseller_adjustment: "Ajuste admin",
  unknown: "Outros",
};

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function tooltipDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return `${WEEKDAYS[d.getDay()]} · ${parts[2]}/${parts[1]}`;
}

function deltaPct(curr: number, prev: number): number | null {
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
}

type TabId = "revenue" | "tests" | "types";

const TABS: { id: TabId; label: string }[] = [
  { id: "revenue", label: "Receita" },
  { id: "tests", label: "Testes" },
  { id: "types", label: "Tipos" },
];

const DONUT_COLORS = [
  "var(--primary-500)",
  "var(--info)",
  "var(--success)",
  "var(--warning)",
  "var(--danger)",
  "var(--primary-400)",
  "var(--primary-600)",
];

export function AdminReports({ reports, setReports, reportPeriod, setReportPeriod }: Props) {
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<TabId>("revenue");

  async function refresh(period: number) {
    setLoading(true);
    try {
      setReports(await fetchAdminReports(period));
    } catch (err) {
      console.warn(err);
    } finally {
      setLoading(false);
    }
  }

  function onPeriodChange(p: number) {
    setReportPeriod(p);
    refresh(p);
  }

  const totalRevenue = reports.totalRevenue || 0;
  const prevRevenue = reports.previousRevenue ?? 0;
  const prevSales = reports.previousSales ?? 0;
  const prevTests = reports.previousTests ?? 0;
  const avgTicket = reports.avgTicket ?? 0;
  const topUsers = reports.topUsers ?? [];
  const byType = useMemo(
    () => (reports.byType ?? []).slice().sort((a, b) => b.revenue - a.revenue),
    [reports.byType],
  );

  const salesHistory = reports.salesHistory || [];
  const testsHistory = reports.testsHistory || [];
  const prevSalesHistory = reports.previousSalesHistory || [];
  const prevTestsHistory = reports.previousTestsHistory || [];

  const labels = salesHistory.map((s) => s.date.split("-").reverse().slice(0, 2).join("/"));
  const tooltipLabels = salesHistory.map((s) => tooltipDate(s.date));

  const bestSaleDay = useMemo(
    () => salesHistory.slice().sort((a, b) => b.revenue - a.revenue)[0],
    [salesHistory],
  );
  const bestTestDay = useMemo(
    () => testsHistory.slice().sort((a, b) => b.count - a.count)[0],
    [testsHistory],
  );

  const activeDays = salesHistory.filter((s) => s.count > 0).length;
  const avgDailyRevenue = salesHistory.length > 0 ? totalRevenue / salesHistory.length : 0;

  const donutSlices: DonutSlice[] = byType
    .filter((t) => t.revenue > 0)
    .slice(0, 7)
    .map((t, i) => ({
      id: t.type,
      label: TYPE_LABELS[t.type] || t.type,
      value: t.revenue,
      color: DONUT_COLORS[i % DONUT_COLORS.length],
    }));

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
        <SectionHeader
          title="Relatórios"
          subtitle={`Últimos ${reportPeriod} dias`}
          actions={
            <div className="flex items-center gap-2">
              <PeriodFilter
                value={reportPeriod}
                onChange={onPeriodChange}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => refresh(reportPeriod)}
                disabled={loading}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border-base/60 bg-bg-surface text-text-muted shadow-[var(--shadow-card-sm)] hover:bg-bg-surface-hover disabled:opacity-50"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Receita total"
            value={fmt(totalRevenue)}
            icon={<TrendingUp size={14} />}
            variant="accent"
            delta={deltaPct(totalRevenue, prevRevenue)}
            deltaLabel="vs período anterior"
          />
          <Stat
            label="Vendas"
            value={String(reports.totalSales)}
            icon={<ShoppingCart size={14} />}
            variant="success"
            delta={deltaPct(reports.totalSales, prevSales)}
            deltaLabel={`${activeDays} dias ativos`}
          />
          <Stat
            label="Ticket médio"
            value={fmt(avgTicket)}
            icon={<DollarSign size={14} />}
            variant="info"
            helpText={`Média/dia: ${fmt(avgDailyRevenue)}`}
          />
          <Stat
            label="Conversão"
            value={`${reports.conversionRate}%`}
            icon={<Zap size={14} />}
            variant="warn"
            delta={deltaPct(reports.totalTests, prevTests)}
            deltaLabel={`${reports.totalTests} testes`}
          />
        </div>

        <div className="flex items-center gap-1 rounded-2xl border border-border-base/60 bg-bg-surface p-1 shadow-[var(--shadow-card-sm)]">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex-1 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                  active
                    ? "bg-primary-600 text-white shadow-sm"
                    : "text-text-muted hover:text-text-base"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === "revenue" && (
          <RevenueTab
            labels={labels}
            tooltipLabels={tooltipLabels}
            current={salesHistory.map((s) => s.revenue)}
            previous={prevSalesHistory.map((s) => s.revenue)}
            totalRevenue={totalRevenue}
            bestSaleDay={bestSaleDay}
          />
        )}

        {tab === "tests" && (
          <TestsTab
            labels={labels}
            tooltipLabels={tooltipLabels}
            current={testsHistory.map((t) => t.count)}
            previous={prevTestsHistory.map((t) => t.count)}
            totalTests={reports.totalTests}
            bestTestDay={bestTestDay}
          />
        )}

        {tab === "types" && (
          <TypesTab
            byType={byType}
            totalRevenue={totalRevenue}
            slices={donutSlices}
          />
        )}

        {topUsers.length > 0 && (
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-center gap-2 px-4 pb-2 pt-4">
              <BarChart2 className="h-4 w-4 text-primary-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Top Clientes
              </h3>
            </div>
            <div className="divide-y divide-border-base/40">
              {topUsers.map((u, i) => {
                const maxRev = topUsers[0].revenue || 1;
                const pct = (u.revenue / maxRev) * 100;
                return (
                  <div key={u.username} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-5 shrink-0 text-center text-xs font-bold text-text-muted">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="truncate text-sm font-semibold text-text-base">
                          {u.username}
                        </p>
                        <p className="ml-2 shrink-0 text-sm font-bold text-primary-600">
                          {fmt(u.revenue)}
                        </p>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-bg-base">
                        <div
                          className="h-full rounded-full bg-primary-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-text-muted">
                      {u.sales}x
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {reports.topPlans && reports.topPlans.length > 0 && (
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-center gap-2 px-4 pb-2 pt-4">
              <Layers className="h-4 w-4 text-[var(--success)]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Top Planos (snapshot atual)
              </h3>
            </div>
            <div className="divide-y divide-border-base/40">
              {reports.topPlans.map((p, i) => {
                const maxUsers = reports.topPlans![0].users || 1;
                const pct = (p.users / maxUsers) * 100;
                const label = `${p.plan_months} ${p.plan_months === 1 ? "mês" : "meses"} · ${p.plan_devices} ${p.plan_devices === 1 ? "aparelho" : "aparelhos"}`;
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-xs font-semibold text-text-base">{label}</p>
                        <p className="ml-2 shrink-0 text-xs font-bold text-[var(--success)]">
                          R$ {p.plan_price.toFixed(2).replace(".", ",")}
                        </p>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-bg-base">
                        <div
                          className="h-full rounded-full bg-[var(--success)]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <div className="min-w-[56px] shrink-0 text-right">
                      <p className="text-xs font-bold text-text-base">
                        {p.users} {p.users === 1 ? "usuário" : "usuários"}
                      </p>
                      <p className="text-[9px] text-text-muted">
                        {p.groups} {p.groups === 1 ? "grupo" : "grupos"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {reports.topReferrers && reports.topReferrers.length > 0 && (
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-center gap-2 px-4 pb-2 pt-4">
              <Share2 className="h-4 w-4 text-[var(--info)]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Top Indicações
              </h3>
            </div>
            <div className="divide-y divide-border-base/40">
              {reports.topReferrers.map((r, i) => {
                const maxTotal = reports.topReferrers![0].total || 1;
                const pct = (r.total / maxTotal) * 100;
                const convPct = r.total > 0 ? Math.round((r.converted / r.total) * 100) : 0;
                return (
                  <div key={r.username} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-5 shrink-0 text-center text-xs font-bold text-text-muted">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="truncate text-sm font-semibold text-text-base">
                          {r.username}
                        </p>
                        <div className="ml-2 flex shrink-0 items-center gap-2">
                          <Chip tone="success" size="sm">
                            {r.converted} conv.
                          </Chip>
                          <span className="text-[10px] font-bold text-[var(--info)]">
                            {r.total} ind.
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-base">
                          <div
                            className="h-full rounded-full bg-[var(--info)]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-[9px] text-text-muted">
                          {convPct}% conv.
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

interface RevenueTabProps {
  labels: string[];
  tooltipLabels: string[];
  current: number[];
  previous: number[];
  totalRevenue: number;
  bestSaleDay: { date: string; revenue: number; count: number } | undefined;
}

function RevenueTab({
  labels,
  tooltipLabels,
  current,
  previous,
  totalRevenue,
  bestSaleDay,
}: RevenueTabProps) {
  const hasPrev = previous.some((v) => v > 0);
  const series = [
    { id: "current", label: "Atual", data: current, color: "var(--primary-500)" },
    ...(hasPrev
      ? [
          {
            id: "previous",
            label: "Anterior",
            data: previous,
            color: "var(--text-muted)",
            dashed: true,
          },
        ]
      : []),
  ];

  return (
    <>
      <Card padding="md">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
            Receita diária
          </h3>
          <div className="flex items-center gap-3 text-[10px] font-medium text-text-muted">
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-3 rounded-full bg-primary-500" />
              Atual
            </span>
            {hasPrev && (
              <span className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-3 rounded-full border-b border-dashed border-[var(--text-muted)]" />
                Anterior
              </span>
            )}
          </div>
        </div>
        {current.length === 0 ? (
          <Empty title="Sem dados no período" />
        ) : (
          <AreaChart
            series={series}
            labels={labels}
            tooltipLabels={tooltipLabels}
            height={240}
            formatY={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))}
            formatTooltip={(v) => fmt(v)}
          />
        )}
      </Card>

      {bestSaleDay && bestSaleDay.revenue > 0 && (
        <Card padding="md" className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/15 text-primary-500">
            <Award size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Melhor dia (receita)
            </p>
            <p className="text-sm font-bold text-text-base">
              {tooltipDate(bestSaleDay.date)} — {fmt(bestSaleDay.revenue)}
              <span className="ml-2 text-[11px] font-medium text-text-muted">
                {bestSaleDay.count} {bestSaleDay.count === 1 ? "venda" : "vendas"}
              </span>
            </p>
          </div>
        </Card>
      )}

      <Card padding="none" className="overflow-hidden">
        <div className="px-4 pb-2 pt-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
            Histórico diário
          </h3>
        </div>
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-border-base/50 bg-bg-surface text-text-muted">
              <tr>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider">
                  Data
                </th>
                <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider">
                  Vendas
                </th>
                <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider">
                  Receita
                </th>
              </tr>
            </thead>
            <tbody>
              {labels
                .map((label, i) => ({ label, i }))
                .slice()
                .reverse()
                .map(({ label, i }) => {
                  const rev = current[i] ?? 0;
                  if (rev === 0) return null;
                  const highlight = bestSaleDay && rev === bestSaleDay.revenue;
                  return (
                    <tr
                      key={i}
                      className={`border-b border-border-base/40 last:border-0 hover:bg-bg-surface-hover ${
                        highlight ? "bg-primary-500/5" : ""
                      }`}
                    >
                      <td className="px-4 py-2 text-xs font-medium text-text-base">
                        {tooltipLabels[i] ?? label}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className="rounded-md bg-bg-base px-2 py-0.5 text-xs font-bold">
                          —
                        </span>
                      </td>
                      <td
                        className={`px-4 py-2 text-right text-xs font-bold ${
                          highlight ? "text-primary-600" : "text-primary-500"
                        }`}
                      >
                        {fmt(rev)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            <tfoot className="border-t border-border-base/50 bg-bg-base/30">
              <tr>
                <td className="px-4 py-2 text-[10px] font-bold uppercase text-text-muted">
                  Total
                </td>
                <td className="px-4 py-2" />
                <td className="px-4 py-2 text-right text-xs font-bold text-primary-600">
                  {fmt(totalRevenue)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </>
  );
}

interface TestsTabProps {
  labels: string[];
  tooltipLabels: string[];
  current: number[];
  previous: number[];
  totalTests: number;
  bestTestDay: { date: string; count: number } | undefined;
}

function TestsTab({
  labels,
  tooltipLabels,
  current,
  previous,
  totalTests,
  bestTestDay,
}: TestsTabProps) {
  const hasPrev = previous.some((v) => v > 0);
  const series = [
    { id: "current", label: "Atual", data: current, color: "var(--info)" },
    ...(hasPrev
      ? [
          {
            id: "previous",
            label: "Anterior",
            data: previous,
            color: "var(--text-muted)",
            dashed: true,
          },
        ]
      : []),
  ];

  return (
    <>
      <Card padding="md">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
            Testes diários
          </h3>
          <div className="flex items-center gap-3 text-[10px] font-medium text-text-muted">
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-3 rounded-full bg-[var(--info)]" />
              Atual
            </span>
            {hasPrev && (
              <span className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-3 rounded-full border-b border-dashed border-[var(--text-muted)]" />
                Anterior
              </span>
            )}
          </div>
        </div>
        {current.length === 0 ? (
          <Empty title="Sem dados no período" />
        ) : (
          <AreaChart
            series={series}
            labels={labels}
            tooltipLabels={tooltipLabels}
            height={240}
          />
        )}
      </Card>

      {bestTestDay && bestTestDay.count > 0 && (
        <Card padding="md" className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--info-soft)] text-[var(--info)]">
            <Users size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Melhor dia (testes)
            </p>
            <p className="text-sm font-bold text-text-base">
              {tooltipDate(bestTestDay.date)} — {bestTestDay.count}{" "}
              {bestTestDay.count === 1 ? "teste" : "testes"}
            </p>
          </div>
        </Card>
      )}

      <Card padding="none" className="overflow-hidden">
        <div className="px-4 pb-2 pt-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
            Histórico diário
          </h3>
        </div>
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-border-base/50 bg-bg-surface text-text-muted">
              <tr>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider">
                  Data
                </th>
                <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider">
                  Testes
                </th>
              </tr>
            </thead>
            <tbody>
              {labels
                .map((label, i) => ({ label, i }))
                .slice()
                .reverse()
                .map(({ label, i }) => {
                  const count = current[i] ?? 0;
                  if (count === 0) return null;
                  const highlight = bestTestDay && count === bestTestDay.count;
                  return (
                    <tr
                      key={i}
                      className={`border-b border-border-base/40 last:border-0 hover:bg-bg-surface-hover ${
                        highlight ? "bg-[var(--info-soft)]" : ""
                      }`}
                    >
                      <td className="px-4 py-2 text-xs font-medium text-text-base">
                        {tooltipLabels[i] ?? label}
                      </td>
                      <td
                        className={`px-4 py-2 text-right text-xs font-bold ${
                          highlight ? "text-[var(--info)]" : "text-text-base"
                        }`}
                      >
                        {count}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            <tfoot className="border-t border-border-base/50 bg-bg-base/30">
              <tr>
                <td className="px-4 py-2 text-[10px] font-bold uppercase text-text-muted">
                  Total
                </td>
                <td className="px-4 py-2 text-right text-xs font-bold text-[var(--info)]">
                  {totalTests}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </>
  );
}

interface TypesTabProps {
  byType: AdminReportsData["byType"];
  totalRevenue: number;
  slices: DonutSlice[];
}

function TypesTab({ byType, totalRevenue, slices }: TypesTabProps) {
  const bars = byType
    .filter((t) => t.revenue > 0)
    .map((t) => ({
      label: TYPE_LABELS[t.type] || t.type,
      value: t.revenue,
    }));

  if (bars.length === 0) {
    return (
      <Card padding="md">
        <Empty title="Sem receita por tipo no período" />
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card padding="md">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-text-muted">
          Distribuição
        </h3>
        <Donut
          data={slices}
          size={200}
          thickness={28}
          formatValue={(v) => fmt(v)}
          centerLabel={
            <div>
              <p className="text-lg font-bold text-text-base">{fmt(totalRevenue)}</p>
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Receita</p>
            </div>
          }
        />
      </Card>

      <Card padding="md">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-text-muted">
          Receita por tipo
        </h3>
        <BarChart
          series={[
            {
              id: "revenue",
              label: "Receita",
              data: bars.map((b) => b.value),
              color: "var(--primary-500)",
            },
          ]}
          labels={bars.map((b) => b.label)}
          height={280}
          formatY={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))}
          formatTooltip={(v) => fmt(v)}
        />
      </Card>

      <Card padding="none" className="overflow-hidden lg:col-span-2">
        <div className="px-4 pb-2 pt-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
            Detalhamento
          </h3>
        </div>
        <div className="divide-y divide-border-base/40">
          {byType
            .filter((t) => t.revenue > 0)
            .map((t) => {
              const pct = totalRevenue > 0 ? (t.revenue / totalRevenue) * 100 : 0;
              return (
                <div key={t.type} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-xs font-semibold text-text-base">
                        {TYPE_LABELS[t.type] || t.type}
                      </p>
                      <p className="ml-2 text-xs font-bold text-primary-600">
                        {fmt(t.revenue)}
                      </p>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-bg-base">
                      <div
                        className="h-full rounded-full bg-primary-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] font-bold text-text-muted">{t.count}x</p>
                    <p className="text-[9px] text-text-muted">{pct.toFixed(0)}%</p>
                  </div>
                </div>
              );
            })}
        </div>
      </Card>
    </div>
  );
}
