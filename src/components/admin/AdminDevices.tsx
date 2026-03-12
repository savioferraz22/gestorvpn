import React, { useState } from "react";
import { Trash2, RefreshCw, Search } from "lucide-react";
import { fetchAdminDevices, deleteAdminDevice, deleteAllAdminDevices } from "../../services/api";
import { ConfirmDialog } from "../shared/ConfirmDialog";

interface Props {
  devices: any[];
  setDevices: (d: any[]) => void;
}

export function AdminDevices({ devices, setDevices }: Props) {
  const [search, setSearch] = useState("");
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
      setDevices(devices.filter(d => d.device_id !== deviceId));
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

  const filtered = search
    ? devices.filter(d => d.username?.toLowerCase().includes(search.toLowerCase()))
    : devices;

  return (
    <div className="flex flex-col flex-1 overflow-hidden p-5 space-y-4">
      <div className="flex items-center justify-between shrink-0">
        <h2 className="font-bold text-text-base">Aparelhos ({devices.length})</h2>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            disabled={loading}
            className="p-2 rounded-xl border border-border-base/50 hover:bg-bg-surface-hover transition-colors active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 text-text-muted ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setConfirmClear(true)}
            className="flex items-center gap-1.5 text-xs bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 px-3 py-2 rounded-xl font-bold transition-colors active:scale-95 uppercase tracking-wider"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpar Todos
          </button>
        </div>
      </div>

      <div className="relative shrink-0">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filtrar por usuário..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border-base text-sm outline-none focus:ring-2 focus:ring-primary-500/50 bg-bg-surface font-medium"
        />
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {filtered.length === 0 ? (
          <div className="bg-bg-surface/50 border border-border-base/50 p-6 rounded-2xl text-center">
            <p className="text-sm font-medium text-text-muted">
              {search ? "Nenhum aparelho com esse usuário." : "Nenhum aparelho registrado."}
            </p>
          </div>
        ) : (
          filtered.map((d: any) => (
            <div key={d.device_id} className="bg-bg-surface border border-border-base/50 p-4 rounded-2xl flex justify-between items-center shadow-sm hover:shadow-md transition-shadow">
              <div className="overflow-hidden">
                <p className="text-sm font-bold text-text-base truncate">{d.username}</p>
                <p className="text-[11px] font-mono font-medium text-text-muted mt-1 bg-bg-surface-hover inline-block px-1.5 py-0.5 rounded border border-border-base/50" title={d.device_id}>
                  ID: {(d.device_id || "").substring(0, 16)}...
                </p>
              </div>
              <button
                onClick={() => setConfirmDelete(d.device_id)}
                className="text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 p-2.5 rounded-xl transition-colors shadow-sm active:scale-95 flex-shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmClear}
        title="Limpar Todos"
        message="Tem certeza que deseja apagar todos os registros de aparelhos?"
        onConfirm={handleClearAll}
        onCancel={() => setConfirmClear(false)}
      />
      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Remover Aparelho"
        message="Remover este aparelho da lista?"
        onConfirm={() => { if (confirmDelete) handleDelete(confirmDelete); }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
