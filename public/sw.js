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
