export {};

import { api } from "./lib/api";

type Conversation = { unreadCount?: number };
type ConversationResult = { conversations?: Conversation[] };

const BADGE_CLASS = "uorqui-message-nav-badge";
let unreadTotal = 0;
let refreshBusy = false;
let refreshQueued = false;
let syncQueued = false;

const style = document.createElement("style");
style.dataset.uorquiMessageUnreadBadge = "1";
style.textContent = `
.${BADGE_CLASS}{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#111318;color:#fff;font-size:10px;font-weight:800;line-height:1;flex:0 0 auto;margin-left:auto}
.mobile-nav .${BADGE_CLASS}{position:absolute;top:2px;left:calc(50% + 7px);min-width:17px;height:17px;padding:0 4px;margin:0;border:2px solid var(--background,#fff);font-size:9px}
.mobile-nav button{position:relative}
.side-nav .${BADGE_CLASS}{margin-left:auto}
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
  for (const button of messageButtons()) {
    let badge = button.querySelector<HTMLElement>(`.${BADGE_CLASS}`);
    if (!unreadTotal) {
      badge?.remove();
      continue;
    }
    if (!badge) {
      badge = document.createElement("b");
      badge.className = BADGE_CLASS;
      badge.setAttribute("aria-label", `${unreadTotal} mensagens não lidas`);
      button.appendChild(badge);
    }
    badge.textContent = unreadTotal > 99 ? "99+" : String(unreadTotal);
    badge.setAttribute("aria-label", `${unreadTotal} mensagens não lidas`);
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

async function refreshUnreadCount() {
  if (refreshBusy) {
    refreshQueued = true;
    return;
  }
  refreshBusy = true;
  try {
    const result = await api<ConversationResult>("/messages?offset=0&limit=100");
    applyConversationResult(result);
  } catch {
    // O usuário pode ainda não estar autenticado. O próximo evento de realtime/foco tenta novamente.
  } finally {
    refreshBusy = false;
    if (refreshQueued) {
      refreshQueued = false;
      window.setTimeout(() => void refreshUnreadCount(), 80);
    }
  }
}

const observer = new MutationObserver(scheduleSync);
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("uorqui:realtime-refresh", () => void refreshUnreadCount());
window.addEventListener("uorqui:open-messages", () => window.setTimeout(() => void refreshUnreadCount(), 220));
window.addEventListener("online", () => void refreshUnreadCount());
window.addEventListener("focus", () => void refreshUnreadCount());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void refreshUnreadCount();
});

// Ao abrir uma conversa o backend marca as mensagens como lidas. Atualizamos o
// contador logo depois sem esperar outro evento do websocket.
document.addEventListener("click", (event) => {
  const target = event.target as Element | null;
  if (!target?.closest(".message-contact")) return;
  window.setTimeout(() => void refreshUnreadCount(), 450);
});

window.setTimeout(() => void refreshUnreadCount(), 1200);
scheduleSync();
