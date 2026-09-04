export {};

import { api } from "./lib/api";

type Conversation = { unreadCount?: number };
type ConversationResult = { conversations?: Conversation[] };

const MIN_REFRESH_INTERVAL = 5000;
let unreadTotal = 0;
let refreshBusy = false;
let refreshQueued = false;
let syncQueued = false;
let lastRefreshAt = 0;
let deferredRefreshTimer = 0;

const style = document.createElement("style");
style.dataset.uorquiMessageUnreadBadge = "1";
style.textContent = `
.side-nav button[data-uorqui-message-unread]::after{
  content:attr(data-uorqui-message-unread);
  display:inline-flex;align-items:center;justify-content:center;
  min-width:18px;height:18px;padding:0 5px;margin-left:auto;
  border-radius:999px;background:#111318;color:#fff;
  font-size:10px;font-weight:800;line-height:1;flex:0 0 auto
}
.mobile-nav button{position:relative}
.mobile-nav button[data-uorqui-message-unread]::after{
  content:attr(data-uorqui-message-unread);
  position:absolute;top:2px;left:calc(50% + 7px);
  display:flex;align-items:center;justify-content:center;
  min-width:17px;height:17px;padding:0 4px;
  border-radius:999px;background:#111318;color:#fff;
  border:2px solid var(--background,#fff);font-size:9px;font-weight:800;line-height:1
}
`;
document.head.appendChild(style);

function isMessagesButton(button: HTMLButtonElement) {
  const text = (button.textContent || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");
  return text === "mensagens" || text.startsWith("mensagens ") || text.endsWith(" mensagens");
}

function messageButtons() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(".side-nav button, .mobile-nav button"))
    .filter(isMessagesButton);
}

function syncBadges() {
  syncQueued = false;
  const label = unreadTotal > 99 ? "99+" : String(unreadTotal);
  for (const button of messageButtons()) {
    if (!unreadTotal) {
      delete button.dataset.uorquiMessageUnread;
      button.removeAttribute("aria-label");
      continue;
    }
    button.dataset.uorquiMessageUnread = label;
    button.setAttribute("aria-label", `Mensagens, ${unreadTotal} não lidas`);
  }
}

function scheduleSync() {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(syncBadges);
}

function applyConversationResult(result: ConversationResult | null | undefined) {
  const conversations = Array.isArray(result?.conversations) ? result!.conversations! : [];
  unreadTotal = conversations.reduce((total, item) => total + Math.max(0, Number(item?.unreadCount || 0)), 0);
  scheduleSync();
  window.dispatchEvent(new CustomEvent("uorqui:message-unread-count", { detail: { count: unreadTotal } }));
}

function scheduleDeferredRefresh(delay: number) {
  window.clearTimeout(deferredRefreshTimer);
  deferredRefreshTimer = window.setTimeout(() => {
    deferredRefreshTimer = 0;
    void refreshUnreadCount(false);
  }, Math.max(80, delay));
}

async function refreshUnreadCount(force = false) {
  if (document.visibilityState === "hidden" && !force) return;

  const elapsed = Date.now() - lastRefreshAt;
  if (!force && lastRefreshAt && elapsed < MIN_REFRESH_INTERVAL) {
    scheduleDeferredRefresh(MIN_REFRESH_INTERVAL - elapsed);
    return;
  }

  if (refreshBusy) {
    refreshQueued = refreshQueued || force;
    return;
  }

  window.clearTimeout(deferredRefreshTimer);
  deferredRefreshTimer = 0;
  refreshBusy = true;
  try {
    const result = await api<ConversationResult>("/messages?offset=0&limit=100");
    lastRefreshAt = Date.now();
    applyConversationResult(result);
  } catch {
    // O usuário pode ainda não estar autenticado. O próximo evento tenta novamente.
  } finally {
    refreshBusy = false;
    if (refreshQueued) {
      const queuedForce = refreshQueued;
      refreshQueued = false;
      window.setTimeout(() => void refreshUnreadCount(queuedForce), 100);
    }
  }
}

const observer = new MutationObserver(scheduleSync);
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("uorqui:realtime-refresh", () => void refreshUnreadCount(false));
window.addEventListener("uorqui:message-realtime", () => void refreshUnreadCount(true));
window.addEventListener("uorqui:open-messages", () => window.setTimeout(() => void refreshUnreadCount(true), 220));
window.addEventListener("online", () => void refreshUnreadCount(true));
window.addEventListener("focus", () => void refreshUnreadCount(false));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void refreshUnreadCount(false);
});

document.addEventListener("click", (event) => {
  const target = event.target as Element | null;
  if (!target?.closest(".message-contact")) return;
  window.setTimeout(() => void refreshUnreadCount(true), 450);
});

window.setTimeout(() => void refreshUnreadCount(true), 1200);
scheduleSync();
