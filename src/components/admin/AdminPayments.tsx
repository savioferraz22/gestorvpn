import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Smartphone,
  User,
  X,
} from "lucide-react";
import {
  fetchAdminPayments,
  fetchAdminUserDetails,
  retryPaymentApplication,
  retryFailedPayments,
  getAdminToken,
} from "../../services/api";
import { Card, Chip, DataTable, SectionHeader, Stat, type Column } from "./ui";
import {
  DateRangePicker,
  FilterBar,
  FilterSelect,
  SearchInput,
  dateInRange,
  useUrlState,
  type DateRange,
} from "./filters";

interface Props {
  payments: any[];
  setPayments: (p: any[]) => void;
}

function formatDateTime(s: string | undefined) {
  if (!s) return "—";
  let iso = s;
  if (iso.includes(" ") && !iso.includes("T")) {
    iso = iso.replace(" ", "T");
    if (!iso.endsWith("Z")) iso += "Z";
  }
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(s: string | undefined) {
  if (!s) return "—";
  let iso = s;
  if (iso.includes(" ") && !iso.includes("T")) {
    iso = iso.replace(" ", "T");
    if (!iso.endsWith("Z")) iso += "Z";
  }
  return new Date(iso).toLocaleDateString("pt-BR");
}

function daysLeft(expira: string | undefined) {
  if (!expira) return null;
  const exp = new Date(expira);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);
  return Math.round((exp.getTime() - today.getTime()) / 86400000);
}

function getAmount(p: any): number {
  try {
    const m = p.metadata
      ? typeof p.metadata === "string"
        ? JSON.parse(p.metadata)
        : p.metadata
      : null;
    if (m) return Number(m.amount || 0);
  } catch {
    /* ignore */
  }
  return Number(p.amount || 0);
}

function typeLabel(t: string | undefined): string {
  switch (t) {
    case "new_device":
      return "Novo Aparelho";
    case "reseller_hire":
      return "Nova Revenda";
    case "reseller_renewal":
      return "Renov. Revenda";
    case "reseller_logins_increase":
      return "Logins Revenda";
    default:
      return "Renovação";
  }
}

const STATUS_OPTIONS = [
  { value: "all", label: "Todos status" },
  { value: "approved", label: "Aprovados" },
  { value: "pending", label: "Pendentes" },
  { value: "rejected", label: "Rejeitados" },
] as const;

const VPN_OPTIONS = [
  { value: "all", label: "Todos VPN" },
  { value: "applied", label: "Aplicados" },
  { value: "failed", label: "Falha VPN" },
  { value: "pending", label: "VPN pendente" },
] as const;

const TYPE_OPTIONS = [
  { value: "all", label: "Todos tipos" },
  { value: "new_device", label: "Novo Aparelho" },
  { value: "renewal", label: "Renovação" },
  { value: "reseller_hire", label: "Nova Revenda" },
  { value: "reseller_renewal", label: "Renov. Revenda" },
  { value: "reseller_logins_increase", label: "Logins Revenda" },
] as const;

export function AdminPayments({ payments, setPayments }: Props) {
  const { state, update, reset, isDirty } = useUrlState("payments", {
    q: "",
    status: "all" as (typeof STATUS_OPTIONS)[number]["value"],
    vpn: "all" as (typeof VPN_OPTIONS)[number]["value"],
    type: "all" as (typeof TYPE_OPTIONS)[number]["value"],
    from: "" as string,
    to: "" as string,
  });
  const dateRange: DateRange = { from: state.from || null, to: state.to || null };

  const [loading, setLoading] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessMsg, setReprocessMsg] = useState("");
  const [viewUser, setViewUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState("");
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryMsg, setRetryMsg] = useState<{
    id: string;
    msg: string;
    ok: boolean;
  } | null>(null);
  const [retryingBulk, setRetryingBulk] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setPayments(await fetchAdminPayments());
    } catch (err) {
      console.warn(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRetry(paymentId: string) {
    setRetryingId(paymentId);
    setRetryMsg(null);
    try {
      const r = await retryPaymentApplication(paymentId);
      setRetryMsg({
        id: paymentId,
        msg: r.ok ? "Reaplicado!" : r.message || "Processado.",
        ok: !!r.ok,
      });
      await refresh();
    } catch (err: any) {
      setRetryMsg({ id: paymentId, msg: err.message || "Erro ao reaplicar", ok: false });
    } finally {
      setRetryingId(null);
    }
  }

  async function handleRetryAll() {
    setRetryingBulk(true);
    setReprocessMsg("");
    try {
      const r = await retryFailedPayments();
      setReprocessMsg(r.message || `${r.processed ?? 0} pagamento(s) reprocessado(s).`);
      await refresh();
    } catch (err: any) {
      setReprocessMsg(err.message || "Erro ao reprocessar falhas");
    } finally {
      setRetryingBulk(false);
    }
  }

  async function reprocessCancelled() {
    setReprocessing(true);
    setReprocessMsg("");
    try {
      const token = getAdminToken();
      const res = await fetch("/api/admin/payments/reprocess-cancelled", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setReprocessMsg(data.message || "Concluído");
      if (data.recovered > 0) await refresh();
    } catch {
      setReprocessMsg("Erro ao reprocessar");
    } finally {
      setReprocessing(false);
    }
  }

  async function handleViewUser(username: string) {
    setLoadingUser(username);
    try {
      const data = await fetchAdminUserDetails(username);
      setViewUser(data);
    } catch (err) {
      console.warn(err);
    } finally {
      setLoadingUser("");
    }
  }

  const filtered = useMemo(() => {
    const q = state.q.trim().toLowerCase();
    return payments.filter((p) => {
      if (q && !String(p.username || "").toLowerCase().includes(q) && !String(p.id || "").includes(q))
        return false;
      if (state.status !== "all" && p.status !== state.status) return false;
      if (state.type !== "all") {
        if (state.type === "renewal") {
          if (
            p.type &&
            p.type !== "renewal" &&
            !String(p.type).startsWith("renew")
          )
            return false;
        } else if (p.type !== state.type) return false;
      }
      if (state.vpn !== "all") {
        if ((p.vpnApplicationStatus ?? "none") !== state.vpn) return false;
      }
      if (dateRange.from || dateRange.to) {
        const when = p.paid_at || p.created_at;
        if (!dateInRange(when, dateRange)) return false;
      }
      return true;
    });
  }, [payments, state, dateRange]);

  const approved = filtered.filter((p) => p.status === "approved");
  const pending = filtered.filter((p) => p.status === "pending");
  const vpnFailed = filtered.filter((p) => p.vpnApplicationStatus === "failed");
  const totalRevenue = approved.reduce((acc, p) => acc + getAmount(p), 0);

  function exportCsv() {
    const header = [
      "id",
      "username",
      "type",
      "amount",
      "status",
      "vpn_status",
      "paid_at",
      "created_at",
    ];
    const rows = filtered.map((p) => [
      p.id,
      p.username,
      p.type ?? "",
      getAmount(p).toFixed(2),
      p.status ?? "",
      p.vpnApplicationStatus ?? "",
      p.paid_at ?? "",
      p.created_at ?? "",
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell ?? "");
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pagamentos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const chips = [
    state.status !== "all" && {
      id: "status",
      label: `Status: ${STATUS_OPTIONS.find((o) => o.value === state.status)?.label}`,
      onRemove: () => update("status", "all"),
    },
    state.type !== "all" && {
      id: "type",
      label: `Tipo: ${TYPE_OPTIONS.find((o) => o.value === state.type)?.label}`,
      onRemove: () => update("type", "all"),
    },
    state.vpn !== "all" && {
      id: "vpn",
      label: `VPN: ${VPN_OPTIONS.find((o) => o.value === state.vpn)?.label}`,
      onRemove: () => update("vpn", "all"),
    },
    (dateRange.from || dateRange.to) && {
      id: "date",
      label: `Período: ${dateRange.from ?? "..."} → ${dateRange.to ?? "..."}`,
      onRemove: () => {
        update("from", "");
        update("to", "");
      },
    },
  ].filter(Boolean) as { id: string; label: string; onRemove: () => void }[];

  const columns: Column<any>[] = [
    {
      id: "username",
      header: "Usuário",
      accessor: (p) => p.username,
      cell: (p) => (
        <div className="flex flex-col">
          <span className="font-semibold text-text-base">{p.username}</span>
          <span className="text-[10px] font-mono text-text-muted">
            {String(p.id).slice(0, 8)}
          </span>
        </div>
      ),
    },
    {
      id: "type",
      header: "Tipo",
      accessor: (p) => typeLabel(p.type),
      cell: (p) => (
        <Chip tone="default" size="sm" uppercase>
          {typeLabel(p.type)}
        </Chip>
      ),
    },
    {
      id: "amount",
      header: "Valor",
      align: "right",
      accessor: (p) => getAmount(p),
      cell: (p) => (
        <span className="font-bold text-text-base tabular-nums">
          R$ {getAmount(p).toFixed(2).replace(".", ",")}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      accessor: (p) => p.status,
      cell: (p) => {
        const tone =
          p.status === "approved"
            ? "success"
            : p.status === "pending"
              ? "warning"
              : "danger";
        return (
          <Chip tone={tone} size="sm" uppercase>
            {p.status === "approved"
              ? "Aprovado"
              : p.status === "pending"
                ? "Pendente"
                : p.status}
          </Chip>
        );
      },
    },
    {
      id: "vpn",
      header: "VPN",
      accessor: (p) => p.vpnApplicationStatus ?? "",
      cell: (p) => {
        const s = p.vpnApplicationStatus as string | undefined;
        const counts = p.vpnAttemptCounts || { success: 0, failed: 0, pending: 0 };
        if (s === "applied")
          return (
            <Chip tone="success" size="sm">
              <CheckCircle2 size={10} /> {counts.success}
            </Chip>
          );
        if (s === "failed")
          return (
            <Chip tone="danger" size="sm">
              <AlertCircle size={10} /> {counts.failed}
            </Chip>
          );
        if (s === "pending")
          return (
            <Chip tone="warning" size="sm">
              <Clock size={10} /> pendente
            </Chip>
          );
        return <span className="text-[10px] text-text-muted">—</span>;
      },
    },
    {
      id: "when",
      header: "Data",
      accessor: (p) => p.paid_at || p.created_at,
      cell: (p) => (
        <span className="text-xs text-text-muted">
          {formatDateTime(p.paid_at || p.created_at)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      sortable: false,
      align: "right",
      cell: (p) => {
        const canRetry =
          (p.vpnApplicationStatus === "failed" || p.vpnApplicationStatus === "pending") &&
          p.status === "approved";
        const msg = retryMsg?.id === p.id ? retryMsg : null;
        return (
          <div className="flex items-center justify-end gap-1">
            {canRetry && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRetry(p.id);
                }}
                disabled={retryingId === p.id}
                className="inline-flex items-center gap-1 rounded-lg border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success hover:bg-success/20 disabled:opacity-50"
              >
                <RotateCw
                  size={11}
                  className={retryingId === p.id ? "animate-spin" : ""}
                />
                {retryingId === p.id ? "..." : "Reaplicar"}
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleViewUser(p.username);
              }}
              disabled={loadingUser === p.username}
              className="inline-flex items-center gap-1 rounded-lg border border-primary-500/30 bg-primary-500/10 px-2 py-0.5 text-[11px] font-semibold text-primary-600 hover:bg-primary-500/20 disabled:opacity-50"
            >
              <User size={11} />
              {loadingUser === p.username ? "..." : "Ver"}
            </button>
            {msg && (
              <span
                className={`text-[10px] font-semibold ${
                  msg.ok ? "text-success" : "text-danger"
                }`}
              >
                {msg.msg}
              </span>
            )}
          </div>
        );
      },
    },
  ];

  const vu = viewUser?.user;
  const vuDays = vu ? daysLeft(vu.expira) : null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 sm:p-6">
        <SectionHeader
          title="Pagamentos"
          subtitle={`${filtered.length} ${filtered.length === 1 ? "pagamento" : "pagamentos"} ${isDirty ? "(filtrados)" : ""}`}
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportCsv}
                disabled={filtered.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border-base/60 bg-bg-surface px-2.5 py-1.5 text-xs font-semibold text-text-base shadow-[var(--shadow-card-sm)] hover:bg-bg-surface-hover disabled:opacity-50"
                title="Baixar CSV dos pagamentos filtrados"
              >
                <Download size={13} /> CSV
              </button>
              <button
                type="button"
                onClick={handleRetryAll}
                disabled={retryingBulk || vpnFailed.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl border border-success/30 bg-success/10 px-2.5 py-1.5 text-xs font-semibold text-success hover:bg-success/20 disabled:opacity-50"
                title="Reprocessar automaticamente todas as aplicações VPN com falha"
              >
                <RotateCw size={13} className={retryingBulk ? "animate-spin" : ""} />
                Reaplicar VPN ({vpnFailed.length})
              </button>
              <button
                type="button"
                onClick={reprocessCancelled}
                disabled={reprocessing}
                className="inline-flex items-center gap-1.5 rounded-xl border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs font-semibold text-warning hover:bg-warning/20 disabled:opacity-50"
                title="Recuperar pagamentos cancelados que foram pagos no MP"
              >
                <RotateCcw size={13} className={reprocessing ? "animate-spin" : ""} />
                {reprocessing ? "..." : "Recuperar"}
              </button>
              <button
                type="button"
                onClick={refresh}
                disabled={loading}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border-base/60 bg-bg-surface text-text-muted shadow-[var(--shadow-card-sm)] hover:bg-bg-surface-hover disabled:opacity-50"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          }
        />

        {reprocessMsg && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
            {reprocessMsg}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Aprovados"
            value={String(approved.length)}
            variant="success"
          />
          <Stat label="Pendentes" value={String(pending.length)} variant="warn" />
          <Stat
            label="Falha VPN"
            value={String(vpnFailed.length)}
            variant={vpnFailed.length > 0 ? "danger" : "default"}
          />
          <Stat
            label="Receita filtrada"
            value={`R$ ${totalRevenue.toFixed(2).replace(".", ",")}`}
            variant="accent"
          />
        </div>

        <FilterBar
          search={
            <SearchInput
              value={state.q}
              onChange={(v) => update("q", v)}
              placeholder="Buscar por usuário ou ID..."
            />
          }
          filters={
            <>
              <FilterSelect
                label="Status"
                value={state.status}
                options={STATUS_OPTIONS as any}
                onChange={(v) => update("status", v)}
              />
              <FilterSelect
                label="Tipo"
                value={state.type}
                options={TYPE_OPTIONS as any}
                onChange={(v) => update("type", v)}
              />
              <FilterSelect
                label="VPN"
                value={state.vpn}
                options={VPN_OPTIONS as any}
                onChange={(v) => update("vpn", v)}
              />
              <DateRangePicker
                value={dateRange}
                onChange={(r) => {
                  update("from", r.from ?? "");
                  update("to", r.to ?? "");
                }}
              />
            </>
          }
          chips={chips}
          onReset={isDirty ? reset : undefined}
          total={payments.length}
          filtered={filtered.length}
        />

        <DataTable
          rows={filtered}
          columns={columns}
          getRowId={(p) => p.id}
          loading={loading}
          emptyTitle="Nenhum pagamento"
          emptyDescription={
            isDirty
              ? "Tente ajustar os filtros para ver mais resultados."
              : "Ainda não há pagamentos registrados."
          }
          density="compact"
          pageSize={25}
          initialSort={{ id: "when", dir: "desc" }}
        />
      </div>

      {viewUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="flex max-h-[85vh] w-full max-w-sm flex-col gap-4 overflow-y-auto" padding="md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/10 text-primary-600">
                  <User size={18} />
                </div>
                <div>
                  <p className="font-bold text-text-base">{vu?.login ?? "—"}</p>
                  <p className="text-xs text-text-muted">
                    {vuDays === null
                      ? "—"
                      : vuDays < 0
                        ? "Expirado"
                        : vuDays === 0
                          ? "Vence hoje"
                          : `${vuDays}d restantes`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewUser(null)}
                className="rounded-xl p-1.5 text-text-muted hover:bg-bg-surface-hover"
              >
                <X size={16} />
              </button>
            </div>

            {vu && (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-border-base/50 bg-bg-surface-hover/40 p-3">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-text-muted">
                    Vencimento
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Clock
                      size={13}
                      className={
                        vuDays !== null && vuDays < 0
                          ? "text-danger"
                          : vuDays !== null && vuDays <= 3
                            ? "text-warning"
                            : "text-text-muted"
                      }
                    />
                    <p className="text-sm font-bold text-text-base">
                      {formatDate(vu.expira)}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-border-base/50 bg-bg-surface-hover/40 p-3">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-text-muted">
                    Pagamentos
                  </p>
                  <div className="flex items-center gap-1.5">
                    <CreditCard size={13} className="text-text-muted" />
                    <p className="text-sm font-bold text-text-base">
                      {(viewUser.payments || []).filter(
                        (p: any) => p.status === "approved",
                      ).length}{" "}
                      aprovados
                    </p>
                  </div>
                </div>
              </div>
            )}

            {viewUser.plan && (
              <div className="rounded-xl border border-primary-500/20 bg-primary-500/5 p-3">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-primary-600">
                  Plano atual
                </p>
                <p className="text-sm font-bold text-primary-600">
                  {viewUser.plan.plan_months}{" "}
                  {viewUser.plan.plan_months === 1 ? "mês" : "meses"} ·{" "}
                  {viewUser.plan.plan_devices}{" "}
                  {viewUser.plan.plan_devices === 1 ? "aparelho" : "aparelhos"} · R${" "}
                  {viewUser.plan.plan_price}
                </p>
              </div>
            )}

            {viewUser.groupMembers?.length > 0 && (
              <div>
                <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-text-muted">
                  <Smartphone size={13} /> Outros aparelhos do plano
                </p>
                <div className="space-y-1.5">
                  {viewUser.groupMembers.map((m: any) => (
                    <div
                      key={m.username}
                      className="flex items-center justify-between rounded-xl border border-border-base/50 bg-bg-surface-hover/40 px-3 py-2"
                    >
                      <span className="text-sm font-bold text-text-base">
                        {m.username}
                      </span>
                      <span className="text-xs text-text-muted">
                        {m.expira ? formatDate(m.expira) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
