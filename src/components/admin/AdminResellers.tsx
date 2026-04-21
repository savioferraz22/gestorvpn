import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronUp,
  ClipboardList,
  Clock,
  Edit2,
  History,
  Loader2,
  RefreshCw,
  RotateCw,
  Users,
  X,
} from "lucide-react";
import {
  adjustReseller,
  approveResellerRequest,
  confirmResellerRequest,
  fetchAdminResellerDetails,
  fetchAdminResellerRequests,
  fetchAdminResellers,
  rejectResellerRequest,
  retryPaymentApplication,
} from "../../services/api";
import { Card, Chip, Empty, SectionHeader, Stat, useToast } from "./ui";
import { FilterBar, SearchInput, useUrlState } from "./filters";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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

function reqStatusTone(s: string): "success" | "warning" | "info" | "danger" | "default" {
  if (s === "aprovado" || s === "confirmado") return "success";
  if (s === "aguardando") return "warning";
  if (s === "aguardando_confirmacao") return "info";
  if (s === "rejeitado") return "danger";
  return "default";
}

function reqStatusLabel(s: string): string {
  if (s === "aguardando") return "Aguardando";
  if (s === "aguardando_confirmacao") return "Aguard. confirmação";
  if (s === "aprovado") return "Aprovado";
  if (s === "confirmado") return "Confirmado";
  if (s === "rejeitado") return "Recusado";
  return s;
}

export function AdminResellers() {
  const toast = useToast();
  const [subTab, setSubTab] = useState<SubTab>("resellers");
  const { state, update, reset, isDirty } = useUrlState("resellers", { q: "" });

  const [resellers, setResellers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editExpiry, setEditExpiry] = useState("");
  const [editLogins, setEditLogins] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ user: string; msg: string; ok: boolean } | null>(null);

  const [requests, setRequests] = useState<any[]>([]);
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ id: string; msg: string; ok: boolean } | null>(null);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedDetails, setExpandedDetails] = useState<any | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [expandedError, setExpandedError] = useState("");
  const [retryingPaymentId, setRetryingPaymentId] = useState<string | null>(null);
  const [retryMsg, setRetryMsg] = useState<{ id: string; msg: string; ok: boolean } | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setResellers(await fetchAdminResellers());
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
      setRequests(await fetchAdminResellerRequests());
    } catch (e: any) {
      setReqError(e.message || "Erro ao carregar solicitações");
    } finally {
      setReqLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadRequests();
  }, []);

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
      setExpandedDetails(await fetchAdminResellerDetails(username));
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
      setRetryMsg({
        id: paymentId,
        msg: r.ok ? "Reaplicação concluída!" : r.message || "Reaplicação enviada.",
        ok: !!r.ok,
      });
      if (r.ok) toast.success("Pagamento reaplicado");
      else toast.warning("Reaplicação enviada", r.message);
      if (expanded === username) {
        setExpandedDetails(await fetchAdminResellerDetails(username));
      }
      await load();
    } catch (e: any) {
      setRetryMsg({ id: paymentId, msg: e.message || "Erro ao reaplicar", ok: false });
      toast.error("Falha ao reaplicar", e.message);
    } finally {
      setRetryingPaymentId(null);
    }
  }

  function startEdit(r: any) {
    setEditing(r.login);
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
      toast.success("Revendedor atualizado");
    } catch (e: any) {
      setSaveMsg({ user: username, msg: e.message || "Erro ao salvar", ok: false });
      toast.error("Falha ao salvar", e.message);
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
      toast.success("Solicitação aprovada");
    } catch (e: any) {
      setActionMsg({ id, msg: e.message || "Erro ao aprovar", ok: false });
      toast.error("Falha ao aprovar", e.message);
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
      toast.success("Solicitação recusada");
    } catch (e: any) {
      setActionMsg({ id, msg: e.message || "Erro ao recusar", ok: false });
      toast.error("Falha ao recusar", e.message);
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

  const filtered = useMemo(() => {
    const q = state.q.trim().toLowerCase();
    if (!q) return resellers;
    return resellers.filter((r) => String(r.login ?? "").toLowerCase().includes(q));
  }, [resellers, state.q]);

  const pendingReqs = useMemo(
    () =>
      requests.filter(
        (r) => r.status === "aguardando" || r.status === "aguardando_confirmacao",
      ),
    [requests],
  );
  const pendingCount = pendingReqs.length;

  const stats = useMemo(() => {
    let expired = 0;
    let soon = 0;
    let failed = 0;
    for (const r of resellers) {
      const d = daysLeft(r.expiresAt);
      if (d !== null && d <= 0) expired++;
      else if (d !== null && d <= 7) soon++;
      if (r.hasFailedApplication) failed++;
    }
    return { expired, soon, failed };
  }, [resellers]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
        <SectionHeader
          title="Revendas"
          subtitle={
            pendingCount > 0
              ? `${pendingCount} ${pendingCount === 1 ? "solicitação pendente" : "solicitações pendentes"}`
              : `${resellers.length} ${resellers.length === 1 ? "revendedor" : "revendedores"}`
          }
          actions={
            <button
              type="button"
              onClick={subTab === "resellers" ? load : loadRequests}
              disabled={subTab === "resellers" ? loading : reqLoading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border-base/60 bg-bg-surface text-text-muted shadow-[var(--shadow-card-sm)] hover:bg-bg-surface-hover disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={(subTab === "resellers" ? loading : reqLoading) ? "animate-spin" : ""}
              />
            </button>
          }
        />

        <div className="flex gap-1 rounded-2xl border border-border-base/60 bg-bg-surface p-1 shadow-[var(--shadow-card-sm)]">
          <button
            type="button"
            onClick={() => setSubTab("resellers")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-colors ${
              subTab === "resellers"
                ? "bg-primary-600 text-white shadow-sm"
                : "text-text-muted hover:text-text-base"
            }`}
          >
            <Users size={14} />
            Revendedores
          </button>
          <button
            type="button"
            onClick={() => setSubTab("requests")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-colors ${
              subTab === "requests"
                ? "bg-primary-600 text-white shadow-sm"
                : "text-text-muted hover:text-text-base"
            }`}
          >
            <ClipboardList size={14} />
            Solicitações
            {pendingCount > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </button>
        </div>

        {subTab === "resellers" && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Total" value={String(resellers.length)} variant="accent" />
              <Stat
                label="Vencendo"
                value={String(stats.soon)}
                variant={stats.soon > 0 ? "warn" : "default"}
              />
              <Stat
                label="Expirados"
                value={String(stats.expired)}
                variant={stats.expired > 0 ? "danger" : "default"}
              />
              <Stat
                label="Falha painel"
                value={String(stats.failed)}
                variant={stats.failed > 0 ? "danger" : "default"}
              />
            </div>

            <FilterBar
              search={
                <SearchInput
                  value={state.q}
                  onChange={(v) => update("q", v)}
                  placeholder="Buscar revendedor..."
                />
              }
              onReset={isDirty ? reset : undefined}
              total={resellers.length}
              filtered={filtered.length}
            />

            {error && <p className="text-sm font-medium text-danger">{error}</p>}
            {saveMsg && (
              <p
                className={`text-sm font-medium ${saveMsg.ok ? "text-[var(--success)]" : "text-danger"}`}
              >
                {saveMsg.user}: {saveMsg.msg}
              </p>
            )}

            {loading && !resellers.length ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
              </div>
            ) : filtered.length === 0 ? (
              <Empty
                title={isDirty ? "Nenhum revendedor com esse filtro" : "Nenhum revendedor"}
              />
            ) : (
              <div className="flex flex-col gap-2">
                {filtered.map((r) => {
                  const days = daysLeft(r.expiresAt);
                  const expired = days !== null && days <= 0;
                  const soon = days !== null && days > 0 && days <= 7;
                  const isEditing = editing === r.login;
                  const isExpanded = expanded === r.login;

                  return (
                    <Card key={r.login} padding="md" className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold text-text-base">{r.login}</p>
                            {r.hasFailedApplication && (
                              <Chip tone="danger" size="sm" uppercase>
                                <AlertCircle size={10} />
                                Falha no painel
                              </Chip>
                            )}
                          </div>
                          {!isEditing ? (
                            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                              <span>
                                Logins:{" "}
                                <span className="font-semibold text-text-base">
                                  {r.logins || "—"}
                                </span>
                              </span>
                              <span>
                                Vencimento:{" "}
                                <span
                                  className={`font-semibold ${
                                    expired
                                      ? "text-danger"
                                      : soon
                                        ? "text-[var(--warning)]"
                                        : "text-text-base"
                                  }`}
                                >
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
                                <label className="w-20 shrink-0 text-xs text-text-muted">
                                  Vencimento:
                                </label>
                                <input
                                  type="date"
                                  value={editExpiry}
                                  onChange={(e) => setEditExpiry(e.target.value)}
                                  className="flex-1 rounded-lg border border-border-base/60 bg-bg-surface-hover/40 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ring-focus)]"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="w-20 shrink-0 text-xs text-text-muted">
                                  Logins:
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  value={editLogins}
                                  onChange={(e) => setEditLogins(e.target.value)}
                                  placeholder="Ex: 20"
                                  className="flex-1 rounded-lg border border-border-base/60 bg-bg-surface-hover/40 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ring-focus)]"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {!isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => toggleExpand(r.login)}
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-bg-surface-hover ${
                                  isExpanded ? "bg-bg-surface-hover text-text-base" : "text-text-muted"
                                }`}
                                title={isExpanded ? "Ocultar histórico" : "Ver histórico"}
                              >
                                {isExpanded ? <ChevronUp size={14} /> : <History size={14} />}
                              </button>
                              <button
                                type="button"
                                onClick={() => startEdit(r)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-surface-hover hover:text-text-base"
                                title="Editar"
                              >
                                <Edit2 size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => saveEdit(r.login)}
                                disabled={saving}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60"
                                title="Salvar"
                              >
                                {saving ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Check size={14} />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={saving}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-surface-hover"
                                title="Cancelar"
                              >
                                <X size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-border-base/60 pt-3">
                          {expandedLoading ? (
                            <div className="flex justify-center py-6">
                              <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
                            </div>
                          ) : expandedError ? (
                            <p className="text-xs text-danger">{expandedError}</p>
                          ) : expandedDetails ? (
                            <div className="space-y-3">
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div className="rounded-xl bg-bg-surface-hover/40 p-2 text-center">
                                  <p className="text-[10px] font-bold uppercase text-text-muted">
                                    Logins
                                  </p>
                                  <p className="font-bold text-text-base">
                                    {expandedDetails.plan?.logins ?? "—"}
                                  </p>
                                </div>
                                <div className="rounded-xl bg-bg-surface-hover/40 p-2 text-center">
                                  <p className="text-[10px] font-bold uppercase text-text-muted">
                                    Vence em
                                  </p>
                                  <p className="font-bold text-text-base">
                                    {formatDate(expandedDetails.plan?.expiresAt)}
                                  </p>
                                </div>
                                <div className="rounded-xl bg-bg-surface-hover/40 p-2 text-center">
                                  <p className="text-[10px] font-bold uppercase text-text-muted">
                                    Meses pagos
                                  </p>
                                  <p className="font-bold text-text-base">
                                    {expandedDetails.plan?.totalMonthsPaid ?? 0}
                                  </p>
                                </div>
                              </div>

                              <div>
                                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                                  Timeline de pagamentos
                                </p>
                                {(expandedDetails.history ?? []).length === 0 ? (
                                  <p className="py-2 text-center text-xs text-text-muted">
                                    Nenhum pagamento registrado.
                                  </p>
                                ) : (
                                  <div className="space-y-2">
                                    {(expandedDetails.history ?? []).map((h: any) => {
                                      const typeLabel =
                                        h.type === "reseller_hire"
                                          ? "Contratação"
                                          : h.type === "reseller_renewal"
                                            ? `Renovação${h.monthsPaid ? ` (${h.monthsPaid}m)` : ""}`
                                            : h.type === "reseller_setup"
                                              ? "Configuração inicial"
                                              : h.type === "reseller_adjustment"
                                                ? "Ajuste manual"
                                                : h.type;
                                      const applicationStatus = h.hasFailedAttempts
                                        ? {
                                            tone: "danger" as const,
                                            label: "Falha",
                                            icon: <AlertCircle size={10} />,
                                          }
                                        : h.vpnApplied
                                          ? {
                                              tone: "success" as const,
                                              label: "Aplicado",
                                              icon: <CheckCircle2 size={10} />,
                                            }
                                          : h.type === "reseller_setup" ||
                                              h.type === "reseller_adjustment"
                                            ? {
                                                tone: "info" as const,
                                                label: "Ajuste",
                                                icon: <Edit2 size={10} />,
                                              }
                                            : {
                                                tone: "warning" as const,
                                                label: "Pendente",
                                                icon: <Clock size={10} />,
                                              };
                                      const payRetryMsg =
                                        retryMsg?.id === h.paymentId ? retryMsg : null;
                                      const canRetry =
                                        h.hasFailedAttempts ||
                                        (h.type === "reseller_renewal" && !h.vpnApplied);
                                      return (
                                        <div
                                          key={h.paymentId}
                                          className="rounded-xl border border-border-base/60 bg-bg-surface-hover/40 p-3"
                                        >
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-sm font-semibold text-text-base">
                                                  {typeLabel}
                                                </p>
                                                {h.discountApplied && (
                                                  <Chip tone="success" size="sm">
                                                    -20%
                                                  </Chip>
                                                )}
                                                <Chip
                                                  tone={applicationStatus.tone}
                                                  size="sm"
                                                  uppercase
                                                >
                                                  {applicationStatus.icon}
                                                  {applicationStatus.label}
                                                </Chip>
                                              </div>
                                              <p className="mt-0.5 text-[10px] text-text-muted">
                                                {h.paidAt
                                                  ? new Date(h.paidAt).toLocaleString("pt-BR")
                                                  : h.createdAt
                                                    ? new Date(h.createdAt).toLocaleString("pt-BR")
                                                    : "—"}
                                              </p>
                                              <p
                                                className="mt-1 truncate font-mono text-[11px] text-text-muted"
                                                title={h.paymentId}
                                              >
                                                ID: {h.paymentId}
                                              </p>
                                              {h.daysAdded > 0 && (
                                                <p className="mt-1 text-xs text-text-base">
                                                  <span className="font-bold text-[var(--success)]">
                                                    +{h.daysAdded} dias
                                                  </span>
                                                  {h.expiresAfter && (
                                                    <span className="text-text-muted">
                                                      {" "}→ venc. {formatDate(h.expiresAfter)}
                                                    </span>
                                                  )}
                                                </p>
                                              )}
                                            </div>
                                            <div className="shrink-0 text-right">
                                              {h.amount != null && (
                                                <p className="text-sm font-bold text-[var(--success)]">
                                                  R${h.amount}
                                                </p>
                                              )}
                                            </div>
                                          </div>

                                          {Array.isArray(h.attempts) && h.attempts.length > 0 && (
                                            <div className="mt-2 space-y-1 border-t border-border-base/60 pt-2">
                                              <p className="text-[10px] font-bold uppercase text-text-muted">
                                                Tentativas no painel VPN
                                              </p>
                                              {h.attempts.map((a: any) => (
                                                <div
                                                  key={a.id}
                                                  className="flex items-center justify-between gap-2 text-[11px]"
                                                >
                                                  <span className="font-mono text-text-muted">
                                                    #{a.attempt_number ?? "?"} {a.module}
                                                  </span>
                                                  <span
                                                    className={`font-semibold ${
                                                      a.status === "success"
                                                        ? "text-[var(--success)]"
                                                        : a.status === "failed"
                                                          ? "text-danger"
                                                          : "text-[var(--warning)]"
                                                    }`}
                                                  >
                                                    {a.status}
                                                  </span>
                                                  <span
                                                    className="flex-1 truncate text-right text-text-muted"
                                                    title={a.error_message || a.response_text || ""}
                                                  >
                                                    {a.error_message || a.response_text || "—"}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          )}

                                          {canRetry && (
                                            <div className="mt-2 flex items-center justify-between gap-2 border-t border-border-base/60 pt-2">
                                              {payRetryMsg ? (
                                                <p
                                                  className={`text-[11px] font-medium ${
                                                    payRetryMsg.ok
                                                      ? "text-[var(--success)]"
                                                      : "text-danger"
                                                  }`}
                                                >
                                                  {payRetryMsg.msg}
                                                </p>
                                              ) : (
                                                <p className="text-[11px] text-text-muted">
                                                  Aplicação incompleta no painel VPN.
                                                </p>
                                              )}
                                              <button
                                                type="button"
                                                disabled={retryingPaymentId === h.paymentId}
                                                onClick={() =>
                                                  handleRetryPayment(h.paymentId, r.login)
                                                }
                                                className="inline-flex items-center gap-1 rounded-lg bg-[var(--success)] px-2 py-1 text-[10px] font-bold text-white hover:brightness-110 disabled:opacity-50"
                                              >
                                                {retryingPaymentId === h.paymentId ? (
                                                  <Loader2 size={12} className="animate-spin" />
                                                ) : (
                                                  <RotateCw size={12} />
                                                )}
                                                Reaplicar
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {subTab === "requests" && (
          <>
            {reqError && <p className="text-sm font-medium text-danger">{reqError}</p>}

            {reqLoading && !requests.length ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
              </div>
            ) : requests.length === 0 ? (
              <Empty title="Nenhuma solicitação" />
            ) : (
              <div className="flex flex-col gap-2">
                {requests.map((req) => {
                  const isRejecting = rejectingId === req.id;
                  const busy = actionBusy === req.id;
                  const msg = actionMsg?.id === req.id ? actionMsg : null;

                  return (
                    <Card key={req.id} padding="md" className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-text-base">{req.username}</p>
                          <p className="mt-0.5 text-xs text-text-muted">
                            {REQ_TYPE_LABEL[req.type] ?? req.type}
                            {req.requested_value && (
                              <span className="ml-2 font-semibold text-text-base">
                                → {req.requested_value}
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 text-xs text-text-muted">
                            {new Date(req.created_at).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <Chip tone={reqStatusTone(req.status)} size="sm" uppercase>
                          {reqStatusLabel(req.status)}
                        </Chip>
                      </div>

                      {req.status === "rejeitado" && req.approved_value && (
                        <p className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-xs text-danger">
                          Motivo: {req.approved_value}
                        </p>
                      )}

                      {msg && (
                        <p
                          className={`text-xs font-medium ${msg.ok ? "text-[var(--success)]" : "text-danger"}`}
                        >
                          {msg.msg}
                        </p>
                      )}

                      {req.status === "aguardando" && (
                        <>
                          {!isRejecting ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleApprove(req.id)}
                                disabled={busy}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--success)] px-3 py-2 text-sm font-bold text-white hover:brightness-110 disabled:opacity-60"
                              >
                                {busy ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Check size={14} />
                                )}
                                Aprovar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectingId(req.id);
                                  setRejectReason("");
                                }}
                                disabled={busy}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger hover:bg-danger/20 disabled:opacity-60"
                              >
                                <X size={14} />
                                Recusar
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <input
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Motivo da recusa (obrigatório)..."
                                className="w-full rounded-lg border border-border-base/60 bg-bg-surface-hover/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--ring-focus)]"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleReject(req.id)}
                                  disabled={busy || !rejectReason.trim()}
                                  className="flex-1 rounded-lg bg-danger px-3 py-2 text-sm font-bold text-white hover:brightness-110 disabled:opacity-60"
                                >
                                  {busy ? (
                                    <Loader2 size={14} className="mx-auto animate-spin" />
                                  ) : (
                                    "Confirmar recusa"
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRejectingId(null);
                                    setRejectReason("");
                                  }}
                                  disabled={busy}
                                  className="rounded-lg border border-border-base/60 bg-bg-surface px-4 py-2 text-sm font-bold text-text-base hover:bg-bg-surface-hover"
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
                          type="button"
                          onClick={() => handleConfirm(req.id)}
                          disabled={busy}
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--info)] px-3 py-2 text-sm font-bold text-white hover:brightness-110 disabled:opacity-60"
                        >
                          {busy ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Check size={14} />
                          )}
                          Confirmar adição de logins
                        </button>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
