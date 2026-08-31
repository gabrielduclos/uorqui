const CACHE = "uorqui-react-v1.3.3-runtime-fix";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.startsWith("uorqui-react-")).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())
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
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((cache) => cache.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req))
    );
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
      icon: "/assets/uorqui-icon-192-v1215.png",
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
  const notificationId = event.notification?.data?.notificationId || "";
  const type = event.notification?.data?.type || "";
  const title = event.notification?.title || "";
  const body = event.notification?.body || "";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windowClients) => {
      const target = new URL(targetUrl);
      const sameOriginClients = windowClients.filter((client) => {
        try { return new URL(client.url).origin === target.origin; }
        catch { return false; }
      });

      if (sameOriginClients.length) {
        sameOriginClients.sort((a, b) => Number(Boolean(b.focused)) - Number(Boolean(a.focused)));
        const client = sameOriginClients[0];
        client.postMessage({
          type: "uorqui-notification-open",
          notificationId,
          notificationType: type,
          title,
          body,
          url: targetUrl
        });
        await client.focus();
        return;
      }

      return clients.openWindow(targetUrl);
    })
  );
});
