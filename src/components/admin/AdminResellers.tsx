import React, { useState, useEffect } from "react";
import { Search, RefreshCw, Edit2, Check, X, Loader2, Users, ClipboardList, AlertCircle, ChevronDown, ChevronUp, History, RotateCw, CheckCircle2, Clock } from "lucide-react";
import {
  fetchAdminResellers, adjustReseller,
  fetchAdminResellerRequests, approveResellerRequest, rejectResellerRequest, confirmResellerRequest,
  fetchAdminResellerDetails, retryPaymentApplication,
} from "../../services/api";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

type SubTab = "resellers" | "requests";

const REQ_TYPE_LABEL: Record<string, string> = {
  reseller_logins_decrease: "Diminuir Logins",
  reseller_logins_increase: "Aumentar Logins",
  reseller_password: "Alterar Senha",
};

const REQ_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  aguardando: { label: "Aguardando", color: "text-amber-600" },
  aguardando_confirmacao: { label: "Pago · Aguard. Confirmação", color: "text-blue-600" },
  aprovado: { label: "Aprovado", color: "text-emerald-600" },
  confirmado: { label: "Confirmado", color: "text-emerald-600" },
  rejeitado: { label: "Recusado", color: "text-red-500" },
};

export function AdminResellers() {
  const [subTab, setSubTab] = useState<SubTab>("resellers");
  const [resellers, setResellers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editExpiry, setEditExpiry] = useState("");
  const [editLogins, setEditLogins] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ user: string; msg: string; ok: boolean } | null>(null);

  // Requests state
  const [requests, setRequests] = useState<any[]>([]);
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ id: string; msg: string; ok: boolean } | null>(null);

  // Expanded audit trail state (per-reseller)
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedDetails, setExpandedDetails] = useState<any | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [expandedError, setExpandedError] = useState("");
  const [retryingPaymentId, setRetryingPaymentId] = useState<string | null>(null);
  const [retryMsg, setRetryMsg] = useState<{ id: string; msg: string; ok: boolean } | null>(null);

  async function toggleExpand(username: string) {
    if (expanded === username) {
      setExpanded(null);
      setExpandedDetails(null);
      return;
    }
    setExpanded(username);
    setExpandedDetails(null);
    setExpandedLoading(true);
    setExpandedError("");
    try {
      const data = await fetchAdminResellerDetails(username);
      setExpandedDetails(data);
    } catch (e: any) {
      setExpandedError(e.message || "Erro ao carregar histórico");
    } finally {
      setExpandedLoading(false);
    }
  }

  async function handleRetryPayment(paymentId: string, username: string) {
    setRetryingPaymentId(paymentId);
    setRetryMsg(null);
    try {
      const r = await retryPaymentApplication(paymentId);
      setRetryMsg({ id: paymentId, msg: r.ok ? "Reaplicação concluída!" : (r.message || "Reaplicação enviada."), ok: !!r.ok });
      // Refresh the expanded view to show the new attempts
      if (expanded === username) {
        const data = await fetchAdminResellerDetails(username);
        setExpandedDetails(data);
      }
      await load();
    } catch (e: any) {
      setRetryMsg({ id: paymentId, msg: e.message || "Erro ao reaplicar", ok: false });
    } finally {
      setRetryingPaymentId(null);
    }
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAdminResellers();
      setResellers(data);
    } catch (e: any) {
      setError(e.message || "Erro ao carregar revendedores");
    } finally {
      setLoading(false);
    }
  }

  async function loadRequests() {
    setReqLoading(true);
    setReqError("");
    try {
      const data = await fetchAdminResellerRequests();
      setRequests(data);
    } catch (e: any) {
      setReqError(e.message || "Erro ao carregar solicitações");
    } finally {
      setReqLoading(false);
    }
  }

  useEffect(() => { load(); loadRequests(); }, []);

  function startEdit(r: any) {
    setEditing(r.login);
    // Pre-fill with current values
    setEditExpiry(r.expiresAt ? new Date(r.expiresAt).toISOString().slice(0, 10) : "");
    setEditLogins(r.logins ? String(r.logins) : "");
    setSaveMsg(null);
  }

  function cancelEdit() {
    setEditing(null);
    setEditExpiry("");
    setEditLogins("");
  }

  async function saveEdit(username: string) {
    setSaving(true);
    setSaveMsg(null);
    try {
      const body: { expiresAt?: string; logins?: number } = {};
      if (editExpiry) body.expiresAt = editExpiry;
      if (editLogins) body.logins = Math.max(1, parseInt(editLogins));
      await adjustReseller(username, body);
      setSaveMsg({ user: username, msg: "Salvo com sucesso!", ok: true });
      setEditing(null);
      await load();
    } catch (e: any) {
      setSaveMsg({ user: username, msg: e.message || "Erro ao salvar", ok: false });
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(id: string) {
    setActionBusy(id);
    setActionMsg(null);
    try {
      await approveResellerRequest(id);
      setActionMsg({ id, msg: "Aprovado com sucesso!", ok: true });
      await loadRequests();
    } catch (e: any) {
      setActionMsg({ id, msg: e.message || "Erro ao aprovar", ok: false });
    } finally {
      setActionBusy(null);
    }
  }

  async function handleReject(id: string) {
    if (!rejectReason.trim()) return;
    setActionBusy(id);
    setActionMsg(null);
    try {
      await rejectResellerRequest(id, rejectReason.trim());
      setActionMsg({ id, msg: "Recusado.", ok: true });
      setRejectingId(null);
      setRejectReason("");
      await loadRequests();
    } catch (e: any) {
      setActionMsg({ id, msg: e.message || "Erro ao recusar", ok: false });
    } finally {
      setActionBusy(null);
    }
  }

  async function handleConfirm(id: string) {
    setActionBusy(id);
    setActionMsg(null);
    try {
      await confirmResellerRequest(id);
      setActionMsg({ id, msg: "Confirmado! Logins adicionados.", ok: true });
      await loadRequests();
    } catch (e: any) {
      setActionMsg({ id, msg: e.message || "Erro ao confirmar", ok: false });
    } finally {
      setActionBusy(null);
    }
  }

  const filtered = resellers.filter(r =>
    !query || r.login?.toLowerCase().includes(query.toLowerCase())
  );

  const pendingReqs = requests.filter(r =>
    r.status === "aguardando" || r.status === "aguardando_confirmacao"
  );
  const pendingCount = pendingReqs.length;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-bg-surface-hover rounded-xl p-1">
        <button
          onClick={() => setSubTab("resellers")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${subTab === "resellers" ? "bg-bg-surface shadow text-text-base" : "text-text-muted hover:text-text-base"}`}
        >
          <Users className="w-4 h-4" />
          Revendedores
        </button>
        <button
          onClick={() => setSubTab("requests")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${subTab === "requests" ? "bg-bg-surface shadow text-text-base" : "text-text-muted hover:text-text-base"}`}
        >
          <ClipboardList className="w-4 h-4" />
          Solicitações
          {pendingCount > 0 && (
            <span className="ml-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{pendingCount}</span>
          )}
        </button>
      </div>

      {subTab === "requests" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={loadRequests}
              disabled={reqLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border-base bg-bg-surface text-sm font-medium hover:bg-bg-surface-hover transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${reqLoading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>

          {reqError && <p className="text-red-500 text-sm font-medium">{reqError}</p>}

          {reqLoading && !requests.length ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
          ) : requests.length === 0 ? (
            <p className="text-text-muted text-sm text-center py-12">Nenhuma solicitação encontrada.</p>
          ) : (
            <div className="space-y-2">
              {requests.map(req => {
                const statusInfo = REQ_STATUS_LABEL[req.status] ?? { label: req.status, color: "text-text-muted" };
                const isRejecting = rejectingId === req.id;
                const busy = actionBusy === req.id;
                const msg = actionMsg?.id === req.id ? actionMsg : null;

                return (
                  <div key={req.id} className="bg-bg-surface border border-border-base rounded-2xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-text-base">{req.username}</p>
                        <p className="text-xs text-text-muted mt-0.5">
                          {REQ_TYPE_LABEL[req.type] ?? req.type}
                          {req.requested_value && <span className="ml-2 font-semibold text-text-base">→ {req.requested_value}</span>}
                        </p>
                        <p className="text-xs text-text-muted mt-0.5">
                          {new Date(req.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold ${statusInfo.color}`}>{statusInfo.label}</span>
                    </div>

                    {req.status === "rejeitado" && req.approved_value && (
                      <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">Motivo: {req.approved_value}</p>
                    )}

                    {msg && (
                      <p className={`text-xs font-medium ${msg.ok ? "text-emerald-600" : "text-red-500"}`}>{msg.msg}</p>
                    )}

                    {req.status === "aguardando" && (
                      <>
                        {!isRejecting ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleApprove(req.id)}
                              disabled={busy}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
                            >
                              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                              Aprovar
                            </button>
                            <button
                              onClick={() => { setRejectingId(req.id); setRejectReason(""); }}
                              disabled={busy}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-red-300 text-red-500 hover:bg-red-50 text-sm font-medium transition-colors disabled:opacity-60"
                            >
                              <X className="w-4 h-4" />
                              Recusar
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <input
                              value={rejectReason}
                              onChange={e => setRejectReason(e.target.value)}
                              placeholder="Motivo da recusa (obrigatório)..."
                              className="w-full px-3 py-2 rounded-xl border border-border-base bg-bg-surface-hover text-sm outline-none focus:ring-2 focus:ring-red-400/30"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleReject(req.id)}
                                disabled={busy || !rejectReason.trim()}
                                className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-60"
                              >
                                {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Confirmar Recusa"}
                              </button>
                              <button
                                onClick={() => { setRejectingId(null); setRejectReason(""); }}
                                disabled={busy}
                                className="px-4 py-2 rounded-xl border border-border-base text-text-muted hover:bg-bg-surface-hover text-sm transition-colors"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {req.status === "aguardando_confirmacao" && (
                      <button
                        onClick={() => handleConfirm(req.id)}
                        disabled={busy}
                        className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Confirmar adição de logins
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {subTab === "resellers" && (
      <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filtrar revendedores..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border-base bg-bg-surface text-sm outline-none focus:ring-2 focus:ring-primary-500/30"
          />
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border-base bg-bg-surface text-sm font-medium hover:bg-bg-surface-hover transition-colors disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {error && <p className="text-red-500 text-sm font-medium">{error}</p>}

      {saveMsg && (
        <p className={`text-sm font-medium ${saveMsg.ok ? "text-green-600" : "text-red-500"}`}>
          {saveMsg.user}: {saveMsg.msg}
        </p>
      )}

      {loading && !resellers.length ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-text-muted text-sm text-center py-12">Nenhum revendedor encontrado.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const days = daysLeft(r.expiresAt);
            const expired = days !== null && days <= 0;
            const soon = days !== null && days > 0 && days <= 7;
            const isEditing = editing === r.login;

            const isExpanded = expanded === r.login;
            return (
              <div key={r.login} className="bg-bg-surface border border-border-base rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-text-base">{r.login}</p>
                      {r.hasFailedApplication && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md border bg-red-50 text-red-700 border-red-200">
                          <AlertCircle className="w-3 h-3" />
                          Falha no painel
                        </span>
                      )}
                    </div>
                    {!isEditing ? (
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                        <span>
                          Logins: <span className="font-semibold text-text-base">{r.logins || "—"}</span>
                        </span>
                        <span>
                          Vencimento:{" "}
                          <span className={`font-semibold ${expired ? "text-red-500" : soon ? "text-amber-500" : "text-text-base"}`}>
                            {formatDate(r.expiresAt)}
                            {days !== null && (
                              <span className="ml-1">
                                ({expired ? "expirado" : `${days}d`})
                              </span>
                            )}
                          </span>
                        </span>
                      </div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-text-muted w-20 shrink-0">Vencimento:</label>
                          <input
                            type="date"
                            value={editExpiry}
                            onChange={e => setEditExpiry(e.target.value)}
                            className="flex-1 px-3 py-1.5 rounded-lg border border-border-base bg-bg-surface-hover text-sm outline-none focus:ring-2 focus:ring-primary-500/30"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-text-muted w-20 shrink-0">Logins:</label>
                          <input
                            type="number"
                            min={1}
                            value={editLogins}
                            onChange={e => setEditLogins(e.target.value)}
                            placeholder="Ex: 20"
                            className="flex-1 px-3 py-1.5 rounded-lg border border-border-base bg-bg-surface-hover text-sm outline-none focus:ring-2 focus:ring-primary-500/30"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isEditing ? (
                      <>
                        <button
                          onClick={() => toggleExpand(r.login)}
                          className={`p-2 rounded-xl hover:bg-bg-surface-hover text-text-muted hover:text-text-base transition-colors ${isExpanded ? "bg-bg-surface-hover text-text-base" : ""}`}
                          title={isExpanded ? "Ocultar histórico" : "Ver histórico"}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <History className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => startEdit(r)}
                          className="p-2 rounded-xl hover:bg-bg-surface-hover text-text-muted hover:text-text-base transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => saveEdit(r.login)}
                          disabled={saving}
                          className="p-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white transition-colors disabled:opacity-60"
                          title="Salvar"
                        >
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={saving}
                          className="p-2 rounded-xl hover:bg-bg-surface-hover text-text-muted transition-colors"
                          title="Cancelar"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Expanded audit trail: timeline of payments + attempts */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-border-base space-y-3">
                    {expandedLoading ? (
                      <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>
                    ) : expandedError ? (
                      <p className="text-xs text-red-500">{expandedError}</p>
                    ) : expandedDetails ? (
                      <>
                        {/* Summary */}
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="bg-bg-surface-hover rounded-xl p-2 text-center">
                            <p className="text-[10px] uppercase text-text-muted font-bold">Logins</p>
                            <p className="font-bold text-text-base">{expandedDetails.plan?.logins ?? "—"}</p>
                          </div>
                          <div className="bg-bg-surface-hover rounded-xl p-2 text-center">
                            <p className="text-[10px] uppercase text-text-muted font-bold">Vence em</p>
                            <p className="font-bold text-text-base">{formatDate(expandedDetails.plan?.expiresAt)}</p>
                          </div>
                          <div className="bg-bg-surface-hover rounded-xl p-2 text-center">
                            <p className="text-[10px] uppercase text-text-muted font-bold">Meses pagos</p>
                            <p className="font-bold text-text-base">{expandedDetails.plan?.totalMonthsPaid ?? 0}</p>
                          </div>
                        </div>

                        {/* Timeline */}
                        <div className="space-y-2">
                          <p className="text-[10px] uppercase tracking-wider font-bold text-text-muted">Timeline de Pagamentos</p>
                          {(expandedDetails.history ?? []).length === 0 ? (
                            <p className="text-xs text-text-muted text-center py-2">Nenhum pagamento registrado.</p>
                          ) : (
                            (expandedDetails.history ?? []).map((h: any) => {
                              const typeLabel =
                                h.type === "reseller_hire" ? "Contratação" :
                                h.type === "reseller_renewal" ? `Renovação${h.monthsPaid ? ` (${h.monthsPaid}m)` : ""}` :
                                h.type === "reseller_setup" ? "Configuração inicial" :
                                h.type === "reseller_adjustment" ? "Ajuste manual" : h.type;
                              const applicationStatus = h.hasFailedAttempts
                                ? { label: "Falha", cls: "bg-red-50 text-red-700 border-red-200", icon: <AlertCircle className="w-3 h-3" /> }
                                : h.vpnApplied
                                  ? { label: "Aplicado", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="w-3 h-3" /> }
                                  : (h.type === "reseller_setup" || h.type === "reseller_adjustment")
                                    ? { label: "Ajuste", cls: "bg-blue-50 text-blue-700 border-blue-200", icon: <Edit2 className="w-3 h-3" /> }
                                    : { label: "Pendente", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: <Clock className="w-3 h-3" /> };
                              const payRetryMsg = retryMsg?.id === h.paymentId ? retryMsg : null;
                              const canRetry = h.hasFailedAttempts || (h.type === "reseller_renewal" && !h.vpnApplied);
                              return (
                                <div key={h.paymentId} className="rounded-xl border border-border-base bg-bg-surface-hover p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-sm font-semibold text-text-base">{typeLabel}</p>
                                        {h.discountApplied && <span className="text-[10px] text-emerald-600 font-bold">🎉 -20%</span>}
                                        <span className={`inline-flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md border ${applicationStatus.cls}`}>
                                          {applicationStatus.icon}
                                          {applicationStatus.label}
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-text-muted mt-0.5">
                                        {h.paidAt ? new Date(h.paidAt).toLocaleString("pt-BR") : (h.createdAt ? new Date(h.createdAt).toLocaleString("pt-BR") : "—")}
                                      </p>
                                      <p className="text-[11px] text-text-muted mt-1 font-mono truncate" title={h.paymentId}>ID: {h.paymentId}</p>
                                      {h.daysAdded > 0 && (
                                        <p className="text-xs text-text-base mt-1">
                                          <span className="font-bold text-emerald-600">+{h.daysAdded} dias</span>
                                          {h.expiresAfter && <span className="text-text-muted"> → venc. {formatDate(h.expiresAfter)}</span>}
                                        </p>
                                      )}
                                    </div>
                                    <div className="text-right shrink-0">
                                      {h.amount != null && <p className="font-bold text-emerald-600 text-sm">R${h.amount}</p>}
                                    </div>
                                  </div>

                                  {/* Attempts detail */}
                                  {Array.isArray(h.attempts) && h.attempts.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-border-base/60 space-y-1">
                                      <p className="text-[10px] uppercase text-text-muted font-bold">Tentativas no painel VPN</p>
                                      {h.attempts.map((a: any) => (
                                        <div key={a.id} className="flex items-center justify-between gap-2 text-[11px]">
                                          <span className="font-mono text-text-muted">
                                            #{a.attempt_number ?? "?"} {a.module}
                                          </span>
                                          <span className={`font-semibold ${a.status === "success" ? "text-emerald-600" : a.status === "failed" ? "text-red-600" : "text-amber-600"}`}>
                                            {a.status}
                                          </span>
                                          <span className="text-text-muted truncate flex-1 text-right" title={a.error_message || a.response_text || ""}>
                                            {a.error_message || a.response_text || "—"}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {canRetry && (
                                    <div className="mt-2 pt-2 border-t border-border-base/60 flex items-center justify-between gap-2">
                                      {payRetryMsg ? (
                                        <p className={`text-[11px] font-medium ${payRetryMsg.ok ? "text-emerald-600" : "text-red-600"}`}>{payRetryMsg.msg}</p>
                                      ) : (
                                        <p className="text-[11px] text-text-muted">Aplicação incompleta no painel VPN.</p>
                                      )}
                                      <button
                                        disabled={retryingPaymentId === h.paymentId}
                                        onClick={() => handleRetryPayment(h.paymentId, r.login)}
                                        className="text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-2 py-1 rounded-lg transition-colors flex items-center gap-1"
                                      >
                                        {retryingPaymentId === h.paymentId ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                                        Reaplicar
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>
      )}
    </div>
  );
}
