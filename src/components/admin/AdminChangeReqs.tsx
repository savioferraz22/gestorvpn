import React, { useState } from "react";
import { RefreshCw, Eye, EyeOff, KeyRound, Clock } from "lucide-react";
import { fetchAdminChangeRequests, approveChangeRequest, rejectChangeRequest, fetchAdminUserDetails } from "../../services/api";

interface Props {
  changeRequests: any[];
  setChangeRequests: (c: any[]) => void;
}

function formatDate(dateString: string) {
  if (!dateString) return "N/A";
  let s = dateString;
  if (s.includes(" ") && !s.includes("T")) { s = s.replace(" ", "T"); if (!s.endsWith("Z")) s += "Z"; }
  const d = new Date(s);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function typeLabel(type: string) {
  const map: Record<string, string> = { date: "Vencimento", username: "Usuário", uuid: "UUID", password: "Senha", date_correction: "📅 Correção de Vencimento" };
  return map[type] || type;
}

export function AdminChangeReqs({ changeRequests, setChangeRequests }: Props) {
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [confirmReject, setConfirmReject] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [pendingApprove, setPendingApprove] = useState<{ id: string; type: string; requestedValue: string } | null>(null);
  const [approvedValue, setApprovedValue] = useState("");
  const [userDetails, setUserDetails] = useState<Record<string, any>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});
  const [showPass, setShowPass] = useState<Record<string, boolean>>({});

  async function loadUserDetails(username: string) {
    if (userDetails[username] || loadingDetails[username]) return;
    setLoadingDetails(p => ({ ...p, [username]: true }));
    try {
      const data = await fetchAdminUserDetails(username);
      setUserDetails(p => ({ ...p, [username]: data }));
    } catch { /* silently fail */ } finally {
      setLoadingDetails(p => ({ ...p, [username]: false }));
    }
  }

  function daysLeft(expira: string) {
    if (!expira) return null;
    const exp = new Date(expira);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    exp.setHours(0, 0, 0, 0);
    return Math.round((exp.getTime() - today.getTime()) / 86400000);
  }

  async function refresh() {
    setLoading(true);
    try { setChangeRequests(await fetchAdminChangeRequests()); } catch (err) { console.warn(err); } finally { setLoading(false); }
  }

  async function handleApprove() {
    if (!pendingApprove) return;
    try {
      await approveChangeRequest(pendingApprove.id, approvedValue || pendingApprove.requestedValue);
      setPendingApprove(null);
      setApprovedValue("");
      await refresh();
    } catch (err) { console.warn(err); }
  }

  async function handleReject(id: string) {
    try {
      await rejectChangeRequest(id, rejectReason.trim() || undefined);
      setConfirmReject(null);
      setRejectReason("");
      await refresh();
    } catch (err) { console.warn(err); }
  }

  function startApprove(r: any) {
    setPendingApprove({ id: r.id, type: r.type, requestedValue: r.requested_value });
    setApprovedValue(r.requested_value);
  }

  const filtered = changeRequests.filter(r => filterType === "all" || r.type === filterType);
  const pending = changeRequests.filter(r => r.status === "aguardando");

  return (
    <div className="flex flex-col flex-1 overflow-hidden p-5 space-y-4">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="font-bold text-text-base">Alterações ({changeRequests.length})</h2>
          {pending.length > 0 && (
            <p className="text-xs text-amber-600 font-medium">{pending.length} aguardando aprovação</p>
          )}
        </div>
        <button onClick={refresh} disabled={loading} className="p-2 rounded-xl border border-border-base/50 hover:bg-bg-surface-hover transition-colors active:scale-95">
          <RefreshCw className={`w-4 h-4 text-text-muted ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="shrink-0">
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="text-sm bg-bg-surface border border-border-base/50 rounded-xl px-3 py-2.5 outline-none font-bold cursor-pointer"
        >
          <option value="all">Todos os tipos</option>
          <option value="date_correction">Correção de Vencimento</option>
          <option value="date">Vencimento</option>
          <option value="username">Usuário</option>
          <option value="uuid">UUID</option>
          <option value="password">Senha</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {filtered.length === 0 ? (
          <div className="bg-bg-surface/50 border border-border-base/50 p-6 rounded-2xl text-center">
            <p className="text-sm font-medium text-text-muted">Nenhuma solicitação.</p>
          </div>
        ) : (
          filtered.map((r: any) => {
            const ud = userDetails[r.username];
            const u = ud?.user;
            const pass = u?.senha || u?.pass || u?.password;
            const days = u ? daysLeft(u.expira) : null;
            return (
            <div key={r.id} className="bg-bg-surface border border-border-base/50 p-5 rounded-2xl flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <button
                    className="text-sm font-bold text-text-base mb-1 hover:text-primary-600 transition-colors text-left"
                    onClick={() => loadUserDetails(r.username)}
                    title="Clique para ver senha e vencimento"
                  >
                    {r.username} {loadingDetails[r.username] ? "..." : ""}
                  </button>
                  <div className="flex gap-2 items-center flex-wrap">
                    <span className="text-[11px] font-medium text-text-muted bg-bg-surface-hover px-1.5 py-0.5 rounded border border-border-base/50">
                      {formatDate(r.created_at)}
                    </span>
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                      r.type === "date_correction"
                        ? "text-blue-700 bg-blue-50 border-blue-200"
                        : "text-primary-600 bg-primary-50 border-primary-100"
                    }`}>
                      {typeLabel(r.type)}
                    </span>
                  </div>
                </div>
                <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-lg border flex-shrink-0 ${
                  r.status === "aprovado" ? "bg-green-50 text-green-700 border-green-200" :
                  r.status === "aguardando" ? "bg-amber-50 text-amber-700 border-amber-200" :
                  "bg-red-50 text-red-700 border-red-200"
                }`}>
                  {r.status === "aprovado" ? "Aprovado" : r.status === "aguardando" ? "Aguardando" : "Rejeitado"}
                </span>
              </div>

              {/* Client quick-info (loaded on demand) */}
              {u && (
                <div className="flex gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 bg-bg-base/60 border border-border-base/40 rounded-xl px-3 py-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-text-muted shrink-0" />
                    <span className="text-xs font-mono font-bold text-text-base">
                      {showPass[r.username] ? (pass || "N/A") : "••••••"}
                    </span>
                    <button onClick={() => setShowPass(p => ({ ...p, [r.username]: !p[r.username] }))} className="ml-0.5 text-text-muted hover:text-text-base">
                      {showPass[r.username] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </div>
                  {days !== null && (
                    <div className={`flex items-center gap-1.5 border rounded-xl px-3 py-1.5 ${days <= 1 ? "bg-red-50 border-red-100" : days <= 5 ? "bg-amber-50 border-amber-100" : "bg-bg-base/60 border-border-base/40"}`}>
                      <Clock className={`w-3.5 h-3.5 shrink-0 ${days <= 1 ? "text-red-500" : days <= 5 ? "text-amber-500" : "text-text-muted"}`} />
                      <span className={`text-xs font-bold ${days <= 1 ? "text-red-600" : days <= 5 ? "text-amber-600" : "text-text-base"}`}>
                        {days < 0 ? "Expirado" : days === 0 ? "Vence hoje" : `${days}d restantes`}
                      </span>
                      <span className="text-[10px] text-text-muted">({u.expira?.slice(0, 10).split("-").reverse().join("/")})</span>
                    </div>
                  )}
                </div>
              )}
              {!u && !loadingDetails[r.username] && (
                <button onClick={() => loadUserDetails(r.username)} className="text-[11px] text-primary-500 hover:text-primary-600 font-medium flex items-center gap-1 w-fit">
                  <Eye className="w-3 h-3" /> Ver senha e vencimento
                </button>
              )}

              <div className={`p-3.5 rounded-xl border ${r.type === "date_correction" ? "bg-blue-50/50 border-blue-200" : "bg-bg-base/50 border-border-base/50"}`}>
                <p className="text-[10px] uppercase font-bold tracking-wider text-text-muted mb-1">
                  {r.type === "date_correction" ? "Data correta de vencimento" : "Valor solicitado"}
                </p>
                <p className={`font-bold text-lg bg-white/50 p-1.5 rounded ${r.type === "date_correction" ? "text-blue-700" : "text-text-base"}`}>
                  {r.type === "date_correction" ? r.requested_value.split("-").reverse().join("/") : r.requested_value}
                </p>
                {r.type === "date_correction" && r.status === "aguardando" && (
                  <p className="text-xs text-blue-600 mt-2 font-medium">Gerada automaticamente — cliente renovou com acesso vencido. Ajuste a data no painel VPN.</p>
                )}
                {r.approved_value && r.approved_value !== r.requested_value && r.type !== "date_correction" && (
                  <div className="mt-3">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-text-muted mb-1">Valor aprovado</p>
                    <p className="font-bold text-green-600 text-lg bg-white/50 p-1.5 rounded border border-green-100">{r.approved_value}</p>
                  </div>
                )}
              </div>

              {r.status === "aguardando" && (
                <div className="flex gap-2.5 pt-3 border-t border-border-base/50">
                  <button
                    onClick={() => startApprove(r)}
                    className="flex-1 bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95"
                  >
                    Aprovar
                  </button>
                  <button
                    onClick={() => setConfirmReject(r.id)}
                    className="flex-[0.4] bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95"
                  >
                    Rejeitar
                  </button>
                </div>
              )}
            </div>
          );})
        )}
      </div>

      {/* Approve modal */}
      {pendingApprove && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-bg-surface rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="font-bold text-text-base">Aprovar {typeLabel(pendingApprove.type)}</h3>
            <p className="text-sm text-text-muted">Lembre-se de alterar no painel VPN também.</p>
            <div>
              <label className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5 block">
                Valor a aprovar
              </label>
              <input
                type="text"
                value={approvedValue}
                onChange={e => setApprovedValue(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-border-base focus:ring-2 focus:ring-primary-500/50 outline-none text-sm bg-bg-surface"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setPendingApprove(null); setApprovedValue(""); }}
                className="flex-1 border border-border-base py-2.5 rounded-xl text-sm font-bold text-text-base hover:bg-bg-surface-hover transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleApprove}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm active:scale-95"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal with reason */}
      {confirmReject && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-bg-surface rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="font-bold text-text-base">Rejeitar Solicitação</h3>
            <div>
              <label className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5 block">
                Motivo da recusa <span className="text-text-muted font-normal normal-case">(opcional)</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Ex: Data inválida, não disponível no período..."
                className="w-full px-4 py-3 rounded-xl border border-border-base focus:ring-2 focus:ring-red-400/40 outline-none text-sm bg-bg-surface resize-none"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setConfirmReject(null); setRejectReason(""); }}
                className="flex-1 border border-border-base py-2.5 rounded-xl text-sm font-bold text-text-base hover:bg-bg-surface-hover transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleReject(confirmReject)}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm active:scale-95"
              >
                Rejeitar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
