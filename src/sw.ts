/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

// Precache all assets injected by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST);

// ── One-time rescue ──────────────────────────────────────────────────────
// Clients running an older bundle got stuck with a permanent "atualizar"
// banner because their old useAppUpdate.ts couldn't activate a waiting SW.
// The first time this new worker installs on each client we auto-skip waiting
// and force-reload every open tab so they escape the loop. After that we
// store a marker so future deploys go back to the cooperative flow (the page
// sends SKIP_WAITING when the user taps the banner).
const RESCUE_CACHE = "vsplus-sw-rescue";
const RESCUE_KEY = "/__rescue/v1";

async function rescueDone(): Promise<boolean> {
  try {
    const cache = await caches.open(RESCUE_CACHE);
    const hit = await cache.match(RESCUE_KEY);
    return !!hit;
  } catch {
    return false;
  }
}

async function markRescueDone(): Promise<void> {
  try {
    const cache = await caches.open(RESCUE_CACHE);
    await cache.put(RESCUE_KEY, new Response("done"));
  } catch {
    // ignore
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      if (!(await rescueDone())) {
        // First contact with the fix — bypass the waiting state right away
        // so the new worker can take over without requiring a tab close.
        await self.skipWaiting();
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();

      if (!(await rescueDone())) {
        await markRescueDone();
        // Hard-refresh every open window so it picks up the new bundle.
        try {
          const windows = await self.clients.matchAll({ type: "window" });
          for (const client of windows) {
            try {
              await (client as WindowClient).navigate(client.url);
            } catch {
              // ignore — best effort
            }
          }
        } catch {
          // ignore
        }
      }
    })(),
  );
});

// Cooperative path used by useAppUpdate after the rescue is done.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Handle push notifications
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const title: string = data.title ?? "VS Plus";
  const options: NotificationOptions = {
    body: data.body ?? "",
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    data: { url: data.url ?? "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click — open or focus the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url: string = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) return client.focus();
        }
        return self.clients.openWindow(url);
      })
  );
});
