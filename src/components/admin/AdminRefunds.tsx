import React, { useState } from "react";
import { RefreshCw } from "lucide-react";
import { fetchAdminRefunds, approveRefund, rejectRefund } from "../../services/api";
import { ConfirmDialog } from "../shared/ConfirmDialog";

interface Props {
  refunds: any[];
  setRefunds: (r: any[]) => void;
}

function formatDate(dateString: string) {
  if (!dateString) return "N/A";
  let s = dateString;
  if (s.includes(" ") && !s.includes("T")) { s = s.replace(" ", "T"); if (!s.endsWith("Z")) s += "Z"; }
  const d = new Date(s);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AdminRefunds({ refunds, setRefunds }: Props) {
  const [loading, setLoading] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [refundDateTime, setRefundDateTime] = useState("");
  const [confirmReject, setConfirmReject] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try { setRefunds(await fetchAdminRefunds()); } catch (err) { console.warn(err); } finally { setLoading(false); }
  }

  async function handleApprove(id: string) {
    if (!refundDateTime) return;
    try {
      await approveRefund(id, new Date(refundDateTime).toISOString());
      setApprovingId(null);
      await refresh();
    } catch (err) { console.warn(err); }
  }

  async function handleReject(id: string) {
    try {
      await rejectRefund(id);
      await refresh();
    } catch (err) { console.warn(err); }
  }

  const pending = refunds.filter(r => r.status === "aguardando");

  return (
    <div className="flex flex-col flex-1 overflow-hidden p-5 space-y-4">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="font-bold text-text-base">Reembolsos ({refunds.length})</h2>
          {pending.length > 0 && (
            <p className="text-xs text-amber-600 font-medium">{pending.length} aguardando aprovação</p>
          )}
        </div>
        <button onClick={refresh} disabled={loading} className="p-2 rounded-xl border border-border-base/50 hover:bg-bg-surface-hover transition-colors active:scale-95">
          <RefreshCw className={`w-4 h-4 text-text-muted ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {refunds.length === 0 ? (
          <div className="bg-bg-surface/50 border border-border-base/50 p-6 rounded-2xl text-center">
            <p className="text-sm font-medium text-text-muted">Nenhuma solicitação de reembolso.</p>
          </div>
        ) : (
          refunds.map((r: any) => (
            <div key={r.id} className="bg-bg-surface border border-border-base/50 p-5 rounded-2xl flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-bold text-text-base mb-1">{r.username}</p>
                  <p className="text-[11px] font-medium text-text-muted bg-bg-surface-hover px-1.5 py-0.5 rounded inline-block border border-border-base/50">
                    {formatDate(r.created_at)}
                  </p>
                </div>
                <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-lg border flex-shrink-0 ${
                  r.status === "realizado" ? "bg-green-50 text-green-700 border-green-200" :
                  r.status === "aguardando" ? "bg-amber-50 text-amber-700 border-amber-200" :
                  "bg-red-50 text-red-700 border-red-200"
                }`}>
                  {r.status === "realizado" ? "Realizado" : r.status === "aguardando" ? "Aguardando" : "Rejeitado"}
                </span>
              </div>

              <div className="bg-bg-base/50 p-3.5 rounded-xl text-sm border border-border-base/50">
                <p className="text-[10px] uppercase font-bold tracking-wider text-text-muted mb-2">Dados para PIX</p>
                <p className="font-bold text-text-base text-xs bg-white/50 p-1.5 rounded border border-black/5 mb-1">
                  <span className="text-text-muted mr-1">Tipo:</span> {r.pix_type}
                </p>
                <p className="font-bold text-text-base text-xs break-all bg-white/50 p-1.5 rounded border border-black/5">
                  <span className="text-text-muted mr-1">Chave:</span> {r.pix_key}
                </p>
                {r.refunded_at && (
                  <p className="font-bold text-green-600 mt-3 text-xs flex items-center">
                    <RefreshCw className="w-3 h-3 mr-1" /> Realizado em {formatDate(r.refunded_at)}
                  </p>
                )}
              </div>

              {r.status === "aguardando" && (
                <div className="flex flex-col gap-3 pt-3 border-t border-border-base/50">
                  {approvingId === r.id ? (
                    <div className="flex flex-col gap-3 bg-bg-base/50 p-4 rounded-xl border border-border-base/50">
                      <label className="text-xs font-bold text-text-base uppercase tracking-wider">Data e Hora do Reembolso</label>
                      <input
                        type="datetime-local"
                        value={refundDateTime}
                        onChange={e => setRefundDateTime(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-border-base focus:ring-2 focus:ring-primary-500/50 outline-none text-sm bg-bg-surface text-text-base font-medium"
                      />
                      <div className="flex gap-2.5">
                        <button
                          onClick={() => handleApprove(r.id)}
                          disabled={!refundDateTime}
                          className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95 disabled:opacity-60"
                        >
                          Confirmar
                        </button>
                        <button
                          onClick={() => setApprovingId(null)}
                          className="flex-1 bg-bg-surface-hover border border-border-base hover:bg-bg-base text-text-base py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2.5">
                      <button
                        onClick={() => {
                          setApprovingId(r.id);
                          const now = new Date();
                          now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                          setRefundDateTime(now.toISOString().slice(0, 16));
                        }}
                        className="flex-1 bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95"
                      >
                        Marcar como Realizado
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
              )}
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        isOpen={!!confirmReject}
        title="Rejeitar Reembolso"
        message="Rejeitar esta solicitação de reembolso?"
        onConfirm={() => { if (confirmReject) handleReject(confirmReject); }}
        onCancel={() => setConfirmReject(null)}
      />
    </div>
  );
}
