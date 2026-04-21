import { useMemo, useState } from "react";
import { Check, Clock, Eye, EyeOff, KeyRound, RefreshCw, X } from "lucide-react";
import {
  approveChangeRequest,
  fetchAdminChangeRequests,
  fetchAdminUserDetails,
  rejectChangeRequest,
} from "../../services/api";
import { Card, Chip, Empty, SectionHeader, Stat, useToast } from "./ui";
import { FilterBar, FilterSelect, SearchInput, useUrlState } from "./filters";

interface Props {
  changeRequests: any[];
  setChangeRequests: (c: any[]) => void;
}

function formatDate(s: string | undefined) {
  if (!s) return "—";
  let iso = s;
  if (iso.includes(" ") && !iso.includes("T")) {
    iso = iso.replace(" ", "T");
    if (!iso.endsWith("Z")) iso += "Z";
  }
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function typeLabel(type: string) {
  const map: Record<string, string> = {
    date: "Vencimento",
    username: "Usuário",
    uuid: "UUID",
    password: "Senha",
    date_correction: "Correção de Vencimento",
  };
  return map[type] || type;
}

function daysLeft(expira: string | undefined) {
  if (!expira) return null;
  const exp = new Date(expira);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);
  return Math.round((exp.getTime() - today.getTime()) / 86400000);
}

const TYPE_OPTIONS = [
  { value: "all", label: "Todos os tipos" },
  { value: "date_correction", label: "Correção de Vencimento" },
  { value: "date", label: "Vencimento" },
  { value: "username", label: "Usuário" },
  { value: "uuid", label: "UUID" },
  { value: "password", label: "Senha" },
] as const;

const STATUS_OPTIONS = [
  { value: "all", label: "Todos status" },
  { value: "aguardando", label: "Aguardando" },
  { value: "aprovado", label: "Aprovados" },
  { value: "rejeitado", label: "Rejeitados" },
] as const;

function statusTone(s: string): "success" | "warning" | "danger" | "default" {
  if (s === "aprovado") return "success";
  if (s === "aguardando") return "warning";
  if (s === "rejeitado") return "danger";
  return "default";
}

function statusLabel(s: string): string {
  if (s === "aprovado") return "Aprovado";
  if (s === "aguardando") return "Aguardando";
  if (s === "rejeitado") return "Rejeitado";
  return s;
}

export function AdminChangeReqs({ changeRequests, setChangeRequests }: Props) {
  const toast = useToast();
  const { state, update, reset, isDirty } = useUrlState("change_requests", {
    q: "",
    type: "all" as (typeof TYPE_OPTIONS)[number]["value"],
    status: "aguardando" as (typeof STATUS_OPTIONS)[number]["value"],
  });

  const [loading, setLoading] = useState(false);
  const [confirmReject, setConfirmReject] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [pendingApprove, setPendingApprove] = useState<{
    id: string;
    type: string;
    requestedValue: string;
  } | null>(null);
  const [approvedValue, setApprovedValue] = useState("");
  const [userDetails, setUserDetails] = useState<Record<string, any>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});
  const [showPass, setShowPass] = useState<Record<string, boolean>>({});

  async function loadUserDetails(username: string) {
    if (userDetails[username] || loadingDetails[username]) return;
    setLoadingDetails((p) => ({ ...p, [username]: true }));
    try {
      const data = await fetchAdminUserDetails(username);
      setUserDetails((p) => ({ ...p, [username]: data }));
    } catch {
      /* ignore */
    } finally {
      setLoadingDetails((p) => ({ ...p, [username]: false }));
    }
  }

  async function refresh() {
    setLoading(true);
    try {
      setChangeRequests(await fetchAdminChangeRequests());
    } catch (err) {
      console.warn(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    if (!pendingApprove) return;
    try {
      await approveChangeRequest(
        pendingApprove.id,
        approvedValue || pendingApprove.requestedValue,
      );
      setPendingApprove(null);
      setApprovedValue("");
      await refresh();
      toast.success("Solicitação aprovada");
    } catch (err) {
      console.warn(err);
      toast.error("Falha ao aprovar", err instanceof Error ? err.message : undefined);
    }
  }

  async function handleReject(id: string) {
    try {
      await rejectChangeRequest(id, rejectReason.trim() || undefined);
      setConfirmReject(null);
      setRejectReason("");
      await refresh();
      toast.success("Solicitação rejeitada");
    } catch (err) {
      console.warn(err);
      toast.error("Falha ao rejeitar", err instanceof Error ? err.message : undefined);
    }
  }

  function startApprove(r: any) {
    setPendingApprove({ id: r.id, type: r.type, requestedValue: r.requested_value });
    setApprovedValue(r.requested_value);
  }

  const filtered = useMemo(() => {
    const q = state.q.trim().toLowerCase();
    return changeRequests.filter((r) => {
      if (q && !String(r.username ?? "").toLowerCase().includes(q)) return false;
      if (state.type !== "all" && r.type !== state.type) return false;
      if (state.status !== "all" && r.status !== state.status) return false;
      return true;
    });
  }, [changeRequests, state]);

  const pending = useMemo(
    () => changeRequests.filter((r) => r.status === "aguardando"),
    [changeRequests],
  );
  const approved = useMemo(
    () => changeRequests.filter((r) => r.status === "aprovado"),
    [changeRequests],
  );

  const chips = [
    state.type !== "all" && {
      id: "type",
      label: `Tipo: ${TYPE_OPTIONS.find((o) => o.value === state.type)?.label}`,
      onRemove: () => update("type", "all" as any),
    },
    state.status !== "aguardando" && {
      id: "status",
      label: `Status: ${STATUS_OPTIONS.find((o) => o.value === state.status)?.label}`,
      onRemove: () => update("status", "aguardando" as any),
    },
  ].filter(Boolean) as { id: string; label: string; onRemove: () => void }[];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
        <SectionHeader
          title="Alterações"
          subtitle={
            pending.length > 0
              ? `${pending.length} aguardando aprovação`
              : `${changeRequests.length} ${changeRequests.length === 1 ? "solicitação" : "solicitações"}`
          }
          actions={
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border-base/60 bg-bg-surface text-text-muted shadow-[var(--shadow-card-sm)] hover:bg-bg-surface-hover disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          }
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat
            label="Aguardando"
            value={String(pending.length)}
            variant={pending.length > 0 ? "warn" : "default"}
          />
          <Stat label="Aprovadas" value={String(approved.length)} variant="success" />
          <Stat label="Total" value={String(changeRequests.length)} variant="accent" />
        </div>

        <FilterBar
          search={
            <SearchInput
              value={state.q}
              onChange={(v) => update("q", v)}
              placeholder="Buscar por usuário..."
            />
          }
          filters={
            <>
              <FilterSelect
                label="Tipo"
                value={state.type}
                options={TYPE_OPTIONS as any}
                onChange={(v) => update("type", v)}
              />
              <FilterSelect
                label="Status"
                value={state.status}
                options={STATUS_OPTIONS as any}
                onChange={(v) => update("status", v)}
              />
            </>
          }
          chips={chips}
          onReset={isDirty ? reset : undefined}
          total={changeRequests.length}
          filtered={filtered.length}
        />

        {filtered.length === 0 ? (
          <Empty title={isDirty ? "Nenhuma com esse filtro" : "Nenhuma solicitação"} />
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((r: any) => {
              const ud = userDetails[r.username];
              const u = ud?.user;
              const pass = u?.senha || u?.pass || u?.password;
              const days = u ? daysLeft(u.expira) : null;
              const isCorrection = r.type === "date_correction";
              return (
                <Card key={r.id} padding="md" className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button
                        type="button"
                        className="text-sm font-bold text-text-base hover:text-primary-600"
                        onClick={() => loadUserDetails(r.username)}
                        title="Clique para ver senha e vencimento"
                      >
                        {r.username}
                        {loadingDetails[r.username] ? "..." : ""}
                      </button>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md border border-border-base/50 bg-bg-surface-hover/60 px-1.5 py-0.5 text-[11px] text-text-muted">
                          {formatDate(r.created_at)}
                        </span>
                        <Chip tone={isCorrection ? "info" : "primary"} size="sm" uppercase>
                          {typeLabel(r.type)}
                        </Chip>
                      </div>
                    </div>
                    <Chip tone={statusTone(r.status)} size="sm" uppercase>
                      {statusLabel(r.status)}
                    </Chip>
                  </div>

                  {u && (
                    <div className="flex flex-wrap gap-2">
                      <div className="inline-flex items-center gap-1.5 rounded-xl border border-border-base/40 bg-bg-surface-hover/40 px-3 py-1.5">
                        <KeyRound size={13} className="text-text-muted" />
                        <span className="font-mono text-xs font-bold text-text-base">
                          {showPass[r.username] ? (pass || "N/A") : "••••••"}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setShowPass((p) => ({ ...p, [r.username]: !p[r.username] }))
                          }
                          className="ml-0.5 text-text-muted hover:text-text-base"
                          aria-label="Mostrar/ocultar senha"
                        >
                          {showPass[r.username] ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      </div>
                      {days !== null && (
                        <div
                          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 ${
                            days <= 1
                              ? "border-danger/30 bg-danger/10"
                              : days <= 5
                                ? "border-warning/30 bg-warning/10"
                                : "border-border-base/40 bg-bg-surface-hover/40"
                          }`}
                        >
                          <Clock
                            size={13}
                            className={
                              days <= 1
                                ? "text-danger"
                                : days <= 5
                                  ? "text-warning"
                                  : "text-text-muted"
                            }
                          />
                          <span
                            className={`text-xs font-bold ${
                              days <= 1
                                ? "text-danger"
                                : days <= 5
                                  ? "text-warning"
                                  : "text-text-base"
                            }`}
                          >
                            {days < 0
                              ? "Expirado"
                              : days === 0
                                ? "Vence hoje"
                                : `${days}d restantes`}
                          </span>
                          <span className="text-[10px] text-text-muted">
                            ({u.expira?.slice(0, 10).split("-").reverse().join("/")})
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  {!u && !loadingDetails[r.username] && (
                    <button
                      type="button"
                      onClick={() => loadUserDetails(r.username)}
                      className="inline-flex w-fit items-center gap-1 text-[11px] font-medium text-primary-500 hover:text-primary-600"
                    >
                      <Eye size={12} /> Ver senha e vencimento
                    </button>
                  )}

                  <div
                    className={`rounded-xl border p-3 ${
                      isCorrection
                        ? "border-info/30 bg-info/5"
                        : "border-border-base/50 bg-bg-surface-hover/40"
                    }`}
                  >
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-text-muted">
                      {isCorrection ? "Data correta de vencimento" : "Valor solicitado"}
                    </p>
                    <p
                      className={`rounded bg-bg-surface p-1.5 text-lg font-bold ${
                        isCorrection ? "text-info" : "text-text-base"
                      }`}
                    >
                      {isCorrection
                        ? r.requested_value.split("-").reverse().join("/")
                        : r.requested_value}
                    </p>
                    {isCorrection && r.status === "aguardando" && (
                      <p className="mt-2 text-xs font-medium text-info">
                        Gerada automaticamente — cliente renovou com acesso vencido. Ajuste a data no painel VPN.
                      </p>
                    )}
                    {r.approved_value &&
                      r.approved_value !== r.requested_value &&
                      !isCorrection && (
                        <div className="mt-3">
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-text-muted">
                            Valor aprovado
                          </p>
                          <p className="rounded border border-success/20 bg-success/10 p-1.5 text-lg font-bold text-success">
                            {r.approved_value}
                          </p>
                        </div>
                      )}
                  </div>

                  {r.status === "aguardando" && (
                    <div className="flex gap-2 border-t border-border-base/50 pt-3">
                      <button
                        type="button"
                        onClick={() => startApprove(r)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm font-semibold text-success hover:bg-success/20"
                      >
                        <Check size={14} /> Aprovar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmReject(r.id)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger hover:bg-danger/20"
                      >
                        <X size={14} /> Rejeitar
                      </button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {pendingApprove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-sm" padding="md">
            <h3 className="text-sm font-bold text-text-base">
              Aprovar {typeLabel(pendingApprove.type)}
            </h3>
            <p className="mt-1 text-xs text-text-muted">
              Lembre-se de alterar no painel VPN também.
            </p>
            <div className="mt-3">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
                Valor a aprovar
              </label>
              <input
                type="text"
                value={approvedValue}
                onChange={(e) => setApprovedValue(e.target.value)}
                className="w-full rounded-xl border border-border-base/60 bg-bg-surface px-3 py-2 text-sm text-text-base outline-none focus:border-primary-500/70 focus:ring-2 focus:ring-[var(--ring-focus)]"
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingApprove(null);
                  setApprovedValue("");
                }}
                className="flex-1 rounded-lg border border-border-base/60 bg-bg-surface px-3 py-2 text-sm font-bold text-text-base hover:bg-bg-surface-hover"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApprove}
                className="flex-1 rounded-lg bg-success px-3 py-2 text-sm font-bold text-white hover:brightness-110"
              >
                Confirmar
              </button>
            </div>
          </Card>
        </div>
      )}

      {confirmReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-sm" padding="md">
            <h3 className="text-sm font-bold text-text-base">Rejeitar solicitação</h3>
            <div className="mt-3">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
                Motivo da recusa{" "}
                <span className="font-normal normal-case text-text-muted">(opcional)</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Ex: Data inválida, não disponível no período..."
                className="w-full resize-none rounded-xl border border-border-base/60 bg-bg-surface px-3 py-2 text-sm text-text-base outline-none focus:border-danger/50 focus:ring-2 focus:ring-danger/20"
                autoFocus
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmReject(null);
                  setRejectReason("");
                }}
                className="flex-1 rounded-lg border border-border-base/60 bg-bg-surface px-3 py-2 text-sm font-bold text-text-base hover:bg-bg-surface-hover"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleReject(confirmReject)}
                className="flex-1 rounded-lg bg-danger px-3 py-2 text-sm font-bold text-white hover:brightness-110"
              >
                Rejeitar
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
