export {};

import { onAuthStateChanged } from "firebase/auth";
import { api } from "./lib/api";
import { auth } from "./lib/firebase";

type TicketResult = { ticket: string; uid: string; expiresAt?: string };
type MessageRealtimeEvent = {
  type?: string;
  event?: string;
  peerUid?: string;
  sentAt?: string;
  message?: Record<string, unknown>;
  conversation?: Record<string, unknown>;
  likedBy?: string[];
};

let socket: WebSocket | null = null;
let reconnectTimer = 0;
let reconnectAttempt = 0;
let heartbeatTimer = 0;
let dispatchTimer = 0;
let connecting = false;
let activeUid = "";
let socketGeneration = 0;
let pendingPayload: MessageRealtimeEvent | null = null;

function emitPayload(payload: MessageRealtimeEvent) {
  if (document.visibilityState === "hidden") return;
  window.dispatchEvent(new CustomEvent("uorqui:message-realtime", { detail: payload }));
}

function flushPayload() {
  dispatchTimer = 0;
  const payload = pendingPayload;
  pendingPayload = null;
  if (!payload) return;
  emitPayload(payload);
}

function dispatchPayload(payload: MessageRealtimeEvent) {
  if (payload?.type !== "refresh") return;

  // Confirmação de leitura não deve provocar releitura da conversa.
  if (payload.event === "message_read") return;

  // Nenhuma consulta de Firestore enquanto a aba está em segundo plano.
  if (document.visibilityState === "hidden") return;

  // Mensagem com delta completo precisa chegar imediatamente e nunca pode ser
  // descartada pelo coalescing: a UI consegue anexá-la sem fazer GET algum.
  if (payload.event === "message" && payload.message && typeof payload.message === "object") {
    emitPayload(payload);
    return;
  }

  // Eventos menos frequentes podem ser agrupados para reduzir fallback reads.
  pendingPayload = payload;
  window.clearTimeout(dispatchTimer);
  dispatchTimer = window.setTimeout(flushPayload, 450);
}

function clearConnection() {
  socketGeneration += 1;
  window.clearTimeout(reconnectTimer);
  window.clearTimeout(dispatchTimer);
  window.clearInterval(heartbeatTimer);
  reconnectTimer = 0;
  dispatchTimer = 0;
  heartbeatTimer = 0;
  pendingPayload = null;
  connecting = false;
  const current = socket;
  socket = null;
  try { current?.close(1000, "session changed"); } catch {}
}

function scheduleReconnect(delay?: number) {
  if (!activeUid || document.visibilityState === "hidden") return;
  window.clearTimeout(reconnectTimer);
  const computed = delay ?? Math.min(15000, 900 * (2 ** Math.min(reconnectAttempt, 4)));
  reconnectTimer = window.setTimeout(() => void connect(), computed);
}

async function connect() {
  if (!activeUid || !auth.currentUser) return;
  if (connecting) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  if (document.visibilityState === "hidden") return;

  connecting = true;
  const generation = socketGeneration;
  try {
    const ticket = await api<TicketResult>("/message-realtime/ticket", { method: "POST" });
    if (generation !== socketGeneration || !activeUid) return;
    if (!ticket?.ticket || !ticket.uid) throw new Error("ticket");

    const url = new URL("/api/message-realtime", location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("ticket", ticket.ticket);
    url.searchParams.set("uid", ticket.uid);

    const nextSocket = new WebSocket(url.toString());
    socket = nextSocket;
    nextSocket.onopen = () => {
      if (generation !== socketGeneration) {
        nextSocket.close(1000, "stale socket");
        return;
      }
      reconnectAttempt = 0;
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = window.setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
      }, 45000);
    };
    nextSocket.onmessage = event => {
      if (event.data === "pong" || generation !== socketGeneration) return;
      try { dispatchPayload(JSON.parse(String(event.data))); } catch {}
    };
    nextSocket.onclose = () => {
      if (socket === nextSocket) socket = null;
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = 0;
      if (generation !== socketGeneration || !activeUid) return;
      reconnectAttempt += 1;
      scheduleReconnect();
    };
    nextSocket.onerror = () => nextSocket.close();
  } catch {
    if (generation === socketGeneration && activeUid) {
      reconnectAttempt += 1;
      scheduleReconnect(reconnectAttempt < 3 ? 1800 : undefined);
    }
  } finally {
    if (generation === socketGeneration) connecting = false;
  }
}

onAuthStateChanged(auth, user => {
  const nextUid = user?.uid || "";
  if (nextUid === activeUid) {
    if (nextUid) scheduleReconnect(80);
    return;
  }
  clearConnection();
  activeUid = nextUid;
  reconnectAttempt = 0;
  if (activeUid) scheduleReconnect(80);
});

window.addEventListener("online", () => scheduleReconnect(80));
window.addEventListener("focus", () => scheduleReconnect(80));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") scheduleReconnect(80);
});
