import React, { useState } from "react";
import { RefreshCw } from "lucide-react";
import { fetchAdminChangeRequests, approveChangeRequest, rejectChangeRequest } from "../../services/api";
import { ConfirmDialog } from "../shared/ConfirmDialog";

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
  const map: Record<string, string> = { date: "Vencimento", username: "Usuário", uuid: "UUID", password: "Senha" };
  return map[type] || type;
}

export function AdminChangeReqs({ changeRequests, setChangeRequests }: Props) {
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [confirmReject, setConfirmReject] = useState<string | null>(null);
  const [pendingApprove, setPendingApprove] = useState<{ id: string; type: string; requestedValue: string } | null>(null);
  const [approvedValue, setApprovedValue] = useState("");

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
      await rejectChangeRequest(id);
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
          filtered.map((r: any) => (
            <div key={r.id} className="bg-bg-surface border border-border-base/50 p-5 rounded-2xl flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-bold text-text-base mb-1">{r.username}</p>
                  <div className="flex gap-2 items-center">
                    <span className="text-[11px] font-medium text-text-muted bg-bg-surface-hover px-1.5 py-0.5 rounded border border-border-base/50">
                      {formatDate(r.created_at)}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-primary-600 bg-primary-50 px-2 py-0.5 rounded border border-primary-100">
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

              <div className="bg-bg-base/50 p-3.5 rounded-xl border border-border-base/50">
                <p className="text-[10px] uppercase font-bold tracking-wider text-text-muted mb-1">Valor solicitado</p>
                <p className="font-bold text-text-base text-lg bg-white/50 p-1.5 rounded">{r.requested_value}</p>
                {r.approved_value && r.approved_value !== r.requested_value && (
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
          ))
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

      <ConfirmDialog
        isOpen={!!confirmReject}
        title="Rejeitar Alteração"
        message="Rejeitar esta solicitação?"
        onConfirm={() => { if (confirmReject) handleReject(confirmReject); }}
        onCancel={() => setConfirmReject(null)}
      />
    </div>
  );
}
