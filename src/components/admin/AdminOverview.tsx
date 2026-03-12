import React from "react";
import { TrendingUp, Users, ShoppingCart, Zap, MessageSquare, RefreshCw, ClipboardList, ArrowRight } from "lucide-react";
import type { AdminTab, AdminReports } from "../../types";
import { fetchAdminReports } from "../../services/api";

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

function SalesBarChart({ data, period }: { data: AdminReports["salesHistory"]; period: number }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-28 text-text-muted text-sm">
        Sem dados no período
      </div>
    );
  }

  const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
  const displayData = data.slice(-Math.min(period, 14));

  return (
    <div className="flex items-end gap-1 h-28 w-full">
      {displayData.map((d, i) => {
        const heightPct = (d.revenue / maxRevenue) * 100;
        const label = d.date.slice(5).replace("-", "/");
        return (
          <div key={d.date} className="flex flex-col items-center gap-1 flex-1 min-w-0" title={`${label}: R$ ${d.revenue.toFixed(2)}`}>
            <div className="w-full rounded-t-md bg-primary-200 relative" style={{ height: "80px" }}>
              <div
                className="absolute bottom-0 w-full rounded-t-md bg-primary-600 transition-all"
                style={{ height: `${Math.max(heightPct, d.revenue > 0 ? 4 : 0)}%` }}
              />
            </div>
            {displayData.length <= 10 && (
              <span className="text-[9px] text-text-muted font-medium truncate w-full text-center">{label}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AdminOverview({ reports, setReports, reportPeriod, setReportPeriod, allTickets, refunds, changeRequests, navigateTo }: Props) {
  const [loading, setLoading] = React.useState(false);

  async function refreshReports(period: number) {
    setLoading(true);
    try {
      const data = await fetchAdminReports(period);
      setReports(data);
    } catch (err) {
      console.warn("Failed to refresh reports:", err);
    } finally {
      setLoading(false);
    }
  }

  const openTickets = allTickets.filter(t => t.status === "open").slice(0, 5);
  const pendingRefunds = refunds.filter(r => r.status === "aguardando").slice(0, 3);
  const pendingChanges = changeRequests.filter(c => c.status === "aguardando").slice(0, 3);

  const kpis = [
    {
      label: "Receita Total",
      value: `R$ ${Number(reports.totalRevenue).toFixed(2).replace(".", ",")}`,
      icon: <TrendingUp className="w-5 h-5" />,
      color: "text-primary-600",
      bg: "bg-primary-50 border-primary-100",
    },
    {
      label: "Vendas",
      value: String(reports.totalSales),
      icon: <ShoppingCart className="w-5 h-5" />,
      color: "text-green-600",
      bg: "bg-green-50 border-green-100",
    },
    {
      label: "Testes",
      value: String(reports.totalTests),
      icon: <Users className="w-5 h-5" />,
      color: "text-blue-600",
      bg: "bg-blue-50 border-blue-100",
    },
    {
      label: "Conversão",
      value: `${reports.conversionRate}%`,
      icon: <Zap className="w-5 h-5" />,
      color: "text-amber-600",
      bg: "bg-amber-50 border-amber-100",
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      {/* Period + refresh */}
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-text-base text-base">Visão Geral</h2>
        <div className="flex items-center gap-2">
          <select
            value={reportPeriod}
            onChange={e => {
              const p = Number(e.target.value);
              setReportPeriod(p);
              refreshReports(p);
            }}
            className="text-xs bg-bg-surface border border-border-base/50 rounded-xl px-3 py-2 outline-none font-bold cursor-pointer shadow-sm"
          >
            <option value={7}>7 dias</option>
            <option value={15}>15 dias</option>
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
          </select>
          <button
            onClick={() => refreshReports(reportPeriod)}
            disabled={loading}
            className="p-2 rounded-xl border border-border-base/50 hover:bg-bg-surface-hover transition-colors active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 text-text-muted ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        {kpis.map(k => (
          <div key={k.label} className={`border rounded-2xl p-4 flex flex-col gap-2 shadow-sm ${k.bg}`}>
            <div className={`${k.color}`}>{k.icon}</div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-text-muted">{k.label}</p>
              <p className={`text-xl font-bold leading-tight ${k.color}`}>{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Sales chart */}
      <div className="bg-bg-surface border border-border-base/50 rounded-2xl p-4 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">Vendas ({reportPeriod}d)</h3>
        <SalesBarChart data={reports.salesHistory} period={reportPeriod} />
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 gap-4">
        {/* Open tickets */}
        <div className="bg-bg-surface border border-border-base/50 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Tickets abertos</h3>
            </div>
            <button
              onClick={() => navigateTo("tickets")}
              className="text-xs text-primary-600 hover:text-primary-700 font-bold flex items-center gap-1"
            >
              Ver todos <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {openTickets.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-2">Nenhum ticket aberto</p>
          ) : (
            <div className="space-y-2">
              {openTickets.map(t => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-border-base/30 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-text-base truncate max-w-[160px]">{t.subject}</p>
                    <p className="text-[11px] text-text-muted">{t.username} · {t.category}</p>
                  </div>
                  <span className="text-[10px] uppercase font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-lg flex-shrink-0">Aberto</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending refunds */}
        {pendingRefunds.length > 0 && (
          <div className="bg-bg-surface border border-border-base/50 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-blue-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Reembolsos pendentes</h3>
              </div>
              <button onClick={() => navigateTo("refunds")} className="text-xs text-primary-600 hover:text-primary-700 font-bold flex items-center gap-1">
                Ver todos <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2">
              {pendingRefunds.map(r => (
                <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-border-base/30 last:border-0">
                  <p className="text-sm font-medium text-text-base">{r.username}</p>
                  <span className="text-[10px] uppercase font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-lg">Aguardando</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending changes */}
        {pendingChanges.length > 0 && (
          <div className="bg-bg-surface border border-border-base/50 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-purple-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Alterações pendentes</h3>
              </div>
              <button onClick={() => navigateTo("change_requests")} className="text-xs text-primary-600 hover:text-primary-700 font-bold flex items-center gap-1">
                Ver todos <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2">
              {pendingChanges.map(c => (
                <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-border-base/30 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-text-base">{c.username}</p>
                    <p className="text-[11px] text-text-muted">{c.type === "date" ? "Vencimento" : c.type === "username" ? "Usuário" : c.type === "uuid" ? "UUID" : "Senha"}</p>
                  </div>
                  <span className="text-[10px] uppercase font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-lg">Aguardando</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
