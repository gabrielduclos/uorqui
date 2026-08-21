const CACHE = "uorqui-react-v1.2.8";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/")));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok) caches.open(CACHE).then((cache) => cache.put(req, res.clone()));
      return res;
    })));
  }
});


self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const data = payload.data || {};
  const notification = payload.notification || {};
  const title = notification.title || data.title || "Uorqui";
  const body = notification.body || data.body || "Você tem uma nova atualização.";
  const type = data.type || "";
  const notificationId = data.notificationId || `${Date.now()}`;
  const url = data.url || "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/assets/uorqui-icon-192.png",
      badge: "/assets/uorqui-favicon.png",
      tag: `uorqui-${notificationId}`,
      renotify: type === "read_required",
      requireInteraction: type === "read_required",
      data: { url, notificationId, type }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification?.data?.url || "/",
    self.location.origin
  ).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        try {
          const current = new URL(client.url);
          const target = new URL(targetUrl);
          if (current.origin === target.origin) {
            return client.navigate(targetUrl).then(() => client.focus());
          }
        } catch {}
      }

      return clients.openWindow(targetUrl);
    })
  );
});
