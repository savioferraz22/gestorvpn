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
      <div className="flex items-center gap-2.5">
        <Bell className="h-4 w-4 text-primary-600" />
        <div>
          <h2 className="font-bold text-text-base tracking-tight">Notificações admin</h2>
          <p className="text-xs text-text-muted">
            Alertas de novos tickets, solicitações e pagamentos
          </p>
        </div>
      </div>
      {permission === "unsupported" && (
        <p className="rounded-md border border-border-base bg-bg-surface-hover p-3 text-sm text-text-muted">
          Seu navegador não suporta notificações push.
        </p>
      )}
      {permission === "granted" && (
        <div className="flex items-center gap-3 rounded-md border border-success/30 bg-success-soft p-3">
          <BellRing className="h-4 w-4 shrink-0 text-success" />
          <div className="flex-1">
            <p className="text-sm font-bold text-success">
              Notificações ativas neste dispositivo
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              Você receberá alertas de novos tickets e pagamentos.
            </p>
          </div>
          <button
            onClick={deactivate}
            disabled={busy}
            className="rounded-md px-2.5 h-8 text-xs font-bold text-danger transition-colors hover:bg-danger-soft"
          >
            Desativar
          </button>
        </div>
      )}
      {(permission === "default" || permission === "denied") && (
        <div className="space-y-3 rounded-xl border border-border-base bg-bg-surface p-4">
          <div className="flex items-center gap-2">
            <BellOff className="h-4 w-4 text-text-muted" />
            <p className="text-sm font-bold text-text-base">
              {permission === "denied"
                ? "Notificações bloqueadas pelo navegador"
                : "Notificações desativadas"}
            </p>
          </div>
          {permission === "denied" ? (
            <p className="text-xs text-text-muted leading-snug">
              Acesse as configurações do navegador, encontre este site em
              Notificações e altere para <strong>Permitir</strong>.
            </p>
          ) : (
            <button
              onClick={activate}
              disabled={busy}
              className="w-full rounded-md bg-primary-600 h-10 text-sm font-bold text-white transition-colors hover:bg-primary-700 active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? "Ativando…" : "Ativar notificações admin"}
            </button>
          )}
        </div>
      )}
      <p className="rounded-md border border-border-base bg-bg-surface-hover p-3 text-xs text-text-muted leading-snug">
        As notificações ficam vinculadas a{" "}
        <strong>este navegador/dispositivo</strong>. Para receber em outro
        dispositivo, acesse o painel lá e ative novamente.
      </p>
    </div>
  );
}
