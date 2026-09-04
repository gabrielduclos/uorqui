export {};

type MessageSnapshot = {
  id?: string;
  readAt?: string;
};

type ThreadResult = {
  messages?: MessageSnapshot[];
};

type ThreadRequest = {
  uid: string;
  before: string;
  method: string;
};

const upstreamFetch = globalThis.fetch.bind(globalThis);
let activeTargetUid = "";
let activeMessages: MessageSnapshot[] = [];
let syncQueued = false;
let stickToLatest = false;
let pendingInitialJump = false;
let programmaticScroll = false;
let pendingPrependRestore: { height: number; top: number } | null = null;
const trackedScrollers = new WeakSet<HTMLElement>();

const style = document.createElement("style");
style.dataset.uorquiMessageReadState = "1";
style.textContent = `
.message-bubble time{display:block;text-align:right;font-size:7px;opacity:.55;margin-top:5px}
.message-bubble-row.mine .message-bubble[data-uorqui-read="1"] time::after{content:" · Lida";font-weight:700;white-space:nowrap}
`;
document.head.appendChild(style);

function messageRequest(input: RequestInfo | URL, init?: RequestInit): ThreadRequest | null {
  try {
    const request = input instanceof Request ? input : null;
    const method = String(init?.method || request?.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "POST") return null;

    const raw = request?.url || String(input || "");
    const url = new URL(raw, location.origin);
    const match = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
    if (!match) return null;

    return {
      uid: decodeURIComponent(match[1]),
      before: url.searchParams.get("before") || "",
      method
    };
  } catch {
    return null;
  }
}

function currentScroller() {
  return document.querySelector<HTMLElement>(".message-thread.open .message-scroll, .message-thread .message-scroll");
}

function distanceFromBottom(scroll: HTMLElement) {
  return Math.max(0, scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop);
}

function bindScrollTracking(scroll: HTMLElement) {
  if (trackedScrollers.has(scroll)) return;
  trackedScrollers.add(scroll);

  scroll.addEventListener("scroll", () => {
    if (programmaticScroll) return;
    stickToLatest = distanceFromBottom(scroll) <= 84;
  }, { passive: true });
}

function jumpToLatest(scroll: HTMLElement) {
  programmaticScroll = true;
  scroll.scrollTop = scroll.scrollHeight;
  requestAnimationFrame(() => {
    programmaticScroll = false;
    stickToLatest = true;
  });
}

function scheduleSync() {
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
  const scroll = currentScroller();
  if (!scroll) return;
  bindScrollTracking(scroll);

  const rows = Array.from(scroll.querySelectorAll<HTMLElement>(".message-bubble-row"));
  const offset = Math.max(0, activeMessages.length - rows.length);

  rows.forEach((row, index) => {
    const message = activeMessages[index + offset];
    const bubble = row.querySelector<HTMLElement>(".message-bubble");
    if (!bubble) return;

    const shouldShowRead = row.classList.contains("mine") && Boolean(message?.readAt);
    if (shouldShowRead) bubble.dataset.uorquiRead = "1";
    else delete bubble.dataset.uorquiRead;
  });

  if (pendingPrependRestore) {
    const restore = pendingPrependRestore;
    pendingPrependRestore = null;
    programmaticScroll = true;
    scroll.scrollTop = restore.top + Math.max(0, scroll.scrollHeight - restore.height);
    requestAnimationFrame(() => { programmaticScroll = false; });
    return;
  }

  if (pendingInitialJump) {
    pendingInitialJump = false;
    jumpToLatest(scroll);
    return;
  }

  if (stickToLatest) jumpToLatest(scroll);
}

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const thread = messageRequest(input, init);

  if (thread?.method === "GET" && thread.before) {
    const scroll = currentScroller();
    if (scroll) pendingPrependRestore = { height: scroll.scrollHeight, top: scroll.scrollTop };
    stickToLatest = false;
  }

  const response = await upstreamFetch(input, init);

  if (!thread || !response.ok) return response;

  if (thread.method === "POST") {
    // Mensagem enviada pelo usuário: a nova bolha deve ficar visível imediatamente,
    // sem animação de scroll. O MutationObserver completa o ajuste após o React renderizar.
    activeTargetUid = thread.uid;
    stickToLatest = true;
    scheduleSync();
    return response;
  }

  void response.clone().json().then((result: ThreadResult) => {
    const messages = Array.isArray(result?.messages) ? result.messages : [];

    if (thread.before && activeTargetUid === thread.uid) {
      const known = new Set(activeMessages.map(message => String(message.id || "")));
      const older = messages.filter(message => !known.has(String(message.id || "")));
      activeMessages = [...older, ...activeMessages];
      scheduleSync();
      return;
    }

    const openingThread = activeTargetUid !== thread.uid || !currentScroller();
    activeTargetUid = thread.uid;
    activeMessages = messages;

    if (openingThread) {
      pendingInitialJump = true;
      stickToLatest = true;
    }
    scheduleSync();
  }).catch(() => {});

  return response;
};

const observer = new MutationObserver(() => scheduleSync());
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("uorqui:realtime-refresh", () => scheduleSync());
