import { DollarSign, ShoppingCart, Wallet, Zap } from "lucide-react";
import type { AdminReports } from "../../../types";
import { Stat } from "../ui";
import { Sparkline } from "../charts";
import type { OverviewSeries } from "./useOverviewFilters";

type HeroKpisProps = {
  reports: AdminReports;
  activeSeries: OverviewSeries;
  onSelectSeries: (s: OverviewSeries) => void;
  loading?: boolean;
};

function fmtBRL(value: number) {
  return `R$ ${Number(value).toFixed(2).replace(".", ",")}`;
}

function calcDelta(current: number, previous: number | undefined): number | null {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function HeroKpis({
  reports,
  activeSeries,
  onSelectSeries,
  loading,
}: HeroKpisProps) {
  const revenueSpark = (reports.salesHistory ?? []).map((d) => d.revenue);
  const salesSpark = (reports.salesHistory ?? []).map((d) => d.count);
  const testsSpark = (reports.testsHistory ?? []).map((d) => d.count);

  const revenueDelta = calcDelta(reports.totalRevenue, reports.previousRevenue);
  const salesDelta = calcDelta(reports.totalSales, reports.previousSales);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label="Receita"
        value={fmtBRL(reports.totalRevenue)}
        icon={<Wallet size={14} />}
        variant="accent"
        delta={revenueDelta}
        deltaLabel="vs anterior"
        sparkline={
          revenueSpark.length > 1 ? (
            <Sparkline
              data={revenueSpark}
              color="var(--primary-500)"
              width={70}
              height={28}
            />
          ) : null
        }
        onClick={() => onSelectSeries("revenue")}
        active={activeSeries === "revenue"}
        loading={loading}
      />
      <Stat
        label="Ticket Médio"
        value={fmtBRL(reports.avgTicket ?? 0)}
        icon={<DollarSign size={14} />}
        variant="info"
        helpText={`${reports.totalSales} vendas no período`}
        loading={loading}
      />
      <Stat
        label="Vendas"
        value={reports.totalSales.toLocaleString("pt-BR")}
        icon={<ShoppingCart size={14} />}
        variant="success"
        delta={salesDelta}
        deltaLabel="vs anterior"
        sparkline={
          salesSpark.length > 1 ? (
            <Sparkline
              data={salesSpark}
              color="var(--success)"
              width={70}
              height={28}
            />
          ) : null
        }
        onClick={() => onSelectSeries("sales")}
        active={activeSeries === "sales"}
        loading={loading}
      />
      <Stat
        label="Conversão"
        value={`${reports.conversionRate}%`}
        icon={<Zap size={14} />}
        variant="warn"
        helpText={`${reports.totalTests} testes gratuitos`}
        sparkline={
          testsSpark.length > 1 ? (
            <Sparkline
              data={testsSpark}
              color="var(--warning)"
              width={70}
              height={28}
            />
          ) : null
        }
        onClick={() => onSelectSeries("tests")}
        active={activeSeries === "tests"}
        loading={loading}
      />
    </div>
  );
}
