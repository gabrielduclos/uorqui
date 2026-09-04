import { api } from "./api";

type RealtimeScope = { scope: "world" | "company"; companyId?: string };
type TicketResult = { ticket: string; expiresAt: string };

export function connectRealtime(companyId: string, onRefresh: () => void) {
  const scopes: RealtimeScope[] = [
    { scope: "world" },
    ...(companyId ? [{ scope: "company" as const, companyId }] : []),
  ];
  const sockets = new Map<string, WebSocket>();
  const reconnectTimers = new Map<string, number>();
  const attempts = new Map<string, number>();
  let disposed = false;
  let refreshTimer = 0;
  let latestEvent = "mutation";

  const keyFor = (scope: RealtimeScope) => scope.scope === "world" ? "world" : `company:${scope.companyId}`;

  // Vários eventos podem chegar quase juntos (curtida, comentário, mensagem,
  // atualização de contador). O feed continua em tempo real, mas a aplicação
  // executa somente um refresh para o lote em vez de disparar leituras para
  // cada frame recebido pelo websocket.
  const scheduleRefresh = (eventName = "mutation") => {
    latestEvent = eventName || latestEvent;
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      if (disposed) return;
      window.dispatchEvent(new CustomEvent("uorqui:realtime-refresh", {
        detail: { event: latestEvent }
      }));
      onRefresh();
    }, 250);
  };

  const scheduleReconnect = (scope: RealtimeScope) => {
    if (disposed) return;
    const key = keyFor(scope);
    window.clearTimeout(reconnectTimers.get(key));
    const attempt = (attempts.get(key) || 0) + 1;
    attempts.set(key, attempt);
    const delay = Math.min(15000, 800 * (2 ** Math.min(attempt - 1, 5)));
    reconnectTimers.set(key, window.setTimeout(() => void open(scope), delay));
  };

  const open = async (scope: RealtimeScope) => {
    if (disposed) return;
    const key = keyFor(scope);
    const current = sockets.get(key);
    if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) return;

    try {
      const result = await api<TicketResult>("/realtime/ticket", {
        method: "POST",
        body: JSON.stringify(scope),
      });
      if (disposed) return;

      const url = new URL("/api/realtime", window.location.origin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("scope", scope.scope);
      url.searchParams.set("ticket", result.ticket);
      if (scope.companyId) url.searchParams.set("companyId", scope.companyId);

      const socket = new WebSocket(url.toString());
      sockets.set(key, socket);
      socket.onopen = () => attempts.set(key, 0);
      socket.onmessage = (event) => {
        if (event.data === "pong") return;
        try {
          const payload = JSON.parse(String(event.data));
          if (payload?.type === "refresh") scheduleRefresh(String(payload?.event || "mutation"));
        } catch {
          // Mensagens desconhecidas não devem interromper a conexão.
        }
      };
      socket.onclose = () => {
        if (sockets.get(key) === socket) sockets.delete(key);
        scheduleReconnect(scope);
      };
      socket.onerror = () => socket.close();
    } catch {
      scheduleReconnect(scope);
    }
  };

  for (const scope of scopes) void open(scope);

  const reconnectVisible = () => {
    if (document.visibilityState !== "visible" || disposed) return;
    for (const scope of scopes) void open(scope);
  };
  window.addEventListener("online", reconnectVisible);
  document.addEventListener("visibilitychange", reconnectVisible);

  const heartbeat = window.setInterval(() => {
    for (const socket of sockets.values()) {
      if (socket.readyState === WebSocket.OPEN) socket.send("ping");
    }
  }, 45000);

  return () => {
    disposed = true;
    window.clearTimeout(refreshTimer);
    window.clearInterval(heartbeat);
    window.removeEventListener("online", reconnectVisible);
    document.removeEventListener("visibilitychange", reconnectVisible);
    for (const timer of reconnectTimers.values()) window.clearTimeout(timer);
    for (const socket of sockets.values()) socket.close(1000, "page changed");
    reconnectTimers.clear();
    sockets.clear();
  };
}
