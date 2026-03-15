import React from "react";
import { TrendingUp, TrendingDown, Users, ShoppingCart, Zap, MessageSquare, RefreshCw, ClipboardList, ArrowRight, DollarSign, BarChart2 } from "lucide-react";
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

function AreaChart({ data, color = "#6366f1" }: { data: { date: string; revenue: number }[]; color?: string }) {
  const display = data.slice(-14);
  if (display.length < 2) return (
    <div className="flex items-center justify-center h-24 text-text-muted text-xs">Dados insuficientes</div>
  );

  const W = 320, H = 80, PAD = 4;
  const maxVal = Math.max(...display.map(d => d.revenue), 1);
  const pts = display.map((d, i) => {
    const x = PAD + (i / (display.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - d.revenue / maxVal) * (H - PAD * 2);
    return [x, y] as [number, number];
  });

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const areaPath = linePath + ` L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`;

  const gradId = `grad_${color.replace("#", "")}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map(([x, y], i) => (
        display[i].revenue > 0 && (
          <circle key={i} cx={x} cy={y} r="2.5" fill={color} />
        )
      ))}
    </svg>
  );
}

function Sparkline({ data, color = "#6366f1" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const W = 60, H = 24;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - (v / max) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-14 h-6">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrendBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${up ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
      {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {Math.abs(pct).toFixed(0)}%
    </span>
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
  const answeredTickets = allTickets.filter(t => t.status === "answered").length;
  const pendingRefunds = refunds.filter(r => r.status === "aguardando").slice(0, 3);
  const pendingChanges = changeRequests.filter(c => c.status === "aguardando").slice(0, 3);

  const fmt = (v: number) => `R$ ${Number(v).toFixed(2).replace(".", ",")}`;
  const prevRev = reports.previousRevenue ?? 0;
  const prevSales = reports.previousSales ?? 0;
  const avgTicket = reports.avgTicket ?? 0;
  const sparkRevenue = (reports.salesHistory || []).map(d => d.revenue);
  const sparkTests = (reports.testsHistory || []).map(d => d.count);

  const kpis = [
    {
      label: "Receita Total",
      value: fmt(reports.totalRevenue),
      icon: <TrendingUp className="w-5 h-5" />,
      color: "text-primary-600",
      bg: "bg-primary-50 border-primary-100",
      sparkColor: "#6366f1",
      sparkData: sparkRevenue,
      prev: prevRev,
      curr: reports.totalRevenue,
    },
    {
      label: "Ticket Médio",
      value: fmt(avgTicket),
      icon: <DollarSign className="w-5 h-5" />,
      color: "text-violet-600",
      bg: "bg-violet-50 border-violet-100",
      sparkColor: "#7c3aed",
      sparkData: sparkRevenue,
      prev: 0, curr: 0,
    },
    {
      label: "Vendas",
      value: String(reports.totalSales),
      icon: <ShoppingCart className="w-5 h-5" />,
      color: "text-green-600",
      bg: "bg-green-50 border-green-100",
      sparkColor: "#16a34a",
      sparkData: (reports.salesHistory || []).map(d => d.count),
      prev: prevSales,
      curr: reports.totalSales,
    },
    {
      label: "Conversão",
      value: `${reports.conversionRate}%`,
      icon: <Zap className="w-5 h-5" />,
      color: "text-amber-600",
      bg: "bg-amber-50 border-amber-100",
      sparkColor: "#d97706",
      sparkData: [],
      prev: 0, curr: 0,
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-text-base text-base">Visão Geral</h2>
        <div className="flex items-center gap-2">
          <select
            value={reportPeriod}
            onChange={e => { const p = Number(e.target.value); setReportPeriod(p); refreshReports(p); }}
            className="text-xs bg-bg-surface border border-border-base/50 rounded-xl px-3 py-2 outline-none font-bold cursor-pointer shadow-sm"
          >
            <option value={7}>7 dias</option>
            <option value={15}>15 dias</option>
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
          </select>
          <button onClick={() => refreshReports(reportPeriod)} disabled={loading}
            className="p-2 rounded-xl border border-border-base/50 hover:bg-bg-surface-hover transition-colors active:scale-95">
            <RefreshCw className={`w-4 h-4 text-text-muted ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        {kpis.map(k => (
          <div key={k.label} className={`border rounded-2xl p-4 flex flex-col gap-2 shadow-sm ${k.bg}`}>
            <div className="flex items-start justify-between">
              <div className={k.color}>{k.icon}</div>
              <div className="flex items-center gap-1">
                {k.prev > 0 && <TrendBadge current={k.curr} previous={k.prev} />}
                {k.sparkData.length > 1 && <Sparkline data={k.sparkData} color={k.sparkColor} />}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-text-muted">{k.label}</p>
              <p className={`text-xl font-bold leading-tight ${k.color}`}>{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Revenue area chart */}
      <div className="bg-bg-surface border border-border-base/50 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Receita — {reportPeriod} dias</h3>
          <div className="flex items-center gap-1 text-[10px] text-text-muted font-medium">
            <span className="w-2 h-2 rounded-full bg-primary-500 inline-block" />
            Receita diária
          </div>
        </div>
        <AreaChart data={reports.salesHistory || []} />
        {reports.previousRevenue !== undefined && (
          <p className="text-[10px] text-text-muted mt-2 text-right">
            Período anterior: <span className="font-bold">{fmt(reports.previousRevenue)}</span>
            {" "}
            {reports.previousRevenue > 0 && (
              <TrendBadge current={reports.totalRevenue} previous={reports.previousRevenue} />
            )}
          </p>
        )}
      </div>

      {/* Tests trend */}
      {sparkTests.some(v => v > 0) && (
        <div className="bg-bg-surface border border-border-base/50 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Testes Gratuitos — {reportPeriod} dias</h3>
            <span className="text-sm font-bold text-blue-600">{reports.totalTests} testes</span>
          </div>
          <div className="flex items-end gap-1 h-12 w-full mt-2">
            {(reports.testsHistory || []).slice(-14).map((d) => {
              const maxT = Math.max(...(reports.testsHistory || []).map(x => x.count), 1);
              const hPct = (d.count / maxT) * 100;
              return (
                <div key={d.date} className="flex-1 flex items-end h-full" title={`${d.date.slice(5).replace("-", "/")}: ${d.count}`}>
                  <div className="w-full rounded-t-sm bg-blue-400 transition-all" style={{ height: `${Math.max(hPct, d.count > 0 ? 8 : 0)}%` }} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick status */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-center shadow-sm">
          <p className="text-2xl font-bold text-amber-600">{openTickets.length + (allTickets.filter(t => t.status === "open").length - openTickets.length)}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mt-0.5">Tickets</p>
          {answeredTickets > 0 && <p className="text-[9px] text-amber-400">{answeredTickets} respondido(s)</p>}
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 text-center shadow-sm">
          <p className="text-2xl font-bold text-blue-600">{pendingRefunds.length + refunds.filter(r => r.status === "aguardando").length - pendingRefunds.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-500 mt-0.5">Reembolsos</p>
        </div>
        <div className="bg-purple-50 border border-purple-100 rounded-2xl p-3 text-center shadow-sm">
          <p className="text-2xl font-bold text-purple-600">{changeRequests.filter(c => c.status === "aguardando").length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-purple-500 mt-0.5">Alterações</p>
        </div>
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
            <button onClick={() => navigateTo("tickets")} className="text-xs text-primary-600 hover:text-primary-700 font-bold flex items-center gap-1">
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
        {refunds.filter(r => r.status === "aguardando").length > 0 && (
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
              {refunds.filter(r => r.status === "aguardando").slice(0, 3).map(r => (
                <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-border-base/30 last:border-0">
                  <p className="text-sm font-medium text-text-base">{r.username}</p>
                  <span className="text-[10px] uppercase font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-lg">Aguardando</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending changes */}
        {changeRequests.filter(c => c.status === "aguardando").length > 0 && (
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
              {changeRequests.filter(c => c.status === "aguardando").slice(0, 3).map(c => (
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

        {/* Top users */}
        {reports.topUsers && reports.topUsers.length > 0 && (
          <div className="bg-bg-surface border border-border-base/50 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 className="w-4 h-4 text-primary-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Top clientes — {reportPeriod}d</h3>
            </div>
            <div className="space-y-2">
              {reports.topUsers.map((u, i) => {
                const maxRev = reports.topUsers![0].revenue;
                const pct = (u.revenue / maxRev) * 100;
                return (
                  <div key={u.username} className="flex items-center gap-3">
                    <span className="text-[11px] font-bold text-text-muted w-4 text-center">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <p className="text-xs font-semibold text-text-base truncate">{u.username}</p>
                        <p className="text-xs font-bold text-primary-600 ml-2 shrink-0">{`R$ ${u.revenue.toFixed(2).replace(".", ",")}`}</p>
                      </div>
                      <div className="h-1.5 bg-bg-base rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className="text-[10px] text-text-muted shrink-0">{u.sales}x</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
