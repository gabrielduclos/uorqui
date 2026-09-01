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
    if (bell && !document.querySelector(".notifications-page") && !bell.classList.contains("active")) bell.click();

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

    if (bell && !document.querySelector(".notifications-page") && !bell.classList.contains("active")) bell.click();
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

// O sino usa o conteúdo realmente renderizado como fonte da verdade.
// Isso evita depender apenas da classe `active`, que continua ativa quando
// uma publicação é aberta por cima da Central de Notificações.
document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const bell = target.closest<HTMLButtonElement>(".top-bell");
  if (!bell) return;

  const sharedPostPage = document.querySelector<HTMLElement>(".shared-post-page");
  const notificationsPage = document.querySelector<HTMLElement>(".notifications-page");

  // Publicação aberta a partir de uma notificação: o estado de view continua
  // em `notifications`. O segundo clique no sino deve fechar a publicação e
  // revelar novamente a Central, e não tentar navegar para o feed.
  if (sharedPostPage && bell.classList.contains("active")) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const back = sharedPostPage.querySelector<HTMLButtonElement>(".shared-post-back");
    back?.click();
    return;
  }

  // Central visível: segundo clique fecha e volta ao feed.
  if (notificationsPage) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    window.dispatchEvent(new CustomEvent("uorqui:go-feed"));
  }
}, true);
