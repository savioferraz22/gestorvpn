import React from "react";
import { Bell, BellOff, BellRing } from "lucide-react";

function urlBase64ToUint8Array(b64: string) {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function AdminNotifications() {
  const [permission, setPermission] = React.useState<
    NotificationPermission | "unsupported"
  >("default");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  const activate = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm === "granted") {
        const vapidRes = await fetch("/api/push/vapid-public-key");
        const { publicKey } = await vapidRes.json();
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) await existing.unsubscribe();
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: "__admin__",
            subscription: sub.toJSON(),
          }),
        });
      }
    } catch (e) {
      console.error(e);
    }
    setBusy(false);
  };

  const deactivate = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPermission("default");
    } catch (e) {
      console.error(e);
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <div className="mb-2 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-500/15 text-primary-500">
          <Bell className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-bold text-text-base">Notificações Admin</h2>
          <p className="text-xs text-text-muted">
            Receba alerts de novos tickets, solicitações e pagamentos
          </p>
        </div>
      </div>
      {permission === "unsupported" && (
        <p className="rounded-2xl bg-bg-surface-hover p-4 text-sm text-text-muted">
          Seu navegador não suporta notificações push.
        </p>
      )}
      {permission === "granted" && (
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--success)]/30 bg-[var(--success-soft)] p-4">
          <BellRing className="h-5 w-5 shrink-0 text-[var(--success)]" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--success)]">
              Notificações ativas neste dispositivo
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              Você receberá alertas de novos tickets e pagamentos.
            </p>
          </div>
          <button
            onClick={deactivate}
            disabled={busy}
            className="rounded-lg border border-[var(--danger)]/40 bg-bg-surface px-2 py-1 text-xs font-semibold text-[var(--danger)] transition-colors hover:bg-[var(--danger-soft)]"
          >
            Desativar
          </button>
        </div>
      )}
      {(permission === "default" || permission === "denied") && (
        <div className="space-y-3 rounded-2xl border border-border-base bg-bg-surface p-4">
          <div className="flex items-center gap-2">
            <BellOff className="h-5 w-5 text-text-muted" />
            <p className="text-sm font-semibold text-text-base">
              {permission === "denied"
                ? "Notificações bloqueadas pelo navegador"
                : "Notificações desativadas"}
            </p>
          </div>
          {permission === "denied" ? (
            <p className="text-xs text-text-muted">
              Acesse as configurações do navegador, encontre este site em
              Notificações e altere para <strong>Permitir</strong>.
            </p>
          ) : (
            <button
              onClick={activate}
              disabled={busy}
              className="w-full rounded-xl bg-primary-600 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
            >
              {busy ? "Ativando..." : "Ativar Notificações Admin"}
            </button>
          )}
        </div>
      )}
      <p className="rounded-xl bg-bg-surface-hover p-3 text-xs text-text-muted">
        As notificações ficam vinculadas a{" "}
        <strong>este navegador/dispositivo</strong>. Para receber em outro
        dispositivo, acesse o painel lá e ative novamente.
      </p>
    </div>
  );
}
