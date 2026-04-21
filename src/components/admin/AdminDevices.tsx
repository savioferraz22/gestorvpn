import { useMemo, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import {
  fetchAdminDevices,
  deleteAdminDevice,
  deleteAllAdminDevices,
} from "../../services/api";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { DataTable, SectionHeader, Stat, type Column } from "./ui";
import { FilterBar, SearchInput, useUrlState } from "./filters";

interface Props {
  devices: any[];
  setDevices: (d: any[]) => void;
}

function formatDate(s: string | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminDevices({ devices, setDevices }: Props) {
  const { state, update, reset, isDirty } = useUrlState("devices", { q: "" });
  const [loading, setLoading] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setDevices(await fetchAdminDevices());
    } catch (err) {
      console.warn("Failed to fetch devices:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(deviceId: string) {
    try {
      await deleteAdminDevice(deviceId);
      setDevices(devices.filter((d) => d.device_id !== deviceId));
    } catch (err) {
      console.warn("Delete device error:", err);
    }
  }

  async function handleClearAll() {
    try {
      await deleteAllAdminDevices();
      setDevices([]);
    } catch (err) {
      console.warn("Clear all devices error:", err);
    }
  }

  const filtered = useMemo(() => {
    const q = state.q.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter(
      (d) =>
        String(d.username ?? "").toLowerCase().includes(q) ||
        String(d.device_id ?? "").toLowerCase().includes(q),
    );
  }, [devices, state.q]);

  const uniqueUsers = useMemo(
    () => new Set(devices.map((d) => d.username)).size,
    [devices],
  );

  const columns: Column<any>[] = [
    {
      id: "username",
      header: "Usuário",
      accessor: (d) => d.username,
      cell: (d) => (
        <span className="font-semibold text-text-base">{d.username}</span>
      ),
    },
    {
      id: "device_id",
      header: "Device ID",
      accessor: (d) => d.device_id,
      cell: (d) => (
        <span
          className="inline-block max-w-[16rem] truncate rounded bg-bg-surface-hover/60 px-1.5 py-0.5 font-mono text-[11px] text-text-muted"
          title={d.device_id}
        >
          {d.device_id}
        </span>
      ),
    },
    {
      id: "created_at",
      header: "Registrado em",
      accessor: (d) => d.created_at,
      cell: (d) => (
        <span className="text-xs text-text-muted">{formatDate(d.created_at)}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      sortable: false,
      align: "right",
      cell: (d) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmDelete(d.device_id);
          }}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20"
          aria-label="Remover"
          title="Remover aparelho"
        >
          <Trash2 size={13} />
        </button>
      ),
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 sm:p-6">
        <SectionHeader
          title="Aparelhos"
          subtitle={`${filtered.length} ${filtered.length === 1 ? "aparelho" : "aparelhos"}${isDirty ? " (filtrados)" : ""}`}
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                disabled={devices.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-xs font-semibold text-danger hover:bg-danger/20 disabled:opacity-50"
              >
                <Trash2 size={13} /> Limpar todos
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

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Total" value={String(devices.length)} variant="accent" />
          <Stat label="Usuários únicos" value={String(uniqueUsers)} variant="info" />
          <Stat
            label="Resultados"
            value={String(filtered.length)}
            variant={isDirty ? "success" : "default"}
          />
        </div>

        <FilterBar
          search={
            <SearchInput
              value={state.q}
              onChange={(v) => update("q", v)}
              placeholder="Buscar por usuário ou device ID..."
            />
          }
          onReset={isDirty ? reset : undefined}
          total={devices.length}
          filtered={filtered.length}
        />

        <DataTable
          rows={filtered}
          columns={columns}
          getRowId={(d) => d.device_id}
          loading={loading}
          emptyTitle={isDirty ? "Nenhum aparelho com esse filtro" : "Nenhum aparelho"}
          density="compact"
          pageSize={50}
          initialSort={{ id: "created_at", dir: "desc" }}
        />
      </div>

      <ConfirmDialog
        isOpen={confirmClear}
        title="Limpar todos"
        message="Tem certeza que deseja apagar todos os registros de aparelhos?"
        onConfirm={handleClearAll}
        onCancel={() => setConfirmClear(false)}
      />
      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Remover aparelho"
        message="Remover este aparelho da lista?"
        onConfirm={() => {
          if (confirmDelete) handleDelete(confirmDelete);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
