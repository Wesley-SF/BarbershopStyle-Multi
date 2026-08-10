/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() ?? "Novo agendamento recebido." };
  }

  event.waitUntil(self.registration.showNotification(payload.title || "Novo agendamento", {
    body: payload.body || "Um novo horário foi reservado.",
    icon: "/favicon.png",
    badge: "/favicon.png",
    data: { url: payload.url || "/admin" },
    tag: payload.tag || "new-appointment",
    renotify: true,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/admin", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existingClient = clients.find((client) => client.url.startsWith(self.location.origin));
    if (existingClient) return existingClient.navigate(targetUrl).then(() => existingClient.focus());
    return self.clients.openWindow(targetUrl);
  }));
});
