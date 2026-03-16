import React from "react";
import { RefreshCw, TrendingUp, TrendingDown, DollarSign, ShoppingCart, Users, Zap, Award, BarChart2, Layers, Share2 } from "lucide-react";
import { fetchAdminReports } from "../../services/api";
import type { AdminReports as AdminReportsData } from "../../types";

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

function DualChart({ sales, tests }: { sales: AdminReportsData["salesHistory"]; tests: AdminReportsData["testsHistory"] }) {
  const W = 360, H = 100, PAD = 6;
  const display = sales.slice(-21);
  const testDisplay = tests.slice(-21);
  if (display.length < 2) return (
    <div className="flex items-center justify-center h-24 text-text-muted text-xs">Dados insuficientes</div>
  );

  const maxRev = Math.max(...display.map(d => d.revenue), 1);
  const maxTests = Math.max(...testDisplay.map(d => d.count), 1);

  const revPts = display.map((d, i) => {
    const x = PAD + (i / (display.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - d.revenue / maxRev) * (H - PAD * 2);
    return [x, y] as [number, number];
  });

  const testPts = testDisplay.map((d, i) => {
    const x = PAD + (i / (testDisplay.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - d.count / maxTests) * (H - PAD * 2);
    return [x, y] as [number, number];
  });

  const toLine = (pts: [number, number][]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

  const toArea = (pts: [number, number][], h: number) =>
    toLine(pts) + ` L${pts[pts.length - 1][0].toFixed(1)},${h} L${pts[0][0].toFixed(1)},${h} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" preserveAspectRatio="none">
      <defs>
        <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="gradTest" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {testPts.length > 1 && (
        <>
          <path d={toArea(testPts, H)} fill="url(#gradTest)" />
          <path d={toLine(testPts)} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4,2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      <path d={toArea(revPts, H)} fill="url(#gradRev)" />
      <path d={toLine(revPts)} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
      {Math.abs(pct).toFixed(0)}% vs período anterior
    </span>
  );
}

export function AdminReports({ reports, setReports, reportPeriod, setReportPeriod }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [activeChart, setActiveChart] = React.useState<"revenue" | "volume">("revenue");

  async function refresh(period: number) {
    setLoading(true);
    try { setReports(await fetchAdminReports(period)); } catch (err) { console.warn(err); } finally { setLoading(false); }
  }

  const totalRevenue = reports.totalRevenue || 0;
  const prevRevenue = reports.previousRevenue ?? 0;
  const prevSales = reports.previousSales ?? 0;
  const avgTicket = reports.avgTicket ?? 0;
  const topUsers = reports.topUsers ?? [];
  const byType = (reports.byType ?? []).sort((a, b) => b.revenue - a.revenue);

  const bestSaleDay = [...(reports.salesHistory || [])].sort((a, b) => b.revenue - a.revenue)[0];
  const bestTestDay = [...(reports.testsHistory || [])].sort((a, b) => b.count - a.count)[0];

  const salesWithRevenue = (reports.salesHistory || []).filter(s => s.count > 0);
  const testsWithCount = (reports.testsHistory || []).filter(t => t.count > 0);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0 px-5 pt-5 pb-3">
        <h2 className="font-bold text-text-base">Relatórios</h2>
        <div className="flex items-center gap-2">
          <select
            value={reportPeriod}
            onChange={e => { const p = Number(e.target.value); setReportPeriod(p); refresh(p); }}
            className="text-xs bg-bg-surface border border-border-base/50 rounded-xl px-3 py-2 outline-none font-bold cursor-pointer shadow-sm"
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={15}>Últimos 15 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>
          <button onClick={() => refresh(reportPeriod)} disabled={loading}
            className="p-2 rounded-xl border border-border-base/50 hover:bg-bg-surface-hover active:scale-95 transition-colors">
            <RefreshCw className={`w-4 h-4 text-text-muted ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-5">

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-primary-50 to-violet-50 border border-primary-100 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-primary-100 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-primary-600" />
              </div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-primary-500">Receita Total</p>
            </div>
            <p className="text-2xl font-bold text-primary-700 leading-none">{fmt(totalRevenue)}</p>
            {prevRevenue > 0 && (
              <div className="mt-1.5">
                <TrendBadge current={totalRevenue} previous={prevRevenue} />
              </div>
            )}
          </div>

          <div className="bg-gradient-to-br from-violet-50 to-fuchsia-50 border border-violet-100 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-violet-100 rounded-xl flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-violet-600" />
              </div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-violet-500">Ticket Médio</p>
            </div>
            <p className="text-2xl font-bold text-violet-700 leading-none">{fmt(avgTicket)}</p>
          </div>

          <div className="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-100 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center">
                <ShoppingCart className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-500">Vendas</p>
            </div>
            <p className="text-2xl font-bold text-emerald-700 leading-none">{reports.totalSales}</p>
            {prevSales > 0 && (
              <div className="mt-1.5">
                <TrendBadge current={reports.totalSales} previous={prevSales} />
              </div>
            )}
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center">
                <Zap className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-amber-500">Conversão</p>
            </div>
            <p className="text-2xl font-bold text-amber-700 leading-none">{reports.conversionRate}%</p>
            <p className="text-[10px] text-amber-500 mt-0.5">{reports.totalTests} testes no período</p>
          </div>
        </div>

        {/* Highlights */}
        {(bestSaleDay || bestTestDay) && (
          <div className="grid grid-cols-2 gap-3">
            {bestSaleDay && bestSaleDay.revenue > 0 && (
              <div className="bg-bg-surface border border-border-base/50 p-3 rounded-2xl shadow-sm flex items-center gap-2">
                <Award className="w-5 h-5 text-primary-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[9px] uppercase font-bold tracking-wider text-text-muted">Melhor dia (receita)</p>
                  <p className="text-xs font-bold text-text-base truncate">{bestSaleDay.date.split("-").reverse().join("/")}</p>
                  <p className="text-[11px] font-bold text-primary-600">{fmt(bestSaleDay.revenue)}</p>
                </div>
              </div>
            )}
            {bestTestDay && bestTestDay.count > 0 && (
              <div className="bg-bg-surface border border-border-base/50 p-3 rounded-2xl shadow-sm flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[9px] uppercase font-bold tracking-wider text-text-muted">Melhor dia (testes)</p>
                  <p className="text-xs font-bold text-text-base truncate">{bestTestDay.date.split("-").reverse().join("/")}</p>
                  <p className="text-[11px] font-bold text-blue-600">{bestTestDay.count} testes</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dual chart */}
        <div className="bg-bg-surface border border-border-base/50 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Tendência — {reportPeriod} dias</h3>
            <div className="flex items-center gap-3 text-[10px] text-text-muted font-medium">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-primary-500 inline-block rounded-full" /> Receita</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400 inline-block border-b-2 border-dashed border-blue-400" /> Testes</span>
            </div>
          </div>
          <DualChart sales={reports.salesHistory || []} tests={reports.testsHistory || []} />
        </div>

        {/* By type breakdown */}
        {byType.length > 0 && (
          <div className="bg-bg-surface border border-border-base/50 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 pt-4 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Receita por Tipo</h3>
            </div>
            <div className="divide-y divide-border-base/40">
              {byType.filter(t => t.revenue > 0).map(t => {
                const pct = totalRevenue > 0 ? (t.revenue / totalRevenue) * 100 : 0;
                return (
                  <div key={t.type} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-text-base">{TYPE_LABELS[t.type] || t.type}</p>
                        <p className="text-xs font-bold text-primary-600 ml-2">{fmt(t.revenue)}</p>
                      </div>
                      <div className="h-1.5 bg-bg-base rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] font-bold text-text-muted">{t.count}x</p>
                      <p className="text-[9px] text-text-muted">{pct.toFixed(0)}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top users */}
        {topUsers.length > 0 && (
          <div className="bg-bg-surface border border-border-base/50 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 pt-4 pb-2 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Top Clientes</h3>
            </div>
            <div className="divide-y divide-border-base/40">
              {topUsers.map((u, i) => {
                const maxRev = topUsers[0].revenue;
                const pct = (u.revenue / maxRev) * 100;
                const medals = ["🥇", "🥈", "🥉"];
                return (
                  <div key={u.username} className="px-4 py-3 flex items-center gap-3">
                    <span className="text-base shrink-0">{medals[i] ?? `${i + 1}.`}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-text-base truncate">{u.username}</p>
                        <p className="text-sm font-bold text-primary-600 ml-2 shrink-0">{fmt(u.revenue)}</p>
                      </div>
                      <div className="h-1.5 bg-bg-base rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-primary-500 to-violet-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className="text-[11px] text-text-muted shrink-0 font-medium">{u.sales}x</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top Plans */}
        {reports.topPlans && reports.topPlans.length > 0 && (
          <div className="bg-bg-surface border border-border-base/50 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 pt-4 pb-2 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Top Planos (snapshot atual)</h3>
            </div>
            <div className="divide-y divide-border-base/40">
              {reports.topPlans.map((p, i) => {
                const maxUsers = reports.topPlans![0].users;
                const pct = (p.users / maxUsers) * 100;
                const label = `${p.plan_months} ${p.plan_months === 1 ? "mês" : "meses"} · ${p.plan_devices} ${p.plan_devices === 1 ? "aparelho" : "aparelhos"}`;
                return (
                  <div key={i} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-text-base">{label}</p>
                        <p className="text-xs font-bold text-emerald-600 ml-2 shrink-0">
                          R$ {p.plan_price.toFixed(2).replace(".", ",")}
                        </p>
                      </div>
                      <div className="h-1.5 bg-bg-base rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0 min-w-[48px]">
                      <p className="text-xs font-bold text-text-base">{p.users} {p.users === 1 ? "usuário" : "usuários"}</p>
                      <p className="text-[9px] text-text-muted">{p.groups} {p.groups === 1 ? "grupo" : "grupos"}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top Referrers */}
        {reports.topReferrers && reports.topReferrers.length > 0 && (
          <div className="bg-bg-surface border border-border-base/50 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 pt-4 pb-2 flex items-center gap-2">
              <Share2 className="w-4 h-4 text-fuchsia-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Top Indicações</h3>
            </div>
            <div className="divide-y divide-border-base/40">
              {reports.topReferrers.map((r, i) => {
                const maxTotal = reports.topReferrers![0].total;
                const pct = (r.total / maxTotal) * 100;
                const convPct = r.total > 0 ? Math.round((r.converted / r.total) * 100) : 0;
                const medals = ["🥇", "🥈", "🥉"];
                return (
                  <div key={r.username} className="px-4 py-3 flex items-center gap-3">
                    <span className="text-base shrink-0">{medals[i] ?? `${i + 1}.`}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-text-base truncate">{r.username}</p>
                        <div className="flex items-center gap-2 ml-2 shrink-0">
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-lg">
                            {r.converted} conv.
                          </span>
                          <span className="text-[10px] font-bold text-fuchsia-600">{r.total} ind.</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-bg-base rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-fuchsia-400 to-violet-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[9px] text-text-muted shrink-0">{convPct}% conv.</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Sales table */}
        <div>
          <h3 className="font-bold text-text-base mb-3 text-xs uppercase tracking-wider">Histórico de Vendas Diárias</h3>
          {salesWithRevenue.length === 0 ? (
            <div className="bg-bg-surface/50 border border-border-base/50 p-6 rounded-2xl text-center">
              <p className="text-sm font-medium text-text-muted">Nenhuma venda no período.</p>
            </div>
          ) : (
            <div className="bg-bg-surface border border-border-base/50 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-bg-base/50 text-text-muted border-b border-border-base/50">
                  <tr>
                    <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider">Data</th>
                    <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-center">Vendas</th>
                    <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-right">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {[...salesWithRevenue].reverse().map(s => {
                    const highlight = s.revenue === (bestSaleDay?.revenue ?? 0) && s.revenue > 0;
                    return (
                      <tr key={s.date} className={`border-b border-border-base/40 last:border-0 hover:bg-bg-surface-hover transition-colors ${highlight ? "bg-primary-50/50" : ""}`}>
                        <td className="px-4 py-3 text-text-base font-medium text-xs">{s.date.split("-").reverse().join("/")}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs font-bold bg-bg-base px-2 py-0.5 rounded-lg">{s.count}</span>
                        </td>
                        <td className={`px-4 py-3 text-right font-bold text-xs ${highlight ? "text-primary-600" : "text-primary-500"}`}>
                          {fmt(s.revenue)}
                          {highlight && <span className="ml-1">⭐</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-bg-base/30 border-t border-border-base/50">
                  <tr>
                    <td className="px-4 py-2.5 text-[10px] font-bold uppercase text-text-muted">Total</td>
                    <td className="px-4 py-2.5 text-center text-xs font-bold text-text-base">{reports.totalSales}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-bold text-primary-600">{fmt(totalRevenue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Tests table */}
        {testsWithCount.length > 0 && (
          <div>
            <h3 className="font-bold text-text-base mb-3 text-xs uppercase tracking-wider">Histórico de Testes Diários</h3>
            <div className="bg-bg-surface border border-border-base/50 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-bg-base/50 text-text-muted border-b border-border-base/50">
                  <tr>
                    <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider">Data</th>
                    <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-right">Testes</th>
                  </tr>
                </thead>
                <tbody>
                  {[...testsWithCount].reverse().map(t => {
                    const highlight = t.count === (bestTestDay?.count ?? 0) && t.count > 0;
                    return (
                      <tr key={t.date} className={`border-b border-border-base/40 last:border-0 hover:bg-bg-surface-hover transition-colors ${highlight ? "bg-blue-50/50" : ""}`}>
                        <td className="px-4 py-3 text-text-base font-medium text-xs">{t.date.split("-").reverse().join("/")}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs font-bold ${highlight ? "text-blue-600" : "text-text-base"}`}>
                            {t.count}{highlight && " ⭐"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-bg-base/30 border-t border-border-base/50">
                  <tr>
                    <td className="px-4 py-2.5 text-[10px] font-bold uppercase text-text-muted">Total</td>
                    <td className="px-4 py-2.5 text-right text-xs font-bold text-blue-600">{reports.totalTests}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
