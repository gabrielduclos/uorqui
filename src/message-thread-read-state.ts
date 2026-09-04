export {};

type MessageSnapshot = {
  id?: string;
  readAt?: string;
};

type ThreadResult = {
  messages?: MessageSnapshot[];
};

const upstreamFetch = globalThis.fetch.bind(globalThis);
let activeTargetUid = "";
let activeMessages: MessageSnapshot[] = [];
let syncQueued = false;
let shouldScrollToLatest = false;

const style = document.createElement("style");
style.dataset.uorquiMessageReadState = "1";
style.textContent = `
.message-bubble .uorqui-message-meta{display:flex;align-items:center;justify-content:flex-end;gap:4px;margin-top:5px;font-size:7px;line-height:1;opacity:.58}
.message-bubble .uorqui-message-meta time{display:inline;margin:0;font-size:inherit;opacity:1;text-align:inherit}
.message-bubble .uorqui-message-read-status{font-size:inherit;font-weight:700;white-space:nowrap}
`;
document.head.appendChild(style);

function threadRequest(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const request = input instanceof Request ? input : null;
    const method = String(init?.method || request?.method || "GET").toUpperCase();
    if (method !== "GET") return null;

    const raw = request?.url || String(input || "");
    const url = new URL(raw, location.origin);
    const match = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
    if (!match) return null;

    return {
      uid: decodeURIComponent(match[1]),
      before: url.searchParams.get("before") || ""
    };
  } catch {
    return null;
  }
}

function scheduleSync(scrollToLatest = false) {
  shouldScrollToLatest = shouldScrollToLatest || scrollToLatest;
  if (syncQueued) return;
  syncQueued = true;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      syncQueued = false;
      syncThread();
    });
  });
}

function syncThread() {
  const scroll = document.querySelector<HTMLElement>(".message-thread.open .message-scroll, .message-thread .message-scroll");
  if (!scroll) return;

  const rows = Array.from(scroll.querySelectorAll<HTMLElement>(".message-bubble-row"));
  const offset = Math.max(0, activeMessages.length - rows.length);

  rows.forEach((row, index) => {
    const message = activeMessages[index + offset];
    const bubble = row.querySelector<HTMLElement>(".message-bubble");
    const time = bubble?.querySelector<HTMLTimeElement>("time");
    if (!bubble || !time) return;

    let meta = bubble.querySelector<HTMLElement>(".uorqui-message-meta");
    if (!meta) {
      meta = document.createElement("span");
      meta.className = "uorqui-message-meta";
      time.replaceWith(meta);
      meta.appendChild(time);
    }

    let status = meta.querySelector<HTMLElement>(".uorqui-message-read-status");
    const isRead = Boolean(message?.readAt);

    if (isRead) {
      if (!status) {
        status = document.createElement("span");
        status.className = "uorqui-message-read-status";
        status.textContent = "Lida";
        meta.appendChild(status);
      }
      status.hidden = false;
    } else {
      status?.remove();
    }
  });

  if (shouldScrollToLatest) {
    shouldScrollToLatest = false;
    scroll.scrollTop = scroll.scrollHeight;
  }
}

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const thread = threadRequest(input, init);
  const response = await upstreamFetch(input, init);

  if (!thread || !response.ok) return response;

  void response.clone().json().then((result: ThreadResult) => {
    const messages = Array.isArray(result?.messages) ? result.messages : [];

    if (thread.before && activeTargetUid === thread.uid) {
      const known = new Set(activeMessages.map(message => String(message.id || "")));
      const older = messages.filter(message => !known.has(String(message.id || "")));
      activeMessages = [...older, ...activeMessages];
      scheduleSync(false);
      return;
    }

    activeTargetUid = thread.uid;
    activeMessages = messages;
    // A abertura/refresh normal da conversa sempre posiciona no conteúdo mais recente.
    // Paginação de mensagens antigas (before=...) preserva a posição atual.
    scheduleSync(true);
  }).catch(() => {});

  return response;
};

const observer = new MutationObserver(() => scheduleSync(false));
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("uorqui:realtime-refresh", () => scheduleSync(false));
