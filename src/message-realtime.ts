export {};

import { api } from "./lib/api";

type TicketResult = { ticket: string; uid: string; expiresAt?: string };
type MessageRealtimeEvent = { type?: string; event?: string; peerUid?: string; sentAt?: string };

let socket: WebSocket | null = null;
let reconnectTimer = 0;
let reconnectAttempt = 0;
let heartbeatTimer = 0;
let pendingThreadTarget = "";
let connecting = false;

function activeThreadTarget() {
  const active = document.querySelector<HTMLElement>(".message-contact.active[data-uorqui-target-uid]");
  return String(active?.dataset.uorquiTargetUid || "");
}

function threadNearBottom() {
  const scroll = document.querySelector<HTMLElement>(".message-thread.open .message-scroll, .message-thread .message-scroll");
  if (!scroll) return false;
  return scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop <= 100;
}

function remountOpenThread(targetUid: string) {
  if (!targetUid || !document.querySelector(".messages-page")) return;
  try { sessionStorage.setItem("uorqui-message-target", targetUid); } catch {}
  window.dispatchEvent(new CustomEvent("uorqui:open-messages"));
  // O listener legado limpa a chave. Repondo depois do dispatch, o novo
  // MessagesPage lê o alvo no próximo render e abre direto na conversa.
  try { sessionStorage.setItem("uorqui-message-target", targetUid); } catch {}
}

function refreshOpenThreadWhenAppropriate() {
  const targetUid = activeThreadTarget();
  if (!targetUid) return;
  if (threadNearBottom()) {
    pendingThreadTarget = "";
    remountOpenThread(targetUid);
  } else {
    // Não puxa o usuário para baixo enquanto ele lê mensagens antigas.
    pendingThreadTarget = targetUid;
  }
}

function handleRealtimePayload(payload: MessageRealtimeEvent) {
  if (payload?.type !== "refresh") return;
  window.dispatchEvent(new CustomEvent("uorqui:message-realtime", { detail: payload }));
  refreshOpenThreadWhenAppropriate();
}

function scheduleReconnect(delay?: number) {
  window.clearTimeout(reconnectTimer);
  const computed = delay ?? Math.min(15000, 900 * (2 ** Math.min(reconnectAttempt, 4)));
  reconnectTimer = window.setTimeout(() => void connect(), computed);
}

async function connect() {
  if (connecting) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  if (document.visibilityState === "hidden") return;

  connecting = true;
  try {
    const ticket = await api<TicketResult>("/message-realtime/ticket", { method: "POST" });
    if (!ticket?.ticket || !ticket.uid) throw new Error("ticket");

    const url = new URL("/api/message-realtime", location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("ticket", ticket.ticket);
    url.searchParams.set("uid", ticket.uid);

    const nextSocket = new WebSocket(url.toString());
    socket = nextSocket;
    nextSocket.onopen = () => {
      reconnectAttempt = 0;
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = window.setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
      }, 45000);
    };
    nextSocket.onmessage = (event) => {
      if (event.data === "pong") return;
      try { handleRealtimePayload(JSON.parse(String(event.data))); } catch {}
    };
    nextSocket.onclose = () => {
      if (socket === nextSocket) socket = null;
      window.clearInterval(heartbeatTimer);
      reconnectAttempt += 1;
      scheduleReconnect();
    };
    nextSocket.onerror = () => nextSocket.close();
  } catch {
    reconnectAttempt += 1;
    // Durante bootstrap/login a API pode ainda não ter usuário; tenta de novo
    // sem exibir erro ao usuário.
    scheduleReconnect(reconnectAttempt < 3 ? 1800 : undefined);
  } finally {
    connecting = false;
  }
}

document.addEventListener("scroll", () => {
  if (!pendingThreadTarget || !document.querySelector(".messages-page")) return;
  if (!threadNearBottom()) return;
  const target = pendingThreadTarget;
  pendingThreadTarget = "";
  window.setTimeout(() => remountOpenThread(target), 20);
}, { passive: true, capture: true });

window.addEventListener("online", () => void connect());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void connect();
});
window.addEventListener("focus", () => void connect());

window.setTimeout(() => void connect(), 900);
