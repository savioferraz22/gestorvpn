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
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-500/15 text-primary-500">
          <Megaphone className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-bold text-text-base">Configurações</h2>
          <p className="text-xs text-text-muted">
            Ajustes globais que afetam todos os clientes.
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-border-base bg-bg-surface p-5 space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-text-base">Aviso global do sistema</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Aparece no dashboard, na tela de suporte e como faixa no topo dos chats.
              Quando estiver ativo, é visível para todos os clientes e não pode ser fechado.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleActive}
            disabled={saving}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
              draft.active
                ? "bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success)]/30"
                : "bg-bg-surface-hover text-text-muted border border-border-base"
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            {draft.active ? "Ativo" : "Desativado"}
          </button>
        </header>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
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
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                    selected
                      ? "border-primary-500 bg-primary-500/10 text-primary-600"
                      : "border-border-base bg-bg-surface-hover text-text-muted hover:text-text-base"
                  }`}
                >
                  <span className={`w-3 h-3 rounded-full ${opt.swatch}`} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-text-muted" htmlFor="notice-title">
            Título
          </label>
          <input
            id="notice-title"
            type="text"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="Ex.: Instabilidade no Xray"
            className="w-full rounded-xl border border-border-base bg-bg-base px-3 py-2 text-sm text-text-base placeholder:text-text-muted focus:border-primary-500 focus:outline-none"
            maxLength={120}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-text-muted" htmlFor="notice-message">
            Mensagem
          </label>
          <textarea
            id="notice-message"
            value={draft.message}
            onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value }))}
            rows={5}
            placeholder="Explique o problema ao cliente e o que ele pode fazer enquanto isso."
            className="w-full rounded-xl border border-border-base bg-bg-base px-3 py-2 text-sm text-text-base placeholder:text-text-muted focus:border-primary-500 focus:outline-none whitespace-pre-line"
            maxLength={1200}
          />
          <p className="text-[11px] text-text-muted">
            Quebras de linha são preservadas. {draft.message.length}/1200
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">
            <Eye className="w-3.5 h-3.5" /> Preview ao vivo
          </div>
          <div className="rounded-xl border border-dashed border-border-base p-3 space-y-3 bg-bg-base">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Dashboard / Suporte</p>
            <SystemNoticeBanner notice={{ ...draft, active: true }} variant="full" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted pt-2">Chat (compacto)</p>
            <div className="rounded-lg overflow-hidden border border-border-base">
              <SystemNoticeBanner notice={{ ...draft, active: true }} variant="compact" />
              <div className="px-4 py-6 text-xs text-text-muted bg-bg-base">…mensagens do chat aparecem aqui…</div>
            </div>
            {!draft.active && (
              <p className="text-[11px] text-amber-600">
                ⚠ O aviso está <strong>desativado</strong> — clientes não veem nada agora. O preview acima é só para você.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      </section>
    </div>
  );
}
