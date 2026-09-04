export {};

import { api } from "./lib/api";

type MessageRow = {
  id: string;
  senderUid: string;
  recipientUid: string;
  likedBy?: string[];
};

type ThreadPayload = { messages?: MessageRow[] };

const upstreamFetch = globalThis.fetch.bind(globalThis);
const messages = new Map<string, MessageRow>();
const overlays = new Map<string, HTMLDivElement>();
let activeTargetUid = "";
let meUid = "";
let syncQueued = false;

const style = document.createElement("style");
style.dataset.uorquiMessageInlineActions = "1";
style.textContent = `
.uorqui-message-action-dock{display:none!important}
.uorqui-message-inline-actions{
  position:fixed;
  z-index:92;
  display:flex;
  align-items:center;
  gap:8px;
  white-space:nowrap;
  pointer-events:auto;
}
.uorqui-message-inline-actions button{
  border:0;
  background:transparent;
  padding:2px 0;
  color:#7a7d84;
  font-size:9px;
  font-weight:600;
  line-height:1.2;
  text-decoration:none;
}
.uorqui-message-inline-actions button:hover{color:#111318}
.uorqui-message-inline-actions button[data-liked="1"]{color:#c9363e}
@media(max-width:520px){
  .uorqui-message-inline-actions{gap:6px}
  .uorqui-message-inline-actions button{font-size:8px}
}
`;
document.head.appendChild(style);

function requestInfo(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const request = input instanceof Request ? input : null;
    const method = String(init?.method || request?.method || "GET").toUpperCase();
    const raw = request?.url || String(input || "");
    return { method, url: new URL(raw, location.origin) };
  } catch {
    return null;
  }
}

function inferMe(rows: MessageRow[], targetUid: string) {
  for (const message of rows) {
    if (message.senderUid === targetUid && message.recipientUid) return message.recipientUid;
    if (message.recipientUid === targetUid && message.senderUid) return message.senderUid;
  }
  return meUid;
}

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const info = requestInfo(input, init);
  const response = await upstreamFetch(input, init);
  if (!info || !response.ok) return response;

  const match = info.url.pathname.match(/^\/api\/messages\/([^/]+)$/);
  if (info.method === "GET" && match) {
    const targetUid = decodeURIComponent(match[1]);
    void response.clone().json().then((payload: ThreadPayload) => {
      const rows = Array.isArray(payload?.messages) ? payload.messages : [];
      activeTargetUid = targetUid;
      meUid = inferMe(rows, targetUid);
      for (const message of rows) if (message?.id) messages.set(message.id, message);
      scheduleSync();
    }).catch(() => {});
  }

  return response;
};

function removeOverlay(id: string) {
  const current = overlays.get(id);
  if (current) current.remove();
  overlays.delete(id);
}

function likedByMe(message: MessageRow | undefined) {
  return Boolean(message && meUid && Array.isArray(message.likedBy) && message.likedBy.includes(meUid));
}

function clickExistingReplyAction(bubble: HTMLElement) {
  // message-experience mantém a lógica de replyToMessageId. Abrimos o dock
  // invisível por um frame e acionamos somente a ação de resposta, sem mostrar
  // menu flutuante ao usuário.
  bubble.click();
  window.setTimeout(() => {
    const dock = document.querySelector<HTMLElement>(".uorqui-message-action-dock");
    const reply = Array.from(dock?.querySelectorAll<HTMLButtonElement>("button") || [])
      .find(button => (button.textContent || "").toLocaleLowerCase("pt-BR").includes("responder"));
    reply?.click();
  }, 0);
}

async function toggleLike(messageId: string, button: HTMLButtonElement) {
  const message = messages.get(messageId);
  if (!message || !activeTargetUid) return;
  button.disabled = true;
  try {
    const result = await api<{ liked?: boolean; likedBy?: string[]; message?: MessageRow }>(
      `/messages/${encodeURIComponent(activeTargetUid)}/${encodeURIComponent(messageId)}/reaction`,
      { method: "POST" }
    );
    const next = result.message || { ...message, likedBy: Array.isArray(result.likedBy) ? result.likedBy : message.likedBy };
    messages.set(messageId, next);
    const liked = result.liked === undefined ? likedByMe(next) : Boolean(result.liked);
    button.textContent = liked ? "Descurtir" : "Curtir";
    button.dataset.liked = liked ? "1" : "0";
  } catch {
    // O aviso global do Uorqui já trata a falha de forma genérica.
  } finally {
    button.disabled = false;
  }
}

function buildOverlay(messageId: string, bubble: HTMLElement) {
  const overlay = document.createElement("div");
  overlay.className = "uorqui-message-inline-actions";
  overlay.dataset.messageId = messageId;

  const reply = document.createElement("button");
  reply.type = "button";
  reply.textContent = "Responder";
  reply.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clickExistingReplyAction(bubble);
  });

  const like = document.createElement("button");
  like.type = "button";
  const liked = likedByMe(messages.get(messageId));
  like.textContent = liked ? "Descurtir" : "Curtir";
  like.dataset.liked = liked ? "1" : "0";
  like.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void toggleLike(messageId, like);
  });

  overlay.append(reply, like);
  document.body.appendChild(overlay);
  overlays.set(messageId, overlay);
  return overlay;
}

function positionOverlay(overlay: HTMLElement, row: HTMLElement, bubble: HTMLElement) {
  const rect = bubble.getBoundingClientRect();
  const own = row.classList.contains("mine");
  const width = overlay.offsetWidth || 90;
  const height = overlay.offsetHeight || 14;
  const gap = 7;

  let left = own ? rect.left - width - gap : rect.right + gap;
  left = Math.max(6, Math.min(left, window.innerWidth - width - 6));
  const top = Math.max(6, Math.min(rect.top + (rect.height - height) / 2, window.innerHeight - height - 6));

  overlay.style.left = `${Math.round(left)}px`;
  overlay.style.top = `${Math.round(top)}px`;
  overlay.style.display = rect.bottom < 0 || rect.top > window.innerHeight ? "none" : "flex";
}

function sync() {
  syncQueued = false;
  const rows = Array.from(document.querySelectorAll<HTMLElement>(".message-thread.open .message-bubble-row, .message-thread .message-bubble-row"));
  const visibleIds = new Set<string>();

  for (const row of rows) {
    const bubble = row.querySelector<HTMLElement>(".message-bubble[data-uorqui-message-id]");
    const id = String(bubble?.dataset.uorquiMessageId || row.dataset.uorquiMessageId || "");
    if (!bubble || !id) continue;
    visibleIds.add(id);

    let overlay = overlays.get(id);
    if (!overlay || !overlay.isConnected) overlay = buildOverlay(id, bubble);

    const like = overlay.querySelector<HTMLButtonElement>("button:last-child");
    if (like) {
      const liked = likedByMe(messages.get(id));
      like.textContent = liked ? "Descurtir" : "Curtir";
      like.dataset.liked = liked ? "1" : "0";
    }
    positionOverlay(overlay, row, bubble);
  }

  for (const id of [...overlays.keys()]) if (!visibleIds.has(id)) removeOverlay(id);
}

function scheduleSync() {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(sync);
}

const observer = new MutationObserver(scheduleSync);
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-uorqui-message-id"] });
window.addEventListener("scroll", scheduleSync, true);
window.addEventListener("resize", scheduleSync);
window.addEventListener("uorqui:realtime-refresh", scheduleSync);
window.addEventListener("uorqui:message-realtime", scheduleSync);
scheduleSync();
