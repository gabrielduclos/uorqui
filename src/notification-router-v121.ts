import { api } from "./lib/api";

type NotificationOpenMessage = {
  type?: string;
  notificationId?: string;
  notificationType?: string;
  title?: string;
  body?: string;
  url?: string;
};

let routing = false;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function notificationIndex(notificationId: string, title: string) {
  try {
    const companyId = localStorage.getItem("uorqui-company") || "";
    const suffix = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
    const bootstrap = await api<any>(`/bootstrap${suffix}`);
    const notifications = Array.isArray(bootstrap?.notifications) ? bootstrap.notifications : [];
    let index = notificationId
      ? notifications.findIndex((item: any) => String(item?.id || "") === notificationId)
      : -1;
    if (index < 0 && title) {
      index = notifications.findIndex((item: any) => String(item?.title || "") === title);
    }
    return index;
  } catch {
    return -1;
  }
}

async function openNotificationInsideApp(message: NotificationOpenMessage) {
  if (routing) return;
  routing = true;
  try {
    const notificationId = String(message.notificationId || "");
    const title = String(message.title || "");
    const index = await notificationIndex(notificationId, title);

    const bell = document.querySelector<HTMLButtonElement>(".top-bell");
    if (bell && !bell.classList.contains("active")) bell.click();

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await wait(attempt === 0 ? 80 : 100);
      const items = Array.from(document.querySelectorAll<HTMLElement>(".notification-page-item"));
      if (!items.length) continue;

      const byTitle = title
        ? items.find((item) => item.querySelector(".notification-page-copy strong")?.textContent?.trim() === title)
        : undefined;
      const target = byTitle || (index >= 0 ? items[index] : undefined);
      if (!target) continue;

      target.click();
      return;
    }

    // Se a lista ainda não sincronizou, mantém o usuário na Central de
    // Notificações sem recarregar a aplicação inteira.
    if (bell && !bell.classList.contains("active")) bell.click();
  } finally {
    routing = false;
  }
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    const message = (event.data || {}) as NotificationOpenMessage;
    if (message.type !== "uorqui-notification-open") return;
    void openNotificationInsideApp(message);
  });
}
