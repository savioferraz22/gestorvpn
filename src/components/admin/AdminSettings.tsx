import React from "react";
import { Megaphone, Save, Eye, Power, Loader2 } from "lucide-react";
import {
  fetchSystemNotice,
  updateSystemNotice,
  type SystemNotice,
  type SystemNoticeSeverity,
} from "../../services/api";
import { SystemNoticeBanner } from "../shared/SystemNoticeBanner";
import { useToast } from "./ui";

const SEVERITY_OPTIONS: { value: SystemNoticeSeverity; label: string; swatch: string }[] = [
  { value: "warning", label: "Alerta (amarelo)", swatch: "bg-amber-400" },
  { value: "error", label: "Urgente (vermelho)", swatch: "bg-red-500" },
  { value: "info", label: "Informativo (azul)", swatch: "bg-sky-500" },
];

export function AdminSettings() {
  const toast = useToast();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [draft, setDraft] = React.useState<SystemNotice>({
    active: false,
    title: "",
    message: "",
    severity: "warning",
    updated_at: null,
  });
  const [original, setOriginal] = React.useState<SystemNotice | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetchSystemNotice()
      .then((n) => {
        if (cancelled) return;
        setDraft(n);
        setOriginal(n);
      })
      .catch(() => {
        if (!cancelled) toast.error("Falha ao carregar aviso global.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const dirty = !!original && (
    original.active !== draft.active ||
    original.title !== draft.title ||
    original.message !== draft.message ||
    original.severity !== draft.severity
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSystemNotice({
        active: draft.active,
        title: draft.title.trim(),
        message: draft.message.trim(),
        severity: draft.severity,
      });
      const refreshed = await fetchSystemNotice();
      setDraft(refreshed);
      setOriginal(refreshed);
      toast.success(draft.active ? "Aviso publicado." : "Aviso salvo.");
    } catch (e: any) {
      toast.error("Erro ao salvar aviso", e?.message || "");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    const next = { ...draft, active: !draft.active };
    setDraft(next);
    setSaving(true);
    try {
      await updateSystemNotice({
        active: next.active,
        title: next.title.trim(),
        message: next.message.trim(),
        severity: next.severity,
      });
      const refreshed = await fetchSystemNotice();
      setDraft(refreshed);
      setOriginal(refreshed);
      toast.success(next.active ? "Aviso ativado." : "Aviso desativado.");
    } catch (e: any) {
      setDraft(draft); // revert
      toast.error("Erro ao alternar aviso", e?.message || "");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando configurações…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-2.5">
        <Megaphone className="h-4 w-4 text-primary-600" />
        <div>
          <h2 className="font-bold text-text-base tracking-tight">Configurações</h2>
          <p className="text-xs text-text-muted">
            Ajustes globais que afetam todos os clientes.
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-border-base bg-bg-surface p-4 sm:p-5 space-y-4">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-text-base">Aviso global do sistema</h3>
            <p className="text-xs text-text-muted mt-0.5 leading-snug">
              Aparece no dashboard, suporte e como faixa no topo dos chats. Quando ativo, é visível para todos os clientes e não pode ser fechado.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleActive}
            disabled={saving}
            className={`flex items-center gap-1.5 rounded-md px-2.5 h-8 text-xs font-bold transition-colors disabled:opacity-50 ${
              draft.active
                ? "bg-success-soft text-success border border-success/30"
                : "bg-bg-surface-hover text-text-muted border border-border-base"
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            {draft.active ? "Ativo" : "Desativado"}
          </button>
        </header>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
            Severidade
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {SEVERITY_OPTIONS.map((opt) => {
              const selected = draft.severity === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, severity: opt.value }))}
                  className={`flex items-center gap-2 rounded-md border px-3 h-9 text-xs font-bold transition-colors ${
                    selected
                      ? "border-primary-500 bg-primary-500/10 text-primary-600"
                      : "border-border-base bg-bg-surface-hover text-text-muted hover:text-text-base"
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${opt.swatch}`} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted" htmlFor="notice-title">
            Título
          </label>
          <input
            id="notice-title"
            type="text"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="Ex: Instabilidade no Xray"
            className="w-full rounded-md border border-border-base bg-bg-base px-3 h-10 text-sm text-text-base font-medium placeholder:text-text-muted focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 outline-none transition-colors"
            maxLength={120}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted" htmlFor="notice-message">
            Mensagem
          </label>
          <textarea
            id="notice-message"
            value={draft.message}
            onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value }))}
            rows={5}
            placeholder="Explique o problema ao cliente e o que ele pode fazer."
            className="w-full rounded-md border border-border-base bg-bg-base px-3 py-2.5 text-sm text-text-base font-medium placeholder:text-text-muted focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 outline-none transition-colors whitespace-pre-line"
            maxLength={1200}
          />
          <p className="text-[11px] text-text-muted font-mono">
            Quebras de linha preservadas · {draft.message.length}/1200
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
            <Eye className="w-3.5 h-3.5" /> Preview ao vivo
          </div>
          <div className="rounded-md border border-dashed border-border-base p-3 space-y-3 bg-bg-base">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Dashboard / Suporte</p>
            <SystemNoticeBanner notice={{ ...draft, active: true }} variant="full" />
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted pt-2">Chat (compacto)</p>
            <div className="rounded-md overflow-hidden border border-border-base">
              <SystemNoticeBanner notice={{ ...draft, active: true }} variant="compact" />
              <div className="px-4 py-6 text-xs text-text-muted bg-bg-base">…mensagens do chat aparecem aqui…</div>
            </div>
            {!draft.active && (
              <p className="text-[11px] text-warning font-bold">
                O aviso está desativado — clientes não veem nada agora. Preview só para você.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-10 text-sm font-bold text-white transition-colors hover:bg-primary-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      </section>
    </div>
  );
}
