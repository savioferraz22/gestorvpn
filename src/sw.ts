/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

// Precache all assets injected by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST);

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
