import { useMemo, useState } from "react";
import { Check, Copy, RefreshCw, X } from "lucide-react";
import { approveRefund, fetchAdminRefunds, rejectRefund } from "../../services/api";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { Card, Chip, Empty, SectionHeader, Stat, useToast } from "./ui";
import { FilterBar, FilterSelect, SearchInput, useUrlState } from "./filters";

interface Props {
  refunds: any[];
  setRefunds: (r: any[]) => void;
}

function formatDate(s: string | undefined) {
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

const STATUS_OPTIONS = [
  { value: "all", label: "Todos status" },
  { value: "aguardando", label: "Aguardando" },
  { value: "realizado", label: "Realizado" },
  { value: "rejeitado", label: "Rejeitado" },
] as const;

type StatusValue = (typeof STATUS_OPTIONS)[number]["value"];

function statusTone(s: string): "success" | "warning" | "danger" | "default" {
  if (s === "realizado") return "success";
  if (s === "aguardando") return "warning";
  if (s === "rejeitado") return "danger";
  return "default";
}

function statusLabel(s: string): string {
  if (s === "realizado") return "Realizado";
  if (s === "aguardando") return "Aguardando";
  if (s === "rejeitado") return "Rejeitado";
  return s;
}

export function AdminRefunds({ refunds, setRefunds }: Props) {
  const toast = useToast();
  const { state, update, reset, isDirty } = useUrlState("refunds", {
    q: "",
    status: "all" as StatusValue,
  });

  const [loading, setLoading] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [refundDateTime, setRefundDateTime] = useState("");
  const [confirmReject, setConfirmReject] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setRefunds(await fetchAdminRefunds());
    } catch (err) {
      console.warn(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(id: string) {
    if (!refundDateTime) return;
    try {
      await approveRefund(id, new Date(refundDateTime).toISOString());
      setApprovingId(null);
      await refresh();
      toast.success("Reembolso aprovado");
    } catch (err) {
      console.warn(err);
      toast.error("Falha ao aprovar", err instanceof Error ? err.message : undefined);
    }
  }

  async function handleReject(id: string) {
    try {
      await rejectRefund(id);
      await refresh();
      toast.success("Reembolso rejeitado");
    } catch (err) {
      console.warn(err);
      toast.error("Falha ao rejeitar", err instanceof Error ? err.message : undefined);
    }
  }

  function copyKey(key: string) {
    try {
      navigator.clipboard.writeText(key);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((v) => (v === key ? null : v)), 1500);
    } catch {
      /* ignore */
    }
  }

  const filtered = useMemo(() => {
    const q = state.q.trim().toLowerCase();
    return refunds.filter((r) => {
      if (q && !String(r.username ?? "").toLowerCase().includes(q)) return false;
      if (state.status !== "all" && r.status !== state.status) return false;
      return true;
    });
  }, [refunds, state]);

  const pending = useMemo(
    () => refunds.filter((r) => r.status === "aguardando"),
    [refunds],
  );
  const done = useMemo(
    () => refunds.filter((r) => r.status === "realizado"),
    [refunds],
  );

  const chips = [
    state.status !== "all" && {
      id: "status",
      label: `Status: ${STATUS_OPTIONS.find((o) => o.value === state.status)?.label}`,
      onRemove: () => update("status", "all" as StatusValue),
    },
  ].filter(Boolean) as { id: string; label: string; onRemove: () => void }[];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
        <SectionHeader
          title="Reembolsos"
          subtitle={
            pending.length > 0
              ? `${pending.length} aguardando aprovação`
              : `${refunds.length} ${refunds.length === 1 ? "solicitação" : "solicitações"}`
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
          <Stat label="Realizados" value={String(done.length)} variant="success" />
          <Stat label="Total" value={String(refunds.length)} variant="accent" />
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
            <FilterSelect
              label="Status"
              value={state.status}
              options={STATUS_OPTIONS as any}
              onChange={(v) => update("status", v)}
            />
          }
          chips={chips}
          onReset={isDirty ? reset : undefined}
          total={refunds.length}
          filtered={filtered.length}
        />

        {filtered.length === 0 ? (
          <Empty
            title={isDirty ? "Nenhuma com esse filtro" : "Nenhuma solicitação"}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((r: any) => {
              const tone = statusTone(r.status);
              const isApproving = approvingId === r.id;
              return (
                <Card key={r.id} padding="md" className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-text-base">{r.username}</p>
                      <p className="mt-0.5 text-[11px] text-text-muted">
                        {formatDate(r.created_at)}
                      </p>
                    </div>
                    <Chip tone={tone} size="sm" uppercase>
                      {statusLabel(r.status)}
                    </Chip>
                  </div>

                  <div className="rounded-xl border border-border-base/50 bg-bg-surface-hover/40 p-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-text-muted">
                      Dados para PIX
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-md border border-border-base/50 bg-bg-surface px-2 py-1">
                        <span className="text-text-muted">Tipo:</span>{" "}
                        <span className="font-bold text-text-base">{r.pix_type}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md border border-border-base/50 bg-bg-surface px-2 py-1">
                        <span className="text-text-muted">Chave:</span>
                        <span className="break-all font-bold text-text-base">
                          {r.pix_key}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyKey(r.pix_key)}
                          className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded hover:bg-bg-surface-hover"
                          aria-label="Copiar chave"
                        >
                          {copiedKey === r.pix_key ? (
                            <Check size={12} className="text-success" />
                          ) : (
                            <Copy size={12} className="text-text-muted" />
                          )}
                        </button>
                      </span>
                    </div>
                    {r.refunded_at && (
                      <p className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-success">
                        <RefreshCw size={12} /> Realizado em {formatDate(r.refunded_at)}
                      </p>
                    )}
                  </div>

                  {r.status === "aguardando" && (
                    <div className="border-t border-border-base/50 pt-3">
                      {isApproving ? (
                        <div className="flex flex-col gap-2 rounded-xl border border-border-base/50 bg-bg-surface-hover/40 p-3">
                          <label className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                            Data e hora do reembolso
                          </label>
                          <input
                            type="datetime-local"
                            value={refundDateTime}
                            onChange={(e) => setRefundDateTime(e.target.value)}
                            className="rounded-lg border border-border-base/60 bg-bg-surface px-2.5 py-2 text-sm text-text-base outline-none focus:border-primary-500/70 focus:ring-2 focus:ring-[var(--ring-focus)]"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleApprove(r.id)}
                              disabled={!refundDateTime}
                              className="flex-1 rounded-lg bg-success px-3 py-2 text-sm font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-50"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() => setApprovingId(null)}
                              className="flex-1 rounded-lg border border-border-base/60 bg-bg-surface px-3 py-2 text-sm font-bold text-text-base hover:bg-bg-surface-hover"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setApprovingId(r.id);
                              const now = new Date();
                              now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                              setRefundDateTime(now.toISOString().slice(0, 16));
                            }}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm font-semibold text-success hover:bg-success/20"
                          >
                            <Check size={14} /> Marcar como realizado
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
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!confirmReject}
        title="Rejeitar reembolso"
        message="Rejeitar esta solicitação de reembolso?"
        onConfirm={() => {
          if (confirmReject) handleReject(confirmReject);
        }}
        onCancel={() => setConfirmReject(null)}
      />
    </div>
  );
}
