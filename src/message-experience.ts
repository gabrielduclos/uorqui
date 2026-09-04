export {};

import { api } from "./lib/api";

type MessageSnapshot = {
  id: string;
  senderUid: string;
  recipientUid: string;
  text?: string;
  cancelledAt?: string;
  attachments?: Array<{ id: string; name?: string; contentType?: string; size?: number }>;
  sharedPost?: { id?: string } | null;
  replyToMessageId?: string;
  replyTo?: { id?: string; senderUid?: string; text?: string; cancelledAt?: string } | null;
  likedBy?: string[];
};

type ConversationSnapshot = {
  id?: string;
  targetUid: string;
  displayName?: string;
  avatarMediaId?: string;
  unreadCount?: number;
};

type ThreadResult = { messages?: MessageSnapshot[] };
type ConversationResult = { conversations?: ConversationSnapshot[] };

type PendingReply = {
  id: string;
  senderUid: string;
  text: string;
};

const upstreamFetch = globalThis.fetch.bind(globalThis);
let activeTargetUid = "";
let activeMeUid = "";
let activeMessages: MessageSnapshot[] = [];
let conversations: ConversationSnapshot[] = [];
let pendingReply: PendingReply | null = null;
let selectedMessageId = "";
let syncQueued = false;
let audioSendBusy = false;
let unreadBaselineReady = false;
const unreadByTarget = new Map<string, number>();

const style = document.createElement("style");
style.dataset.uorquiMessageExperience = "1";
style.textContent = `
.message-bubble[data-uorqui-reply-preview]::before{
  content:"↩ " attr(data-uorqui-reply-preview);
  display:block;
  max-width:100%;
  margin:0 0 7px;
  padding:6px 8px;
  border-left:3px solid currentColor;
  border-radius:6px;
  background:rgba(127,127,127,.10);
  opacity:.72;
  font-size:9px;
  line-height:1.35;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  text-align:left;
}
.message-bubble[data-uorqui-like-count]::after{
  content:"♥ " attr(data-uorqui-like-count);
  display:block;
  width:max-content;
  min-width:22px;
  margin:5px 0 -4px auto;
  padding:2px 6px;
  border-radius:999px;
  background:#fff;
  color:#e5484d;
  border:1px solid rgba(0,0,0,.08);
  font-size:9px;
  font-weight:800;
  line-height:1.25;
  box-shadow:0 1px 4px rgba(0,0,0,.08);
}
.message-composer[data-uorqui-reply]{position:relative;padding-top:41px}
.message-composer[data-uorqui-reply]::before{
  content:"Respondendo · " attr(data-uorqui-reply);
  position:absolute;
  top:7px;
  left:11px;
  right:11px;
  height:29px;
  display:flex;
  align-items:center;
  padding:0 30px 0 9px;
  border-left:3px solid #2563eb;
  border-radius:7px;
  background:#f4f6f8;
  color:#565a62;
  font-size:9px;
  font-weight:650;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  cursor:pointer;
}
.message-composer[data-uorqui-reply]::after{
  content:"×";
  position:absolute;
  top:8px;
  right:15px;
  width:26px;
  height:27px;
  display:grid;
  place-items:center;
  color:#6b7078;
  font-size:19px;
  line-height:1;
  pointer-events:none;
}
.uorqui-message-action-dock{
  position:fixed;
  z-index:150;
  display:flex;
  gap:5px;
  padding:5px;
  border:1px solid rgba(0,0,0,.10);
  border-radius:12px;
  background:#fff;
  box-shadow:0 12px 32px rgba(0,0,0,.16);
}
.uorqui-message-action-dock button{
  border:0;
  border-radius:8px;
  background:#f4f4f5;
  padding:7px 10px;
  color:#34363b;
  font-size:10px;
  font-weight:700;
}
.uorqui-message-action-dock button[data-liked="1"]{color:#c9363e;background:#fff0f1}
.uorqui-message-inapp-alert{
  position:fixed;
  z-index:220;
  top:calc(12px + env(safe-area-inset-top));
  left:50%;
  transform:translateX(-50%);
  width:min(420px,calc(100vw - 24px));
  border:1px solid rgba(0,0,0,.10);
  border-radius:14px;
  background:rgba(255,255,255,.97);
  box-shadow:0 16px 40px rgba(0,0,0,.18);
  padding:10px 12px;
  display:flex;
  align-items:center;
  gap:10px;
  text-align:left;
  color:#17181b;
  backdrop-filter:blur(12px);
}
.uorqui-message-inapp-alert span{min-width:0;flex:1}
.uorqui-message-inapp-alert strong,.uorqui-message-inapp-alert small{display:block}
.uorqui-message-inapp-alert strong{font-size:11px}
.uorqui-message-inapp-alert small{margin-top:2px;color:#6b7078;font-size:9px}
.uorqui-message-local-toast{
  position:fixed;z-index:230;left:50%;bottom:calc(78px + env(safe-area-inset-bottom));transform:translateX(-50%);
  border-radius:999px;background:#17181b;color:#fff;padding:8px 12px;font-size:10px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.2)
}
@media(min-width:851px){
  .uorqui-message-local-toast{bottom:24px}
}
`;
document.head.appendChild(style);

function requestInfo(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const request = input instanceof Request ? input : null;
    const method = String(init?.method || request?.method || "GET").toUpperCase();
    const raw = request?.url || String(input || "");
    const url = new URL(raw, location.origin);
    return { url, method };
  } catch {
    return null;
  }
}

function inferMeUid(messages: MessageSnapshot[], targetUid: string) {
  for (const message of messages) {
    if (message.senderUid === targetUid && message.recipientUid) return message.recipientUid;
    if (message.recipientUid === targetUid && message.senderUid) return message.senderUid;
  }
  return activeMeUid;
}

function mergeMessage(message: MessageSnapshot) {
  const index = activeMessages.findIndex(item => item.id === message.id);
  if (index < 0) activeMessages = [...activeMessages, message];
  else activeMessages = activeMessages.map(item => item.id === message.id ? { ...item, ...message } : item);
}

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const info = requestInfo(input, init);
  let nextInit = init;
  let outgoingReplyId = "";

  const threadSendMatch = info?.url.pathname.match(/^\/api\/messages\/([^/]+)$/);
  if (
    info?.method === "POST" &&
    threadSendMatch &&
    pendingReply &&
    typeof init?.body === "string"
  ) {
    try {
      const targetUid = decodeURIComponent(threadSendMatch[1]);
      if (!activeTargetUid || targetUid === activeTargetUid) {
        const payload = JSON.parse(init.body);
        outgoingReplyId = pendingReply.id;
        nextInit = {
          ...init,
          body: JSON.stringify({ ...payload, replyToMessageId: pendingReply.id })
        };
      }
    } catch {}
  }

  const response = await upstreamFetch(input, nextInit);
  if (!info || !response.ok) return response;

  if (info.method === "GET" && info.url.pathname === "/api/messages") {
    void response.clone().json().then((result: ConversationResult) => {
      applyConversations(result);
    }).catch(() => {});
    return response;
  }

  const threadGetMatch = info.url.pathname.match(/^\/api\/messages\/([^/]+)$/);
  if (info.method === "GET" && threadGetMatch) {
    const targetUid = decodeURIComponent(threadGetMatch[1]);
    void response.clone().json().then((result: ThreadResult) => {
      const messages = Array.isArray(result?.messages) ? result.messages : [];
      const before = info.url.searchParams.get("before") || "";
      activeTargetUid = targetUid;
      activeMeUid = inferMeUid(messages, targetUid);
      if (before) {
        const known = new Set(activeMessages.map(item => item.id));
        activeMessages = [...messages.filter(item => !known.has(item.id)), ...activeMessages];
      } else {
        activeMessages = messages;
      }
      scheduleSync();
    }).catch(() => {});
    return response;
  }

  if (info.method === "POST" && threadSendMatch) {
    void response.clone().json().then((result: { message?: MessageSnapshot }) => {
      if (result?.message) mergeMessage(result.message);
      if (outgoingReplyId && pendingReply?.id === outgoingReplyId) clearPendingReply();
      scheduleSync();
    }).catch(() => {});
  }

  return response;
};

function applyConversations(result: ConversationResult | null | undefined) {
  const next = Array.isArray(result?.conversations) ? result!.conversations! : [];

  if (unreadBaselineReady) {
    for (const item of next) {
      const uid = String(item.targetUid || "");
      if (!uid) continue;
      const previous = Number(unreadByTarget.get(uid) || 0);
      const current = Math.max(0, Number(item.unreadCount || 0));
      if (current > previous && uid !== activeTargetUid) {
        showIncomingAlert(item);
      }
    }
  }

  unreadByTarget.clear();
  for (const item of next) unreadByTarget.set(String(item.targetUid || ""), Math.max(0, Number(item.unreadCount || 0)));
  unreadBaselineReady = true;
  conversations = next;
  scheduleSync();
}

function messagePreview(message: MessageSnapshot) {
  if (message.cancelledAt) return "Mensagem cancelada";
  const text = String(message.text || "").trim();
  if (text) return text.slice(0, 120);
  const attachment = message.attachments?.[0];
  const type = String(attachment?.contentType || "");
  if (type.startsWith("audio/")) return "Mensagem de áudio";
  if (type.startsWith("image/")) return "Foto";
  if (type.startsWith("video/")) return "Vídeo";
  if (attachment) return "Arquivo";
  if (message.sharedPost) return "Publicação compartilhada";
  return "Mensagem";
}

function replyPreview(message: MessageSnapshot) {
  const reply = message.replyTo;
  if (!reply) return "";
  const owner = reply.senderUid && reply.senderUid === activeMeUid ? "Você" : "Mensagem";
  const text = reply.cancelledAt ? "Mensagem cancelada" : String(reply.text || "Mensagem").trim();
  return `${owner}: ${text}`.slice(0, 150);
}

function syncRows() {
  const scroll = document.querySelector<HTMLElement>(".message-thread.open .message-scroll, .message-thread .message-scroll");
  if (!scroll) return;
  const rows = Array.from(scroll.querySelectorAll<HTMLElement>(".message-bubble-row"));
  const offset = Math.max(0, activeMessages.length - rows.length);

  rows.forEach((row, index) => {
    const message = activeMessages[index + offset];
    const bubble = row.querySelector<HTMLElement>(".message-bubble");
    if (!message || !bubble) return;
    row.dataset.uorquiMessageId = message.id;
    bubble.dataset.uorquiMessageId = message.id;
    const reply = replyPreview(message);
    if (reply) bubble.dataset.uorquiReplyPreview = reply;
    else delete bubble.dataset.uorquiReplyPreview;
    const likeCount = Array.isArray(message.likedBy) ? message.likedBy.length : 0;
    if (likeCount > 0) bubble.dataset.uorquiLikeCount = String(likeCount);
    else delete bubble.dataset.uorquiLikeCount;
  });

  const contacts = Array.from(document.querySelectorAll<HTMLElement>(".message-contact"));
  contacts.forEach((contact, index) => {
    const conversation = conversations[index];
    if (conversation?.targetUid) contact.dataset.uorquiTargetUid = conversation.targetUid;
  });

  syncReplyComposer();
}

function scheduleSync() {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      syncQueued = false;
      syncRows();
    });
  });
}

function setPendingReply(message: MessageSnapshot) {
  pendingReply = {
    id: message.id,
    senderUid: message.senderUid,
    text: messagePreview(message)
  };
  syncReplyComposer();
  closeActionDock();
  document.querySelector<HTMLTextAreaElement>(".message-composer textarea[name='message']")?.focus();
}

function clearPendingReply() {
  pendingReply = null;
  syncReplyComposer();
}

function syncReplyComposer() {
  const composer = document.querySelector<HTMLElement>(".message-thread.open .message-composer, .message-thread .message-composer");
  if (!composer) return;
  if (!pendingReply) {
    delete composer.dataset.uorquiReply;
    return;
  }
  const owner = pendingReply.senderUid === activeMeUid ? "Você" : "Mensagem";
  composer.dataset.uorquiReply = `${owner}: ${pendingReply.text}`.slice(0, 160);
}

function selectedMessage() {
  return activeMessages.find(item => item.id === selectedMessageId) || null;
}

function closeActionDock() {
  document.querySelector(".uorqui-message-action-dock")?.remove();
  selectedMessageId = "";
}

function showActionDock(bubble: HTMLElement, message: MessageSnapshot) {
  closeActionDock();
  selectedMessageId = message.id;

  const dock = document.createElement("div");
  dock.className = "uorqui-message-action-dock";
  const meUid = activeMeUid || inferMeUid([message], activeTargetUid);
  const liked = Array.isArray(message.likedBy) && Boolean(meUid) && message.likedBy.includes(meUid);

  const reply = document.createElement("button");
  reply.type = "button";
  reply.textContent = "Responder";
  reply.addEventListener("click", (event) => {
    event.stopPropagation();
    const current = selectedMessage();
    if (current) setPendingReply(current);
    document.querySelector<HTMLButtonElement>(".message-details-close")?.click();
  });

  const like = document.createElement("button");
  like.type = "button";
  like.textContent = liked ? "Descurtir ♥" : "Curtir ♡";
  like.dataset.liked = liked ? "1" : "0";
  like.addEventListener("click", async (event) => {
    event.stopPropagation();
    const current = selectedMessage();
    if (!current || !activeTargetUid) return;
    like.disabled = true;
    try {
      const result = await api<{ liked: boolean; likedBy?: string[]; message?: MessageSnapshot }>(
        `/messages/${encodeURIComponent(activeTargetUid)}/${encodeURIComponent(current.id)}/reaction`,
        { method: "POST" }
      );
      const updated = result.message || { ...current, likedBy: result.likedBy || [] };
      mergeMessage(updated);
      like.textContent = result.liked ? "Descurtir ♥" : "Curtir ♡";
      like.dataset.liked = result.liked ? "1" : "0";
      scheduleSync();
    } catch {
      showLocalToast("Não foi possível reagir à mensagem.");
    } finally {
      like.disabled = false;
    }
  });

  dock.append(reply, like);
  document.body.appendChild(dock);
  const rect = bubble.getBoundingClientRect();
  const width = dock.offsetWidth || 170;
  const height = dock.offsetHeight || 40;
  const mine = bubble.closest(".message-bubble-row")?.classList.contains("mine");
  const top = Math.min(window.innerHeight - height - 10, rect.bottom + 6);
  const desiredLeft = mine ? rect.right - width : rect.left;
  const left = Math.max(10, Math.min(desiredLeft, window.innerWidth - width - 10));
  dock.style.top = `${Math.max(10, top)}px`;
  dock.style.left = `${left}px`;
}

async function sendRecordedAudioFromPreview(button: HTMLButtonElement) {
  if (audioSendBusy || !activeTargetUid) return;
  const preview = button.closest(".message-compose-line")?.querySelector<HTMLAudioElement>(".message-audio-preview audio");
  if (!preview?.src) return;

  audioSendBusy = true;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    const response = await upstreamFetch(preview.src);
    const blob = await response.blob();
    if (!blob.size) throw new Error("A gravação está vazia.");
    if (blob.size > 20 * 1024 * 1024) throw new Error("O áudio ultrapassou o limite de 20 MB.");

    const type = blob.type || "audio/mp4";
    const ext = type.includes("mp4") || type.includes("m4a") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
    const file = new File([blob], `audio-${Date.now()}.${ext}`, { type });
    const qs = new URLSearchParams({ scope: "message", targetUid: activeTargetUid, name: file.name });
    const uploaded = await api<{ media: { id: string } }>(`/media/upload?${qs}`, {
      method: "POST",
      headers: { "Content-Type": type, "X-File-Name": file.name },
      body: file
    });

    await api(`/messages/${encodeURIComponent(activeTargetUid)}`, {
      method: "POST",
      body: JSON.stringify({ text: "", attachmentIds: [uploaded.media.id], postId: "" })
    });

    document.querySelector<HTMLButtonElement>(".message-audio-cancel")?.click();
    showLocalToast("Áudio enviado.");
    refreshOpenConversation(activeTargetUid);
  } catch (error) {
    showLocalToast(error instanceof Error ? error.message : "Não foi possível enviar o áudio.");
  } finally {
    audioSendBusy = false;
    if (button.isConnected) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }
}

function refreshOpenConversation(targetUid: string) {
  const back = document.querySelector<HTMLButtonElement>(".message-thread.open .message-mobile-back, .message-thread .message-mobile-back");
  if (!back) return;
  back.click();
  window.setTimeout(() => {
    scheduleSync();
    window.setTimeout(() => {
      const contact = Array.from(document.querySelectorAll<HTMLButtonElement>(".message-contact"))
        .find(item => item.dataset.uorquiTargetUid === targetUid);
      contact?.click();
    }, 40);
  }, 40);
}

function showLocalToast(text: string) {
  document.querySelector(".uorqui-message-local-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "uorqui-message-local-toast";
  toast.textContent = text;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2600);
}

function showIncomingAlert(conversation: ConversationSnapshot) {
  document.querySelector(".uorqui-message-inapp-alert")?.remove();
  const alert = document.createElement("button");
  alert.type = "button";
  alert.className = "uorqui-message-inapp-alert";
  const copy = document.createElement("span");
  const title = document.createElement("strong");
  const body = document.createElement("small");
  title.textContent = conversation.displayName || "Nova mensagem";
  body.textContent = "Enviou uma mensagem";
  copy.append(title, body);
  alert.append(copy);
  alert.addEventListener("click", () => {
    alert.remove();
    openConversation(conversation.targetUid);
  });
  document.body.appendChild(alert);
  window.setTimeout(() => alert.remove(), 5200);
}

function openConversation(targetUid: string) {
  const direct = Array.from(document.querySelectorAll<HTMLButtonElement>(".message-contact"))
    .find(item => item.dataset.uorquiTargetUid === targetUid);
  if (direct) {
    direct.click();
    return;
  }

  const messagesNav = Array.from(document.querySelectorAll<HTMLButtonElement>(".side-nav button, .mobile-nav button"))
    .find(button => (button.textContent || "").toLocaleLowerCase("pt-BR").includes("mensagens"));
  messagesNav?.click();

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    scheduleSync();
    const contact = Array.from(document.querySelectorAll<HTMLButtonElement>(".message-contact"))
      .find(item => item.dataset.uorquiTargetUid === targetUid);
    if (contact || attempts >= 20) {
      window.clearInterval(timer);
      contact?.click();
    }
  }, 100);
}

document.addEventListener("click", (event) => {
  const target = event.target as Element | null;
  const bubble = target?.closest<HTMLElement>(".message-bubble[data-uorqui-message-id]");
  if (bubble) {
    const message = activeMessages.find(item => item.id === bubble.dataset.uorquiMessageId);
    if (message) window.setTimeout(() => showActionDock(bubble, message), 0);
    return;
  }

  const composer = target?.closest<HTMLElement>(".message-composer[data-uorqui-reply]");
  if (composer && pendingReply) {
    const rect = composer.getBoundingClientRect();
    if (event.clientY <= rect.top + 40) {
      event.preventDefault();
      clearPendingReply();
      return;
    }
  }

  if (!target?.closest(".uorqui-message-action-dock")) closeActionDock();
});

// O handler original do React trava antes de iniciar o upload porque marca
// audioSendingRef=true e a função compartilhada recusa o envio com esse mesmo
// flag. Interceptamos apenas o botão de áudio já gravado; texto/foto/vídeo
// continuam no fluxo React original.
document.addEventListener("click", (event) => {
  const target = event.target as Element | null;
  const button = target?.closest<HTMLButtonElement>('button[aria-label="Enviar áudio"]');
  if (!button || !button.closest(".message-audio-preview")?.parentElement && !button.closest(".message-compose-line")?.querySelector(".message-audio-preview")) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  void sendRecordedAudioFromPreview(button);
}, true);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && pendingReply) clearPendingReply();
});

const observer = new MutationObserver(scheduleSync);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("uorqui:realtime-refresh", scheduleSync);
scheduleSync();
