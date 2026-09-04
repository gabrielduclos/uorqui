import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  ArrowLeft, Camera, Heart, MessageCircleReply, MessageSquareText, Mic, Search, Send,
  Share2, Square, Trash2, Video, X
} from "lucide-react";
import { auth } from "./lib/firebase";
import { api, mediaBlobUrl } from "./lib/api";
import { Avatar } from "./components/Avatar";

export type MessageRealtimeDetail = {
  type?: string;
  event?: string;
  peerUid?: string;
  sentAt?: string;
  message?: DirectMessage;
  conversation?: { status?: string; requestedBy?: string } | null;
  likedBy?: string[];
};

type Conversation = {
  id: string;
  targetUid: string;
  displayName: string;
  username?: string;
  avatarMediaId?: string;
  status: "pending" | "accepted";
  requestedBy?: string;
  lastMessagePreview?: string;
  lastMessageAt?: string;
  unreadCount?: number;
};

type ReplySummary = {
  id?: string;
  senderUid?: string;
  text?: string;
  cancelledAt?: string;
} | null;

type DirectMessage = {
  id: string;
  senderUid: string;
  recipientUid: string;
  text?: string;
  createdAt?: string;
  readAt?: string;
  cancelledAt?: string;
  attachments?: Array<{ id: string; name?: string; contentType?: string; size?: number }>;
  sharedPost?: { id: string; authorName?: string; text?: string; scope?: string; companyId?: string } | null;
  replyToMessageId?: string;
  replyTo?: ReplySummary;
  likedBy?: string[];
  optimistic?: boolean;
};

type ThreadResult = {
  conversation?: { status?: string; requestedBy?: string } | null;
  messages?: DirectMessage[];
  nextBefore?: string;
};

type Surface = { top: number; left: number; width: number; bottom: number };

type ExternalMessageTarget = { targetUid?: string; postId?: string };

let pendingExternalTarget = "";
let pendingExternalPost = "";

// Captura o alvo antes do listener legado do App limpar o sessionStorage.
window.addEventListener("uorqui:open-messages", () => {
  try {
    pendingExternalTarget = sessionStorage.getItem("uorqui-message-target") || pendingExternalTarget;
    pendingExternalPost = sessionStorage.getItem("uorqui-message-post") || pendingExternalPost;
  } catch {}
  window.dispatchEvent(new CustomEvent<ExternalMessageTarget>("uorqui:instagram-message-target", {
    detail: { targetUid: pendingExternalTarget, postId: pendingExternalPost }
  }));
});

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir agora.";
}

function uniqueMessages(items: DirectMessage[]) {
  const map = new Map<string, DirectMessage>();
  for (const item of items) if (item?.id) map.set(item.id, item);
  return [...map.values()].sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return ta - tb;
  });
}

function sortConversations(items: Conversation[]) {
  return [...items].sort((a, b) => {
    const ta = new Date(a.lastMessageAt || 0).getTime();
    const tb = new Date(b.lastMessageAt || 0).getTime();
    return tb - ta;
  });
}

function nearBottom(node: HTMLElement | null, threshold = 120) {
  if (!node) return true;
  return node.scrollHeight - node.clientHeight - node.scrollTop <= threshold;
}

function messagePreview(message: DirectMessage) {
  if (message.cancelledAt) return "Mensagem cancelada";
  const text = String(message.text || "").trim();
  if (text) return text;
  const attachment = message.attachments?.[0];
  const type = String(attachment?.contentType || "");
  if (type.startsWith("audio/")) return "Mensagem de áudio";
  if (type.startsWith("image/")) return "Foto";
  if (type.startsWith("video/")) return "Vídeo";
  if (attachment) return "Arquivo";
  if (message.sharedPost) return "Publicação compartilhada";
  return "Mensagem";
}

function listTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function clock(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "";
}

function useMessageSurface() {
  const [surface, setSurface] = useState<Surface | null>(null);
  const hiddenRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let frame = 0;

    const restore = () => {
      const previous = hiddenRef.current;
      if (!previous) return;
      previous.style.visibility = "";
      previous.style.pointerEvents = "";
      previous.removeAttribute("aria-hidden");
      hiddenRef.current = null;
    };

    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const page = document.querySelector<HTMLElement>(".messages-page");
        if (!page) {
          restore();
          setSurface(null);
          return;
        }

        if (hiddenRef.current && hiddenRef.current !== page) restore();
        hiddenRef.current = page;
        page.style.visibility = "hidden";
        page.style.pointerEvents = "none";
        page.setAttribute("aria-hidden", "true");

        const rect = page.getBoundingClientRect();
        const nav = document.querySelector<HTMLElement>(".mobile-nav");
        const navRect = nav?.getBoundingClientRect();
        const navVisible = Boolean(nav && getComputedStyle(nav).display !== "none" && navRect?.height);
        const bottom = navVisible && navRect ? Math.max(0, window.innerHeight - navRect.top) : 0;
        const next = {
          top: Math.max(0, Math.round(rect.top)),
          left: Math.max(0, Math.round(rect.left)),
          width: Math.max(280, Math.round(rect.width)),
          bottom: Math.round(bottom)
        };
        setSurface(current => current &&
          current.top === next.top && current.left === next.left && current.width === next.width && current.bottom === next.bottom
          ? current
          : next
        );
      });
    };

    const observer = new MutationObserver(measure);
    observer.observe(document.getElementById("root") || document.body, { childList: true, subtree: true });
    window.addEventListener("resize", measure, { passive: true });
    window.addEventListener("scroll", measure, { passive: true });
    measure();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
      restore();
    };
  }, []);

  return surface;
}

function InstagramMessagesPage() {
  const [meUid, setMeUid] = useState(() => auth.currentUser?.uid || "");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [targetUid, setTargetUid] = useState("");
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [conversation, setConversation] = useState<{ status?: string; requestedBy?: string } | null>(null);
  const [nextBefore, setNextBefore] = useState("");
  const [threadLoading, setThreadLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Array<{ uid: string; displayName?: string; username?: string; avatarMediaId?: string }>>([]);
  const [peopleBusy, setPeopleBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null);
  const [sharedPostId, setSharedPostId] = useState("");
  const [actionBusy, setActionBusy] = useState("");
  const [recording, setRecording] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [localError, setLocalError] = useState("");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef("");
  const realtimeTimerRef = useRef(0);
  const threadRequestRef = useRef(0);
  const shouldStickRef = useRef(true);
  const prependRestoreRef = useRef<{ height: number; top: number } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => onAuthStateChanged(auth, user => setMeUid(user?.uid || "")), []);
  useEffect(() => { targetRef.current = targetUid; }, [targetUid]);

  const loadConversations = useCallback(async (offset = 0, quiet = false) => {
    if (!quiet) setListLoading(true);
    try {
      const result = await api<{ conversations?: Conversation[]; nextOffset?: number | null }>(`/messages?offset=${offset}&limit=30`);
      const next = Array.isArray(result.conversations) ? result.conversations : [];
      setConversations(current => {
        if (!offset) return next;
        const map = new Map(current.map(item => [item.targetUid, item]));
        for (const item of next) map.set(item.targetUid, item);
        return [...map.values()];
      });
      setNextOffset(result.nextOffset ?? null);
    } catch (error) {
      if (!quiet) setLocalError(errorText(error));
    } finally {
      if (!quiet) setListLoading(false);
    }
  }, []);

  const loadThread = useCallback(async (
    uid: string,
    options: { before?: string; mode?: "open" | "realtime" | "older" } = {}
  ) => {
    if (!uid) return;
    const mode = options.mode || "open";
    const before = options.before || "";
    const requestId = ++threadRequestRef.current;
    const scroll = scrollRef.current;

    if (mode === "older" && scroll) {
      prependRestoreRef.current = { height: scroll.scrollHeight, top: scroll.scrollTop };
      shouldStickRef.current = false;
    } else if (mode === "realtime") {
      shouldStickRef.current = nearBottom(scroll);
    } else {
      shouldStickRef.current = true;
      setThreadLoading(true);
    }

    try {
      const qs = before ? `?before=${encodeURIComponent(before)}&limit=40` : "?limit=40";
      const result = await api<ThreadResult>(`/messages/${encodeURIComponent(uid)}${qs}`);
      if (targetRef.current !== uid) return;
      if (mode !== "older" && requestId !== threadRequestRef.current) return;

      const incoming = Array.isArray(result.messages) ? result.messages : [];
      setConversation(result.conversation || null);
      setNextBefore(result.nextBefore || "");
      setMessages(current => mode === "older"
        ? uniqueMessages([...incoming, ...current])
        : uniqueMessages(incoming)
      );
    } catch (error) {
      if (mode === "open") setLocalError(errorText(error));
    } finally {
      if (mode === "open" && targetRef.current === uid) setThreadLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations(0, false);
  }, [loadConversations]);

  useEffect(() => {
    if (!targetUid) {
      setMessages([]);
      setConversation(null);
      setNextBefore("");
      setReplyTo(null);
      return;
    }
    setLocalError("");
    setMessages([]);
    setConversation(null);
    setNextBefore("");
    setReplyTo(null);
    void loadThread(targetUid, { mode: "open" });
  }, [targetUid, loadThread]);

  useEffect(() => {
    const detail: ExternalMessageTarget = {
      targetUid: pendingExternalTarget,
      postId: pendingExternalPost
    };
    if (detail.targetUid) setTargetUid(detail.targetUid);
    if (detail.postId) setSharedPostId(detail.postId);

    const handler = (event: Event) => {
      const next = (event as CustomEvent<ExternalMessageTarget>).detail || {};
      const uid = String(next.targetUid || pendingExternalTarget || "");
      const postId = String(next.postId || pendingExternalPost || "");
      if (uid) setTargetUid(uid);
      if (postId) setSharedPostId(postId);
    };
    window.addEventListener("uorqui:instagram-message-target", handler);
    return () => window.removeEventListener("uorqui:instagram-message-target", handler);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<MessageRealtimeDetail>).detail || {};
      if (detail.type !== "refresh") return;
      const peerUid = String(detail.peerUid || "");
      const incoming = detail.message;

      if (peerUid && incoming?.id) {
        const active = peerUid === targetRef.current;
        const fromPeer = incoming.senderUid === peerUid;
        shouldStickRef.current = active ? nearBottom(scrollRef.current) : shouldStickRef.current;

        if (active) {
          setMessages(current => uniqueMessages([
            ...current.filter(item => !(item.optimistic && item.senderUid === incoming.senderUid && item.text === incoming.text)),
            incoming
          ]));
          if (detail.conversation) setConversation(detail.conversation);
        }

        let foundPeer = false;
        setConversations(current => {
          const next = current.map(item => {
            if (item.targetUid !== peerUid) return item;
            foundPeer = true;
            const unread = active || !fromPeer ? 0 : Number(item.unreadCount || 0) + 1;
            return {
              ...item,
              status: (detail.conversation?.status === "pending" ? "pending" : detail.conversation?.status === "accepted" ? "accepted" : item.status),
              requestedBy: detail.conversation?.requestedBy ?? item.requestedBy,
              lastMessagePreview: messagePreview(incoming),
              lastMessageAt: incoming.createdAt || detail.sentAt || item.lastMessageAt,
              unreadCount: unread
            };
          });
          return sortConversations(next);
        });

        // Conversa totalmente nova é rara; somente nesse caso buscamos os dados
        // de perfil/metadata que não fazem parte do delta da mensagem.
        window.clearTimeout(realtimeTimerRef.current);
        realtimeTimerRef.current = window.setTimeout(() => {
          setConversations(current => {
            if (current.some(item => item.targetUid === peerUid)) return current;
            void loadConversations(0, true);
            return current;
          });
        }, foundPeer ? 0 : 250);
        return;
      }

      if (peerUid && incoming?.id && (detail.event === "message_reaction" || detail.event === "message_cancelled")) {
        if (peerUid === targetRef.current) {
          setMessages(current => current.map(item => item.id === incoming.id ? incoming : item));
        }
        return;
      }

      if (detail.event === "message_conversation" && peerUid) {
        if (peerUid === targetRef.current && detail.conversation) setConversation(detail.conversation);
        if (detail.conversation) {
          setConversations(current => current.map(item => item.targetUid === peerUid ? {
            ...item,
            status: detail.conversation?.status === "pending" ? "pending" : "accepted",
            requestedBy: detail.conversation?.requestedBy ?? item.requestedBy
          } : item));
          return;
        }
      }

      // Compatibilidade com eventos antigos/sem delta: um único refresh atrasado,
      // nunca uma releitura imediata em cascata.
      window.clearTimeout(realtimeTimerRef.current);
      realtimeTimerRef.current = window.setTimeout(() => {
        void loadConversations(0, true);
        if (peerUid && peerUid === targetRef.current) void loadThread(peerUid, { mode: "realtime" });
      }, 1200);
    };
    window.addEventListener("uorqui:message-realtime", handler);
    return () => {
      window.clearTimeout(realtimeTimerRef.current);
      window.removeEventListener("uorqui:message-realtime", handler);
    };
  }, [loadConversations, loadThread]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    if (prependRestoreRef.current) {
      const restore = prependRestoreRef.current;
      prependRestoreRef.current = null;
      scroll.scrollTop = restore.top + Math.max(0, scroll.scrollHeight - restore.height);
      return;
    }
    if (shouldStickRef.current) scroll.scrollTop = scroll.scrollHeight;
  }, [messages, targetUid, threadLoading]);

  useEffect(() => {
    const ids = [...new Set(messages.flatMap(message => (message.attachments || []).map(item => item.id)).filter(Boolean))];
    for (const id of ids) {
      if (mediaUrls[id]) continue;
      mediaBlobUrl(id)
        .then(url => setMediaUrls(current => current[id] ? current : { ...current, [id]: url }))
        .catch(() => {});
    }
  }, [messages, mediaUrls]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setPeople([]);
      setPeopleBusy(false);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setPeopleBusy(true);
      api<{ people?: Array<{ uid: string; displayName?: string; username?: string; avatarMediaId?: string }> }>(`/social/people?q=${encodeURIComponent(normalized)}`)
        .then(result => { if (active) setPeople((result.people || []).filter(person => person.uid !== meUid)); })
        .catch(() => { if (active) setPeople([]); })
        .finally(() => { if (active) setPeopleBusy(false); });
    }, 220);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, meUid]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const target = useMemo(() => conversations.find(item => item.targetUid === targetUid), [conversations, targetUid]);
  const latestOwnMessageId = useMemo(() => [...messages].reverse().find(item => item.senderUid === meUid)?.id || "", [messages, meUid]);

  const openPerson = (person: { uid: string; displayName?: string; username?: string; avatarMediaId?: string }) => {
    setConversations(current => current.some(item => item.targetUid === person.uid) ? current : [{
      id: `new_${person.uid}`,
      targetUid: person.uid,
      displayName: person.displayName || person.username || "Usuário",
      username: person.username || "",
      avatarMediaId: person.avatarMediaId || "",
      status: "accepted",
      unreadCount: 0,
      lastMessagePreview: "Nova conversa"
    }, ...current]);
    setTargetUid(person.uid);
    setQuery("");
    setPeople([]);
  };

  const uploadFiles = async (uid: string, payloadFiles: File[]) => {
    const attachmentIds: string[] = [];
    for (const file of payloadFiles.slice(0, 4)) {
      if (file.size > 20 * 1024 * 1024) throw new Error("Cada arquivo pode ter no máximo 20 MB.");
      const qs = new URLSearchParams({ scope: "message", targetUid: uid, name: file.name });
      const uploaded = await api<{ media: { id: string } }>(`/media/upload?${qs}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": file.name },
        body: file
      });
      attachmentIds.push(uploaded.media.id);
    }
    return attachmentIds;
  };

  const sendPayload = async (payload: { text?: string; payloadFiles?: File[]; postId?: string }) => {
    if (!targetUid || busy) return;
    const cleanText = String(payload.text || "").trim();
    const payloadFiles = payload.payloadFiles || [];
    const postId = payload.postId || "";
    if (!cleanText && !payloadFiles.length && !postId) return;

    setBusy(true);
    setLocalError("");
    shouldStickRef.current = true;
    const currentReply = replyTo;
    const optimisticId = `optimistic_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const optimistic = cleanText && !payloadFiles.length && !postId ? {
      id: optimisticId,
      senderUid: meUid,
      recipientUid: targetUid,
      text: cleanText,
      createdAt: new Date().toISOString(),
      replyToMessageId: currentReply?.id,
      replyTo: currentReply ? {
        id: currentReply.id,
        senderUid: currentReply.senderUid,
        text: messagePreview(currentReply),
        cancelledAt: currentReply.cancelledAt
      } : null,
      optimistic: true
    } satisfies DirectMessage : null;

    if (optimistic) setMessages(current => [...current, optimistic]);
    setText("");
    setReplyTo(null);

    try {
      const attachmentIds = await uploadFiles(targetUid, payloadFiles);
      const result = await api<{ message: DirectMessage; conversation?: { status?: string; requestedBy?: string } }>(
        `/messages/${encodeURIComponent(targetUid)}`,
        {
          method: "POST",
          body: JSON.stringify({
            text: cleanText,
            attachmentIds,
            postId,
            replyToMessageId: currentReply?.id || ""
          })
        }
      );
      setMessages(current => uniqueMessages([
        ...current.filter(item => item.id !== optimisticId),
        result.message
      ]));
      if (result.conversation) setConversation(result.conversation);
      setConversations(current => sortConversations(current.map(item => item.targetUid === targetUid ? {
        ...item,
        status: result.conversation?.status === "pending" ? "pending" : result.conversation?.status === "accepted" ? "accepted" : item.status,
        requestedBy: result.conversation?.requestedBy ?? item.requestedBy,
        lastMessagePreview: messagePreview(result.message),
        lastMessageAt: result.message.createdAt || new Date().toISOString(),
        unreadCount: 0
      } : item)));
      setFiles([]);
      setSharedPostId("");
      pendingExternalPost = "";
      try { sessionStorage.removeItem("uorqui-message-post"); } catch {}
    } catch (error) {
      setMessages(current => current.filter(item => item.id !== optimisticId));
      if (cleanText) setText(cleanText);
      if (currentReply) setReplyTo(currentReply);
      setLocalError(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void sendPayload({ text, payloadFiles: files, postId: sharedPostId });
  };

  const handleComposerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    if (!window.matchMedia("(pointer:fine)").matches) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const toggleLike = async (message: DirectMessage) => {
    if (!targetUid || actionBusy || message.optimistic) return;
    setActionBusy(message.id);
    try {
      const result = await api<{ message?: DirectMessage; likedBy?: string[] }>(
        `/messages/${encodeURIComponent(targetUid)}/${encodeURIComponent(message.id)}/reaction`,
        { method: "POST" }
      );
      setMessages(current => current.map(item => item.id === message.id
        ? (result.message || { ...item, likedBy: result.likedBy || [] })
        : item
      ));
    } catch (error) {
      setLocalError(errorText(error));
    } finally {
      setActionBusy("");
    }
  };

  const cancelMessage = async (message: DirectMessage) => {
    if (!targetUid || actionBusy || message.senderUid !== meUid || message.cancelledAt || message.optimistic) return;
    setActionBusy(message.id);
    try {
      const result = await api<{ message: DirectMessage }>(
        `/messages/${encodeURIComponent(targetUid)}/${encodeURIComponent(message.id)}`,
        { method: "DELETE" }
      );
      setMessages(current => current.map(item => item.id === message.id ? result.message : item));
      setConversations(current => current.map(item => item.targetUid === targetUid && item.lastMessageAt === message.createdAt ? {
        ...item,
        lastMessagePreview: messagePreview(result.message)
      } : item));
    } catch (error) {
      setLocalError(errorText(error));
    } finally {
      setActionBusy("");
    }
  };

  const decideRequest = async (accept: boolean) => {
    if (!targetUid || busy) return;
    setBusy(true);
    try {
      await api(`/messages/${encodeURIComponent(targetUid)}/${accept ? "accept" : "request"}`, {
        method: accept ? "POST" : "DELETE"
      });
      if (!accept) {
        setConversations(current => current.filter(item => item.targetUid !== targetUid));
        setTargetUid("");
      } else {
        setConversation(current => ({ ...(current || {}), status: "accepted" }));
        setConversations(current => current.map(item => item.targetUid === targetUid ? { ...item, status: "accepted" } : item));
      }
    } catch (error) {
      setLocalError(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const deleteConversation = async () => {
    if (!targetUid || busy) return;
    if (!confirm("Apagar esta conversa somente para você?")) return;
    setBusy(true);
    try {
      await api(`/messages/${encodeURIComponent(targetUid)}`, { method: "DELETE" });
      setConversations(current => current.filter(item => item.targetUid !== targetUid));
      setTargetUid("");
      setMessages([]);
      setConversation(null);
    } catch (error) {
      setLocalError(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const clearAudio = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl("");
    setAudioFile(null);
  };

  const startRecording = async () => {
    if (recording || busy || audioFile) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setLocalError("Este navegador não oferece gravação de áudio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const preferred = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
      const mimeType = preferred.find(type => MediaRecorder.isTypeSupported?.(type)) || "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data?.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        setRecording(false);
        const chunks = chunksRef.current.splice(0);
        if (!chunks.length) return;
        const type = recorder.mimeType || chunks[0]?.type || "audio/webm";
        const blob = new Blob(chunks, { type });
        if (blob.size < 400) return;
        const ext = type.includes("mp4") || type.includes("m4a") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `audio-${Date.now()}.${ext}`, { type });
        setAudioFile(file);
        setAudioUrl(URL.createObjectURL(file));
      };
      recorder.start(250);
      setRecording(true);
    } catch {
      setLocalError("Autorize o microfone para gravar áudio.");
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };

  return (
    <section className={`ig-messages ${targetUid ? "has-thread" : ""}`} aria-label="Mensagens privadas">
      <aside className="ig-conversations">
        <header className="ig-list-header">
          <div>
            <h2>Mensagens</h2>
            <span>Conversas privadas</span>
          </div>
        </header>

        <div className="ig-search-wrap">
          <Search size={17} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar pessoas" aria-label="Buscar pessoas" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca"><X size={15} /></button>}
        </div>

        {query.trim().length >= 2 && (
          <div className="ig-people-results">
            {peopleBusy && <div className="ig-list-status">Buscando…</div>}
            {!peopleBusy && people.map(person => (
              <button type="button" key={person.uid} onClick={() => openPerson(person)}>
                <Avatar name={person.displayName || person.username || "Usuário"} mediaId={person.avatarMediaId} size={44} />
                <span><strong>{person.displayName || "Usuário"}</strong>{person.username && <small>@{person.username.replace(/^@/, "")}</small>}</span>
              </button>
            ))}
            {!peopleBusy && !people.length && <div className="ig-list-status">Nenhum usuário encontrado.</div>}
          </div>
        )}

        <div className="ig-conversation-scroll">
          {listLoading && !conversations.length && <div className="ig-list-status">Carregando conversas…</div>}
          {conversations.map(item => (
            <button
              type="button"
              className={`ig-conversation ${item.targetUid === targetUid ? "active" : ""}`}
              key={item.id || item.targetUid}
              onClick={() => setTargetUid(item.targetUid)}
            >
              <Avatar name={item.displayName || "Usuário"} mediaId={item.avatarMediaId} size={48} />
              <span className="ig-conversation-copy">
                <span className="ig-conversation-name"><strong>{item.displayName || "Usuário"}</strong><time>{listTime(item.lastMessageAt)}</time></span>
                <small>{item.lastMessagePreview || "Inicie uma conversa"}</small>
              </span>
              {!!item.unreadCount && <b className="ig-unread">{item.unreadCount > 99 ? "99+" : item.unreadCount}</b>}
            </button>
          ))}
          {nextOffset !== null && <button className="ig-load-more" type="button" onClick={() => void loadConversations(nextOffset)}>Carregar mais</button>}
          {!listLoading && !conversations.length && !query && (
            <div className="ig-list-empty"><MessageSquareText size={25} /><strong>Nenhuma conversa ainda</strong><span>Busque uma pessoa acima para começar.</span></div>
          )}
        </div>
      </aside>

      <section className="ig-thread">
        {!targetUid ? (
          <div className="ig-thread-empty">
            <div><MessageSquareText size={30} /></div>
            <h3>Suas mensagens</h3>
            <p>Envie fotos, vídeos, áudios e mensagens privadas sem sair do Uorqui.</p>
            <button type="button" onClick={() => document.querySelector<HTMLInputElement>(".ig-search-wrap input")?.focus()}>Enviar mensagem</button>
          </div>
        ) : (
          <>
            <header className="ig-thread-header">
              <button type="button" className="ig-back" onClick={() => setTargetUid("")} aria-label="Voltar às conversas"><ArrowLeft size={21} /></button>
              <Avatar name={target?.displayName || "Usuário"} mediaId={target?.avatarMediaId} size={42} />
              <div className="ig-thread-person">
                <strong>{target?.displayName || "Conversa"}</strong>
                {target?.username && <small>@{target.username.replace(/^@/, "")}</small>}
              </div>
              <button type="button" className="ig-thread-delete" onClick={() => void deleteConversation()} disabled={busy} aria-label="Apagar conversa"><Trash2 size={18} /></button>
            </header>

            {conversation?.status === "pending" && conversation.requestedBy !== meUid && (
              <div className="ig-request">
                <span><strong>Solicitação de mensagem</strong><small>Aceite para continuar a conversa.</small></span>
                <button type="button" onClick={() => void decideRequest(true)} disabled={busy}>Aceitar</button>
                <button type="button" onClick={() => void decideRequest(false)} disabled={busy}>Ignorar</button>
              </div>
            )}

            <div className="ig-thread-scroll" ref={scrollRef} onScroll={event => { shouldStickRef.current = nearBottom(event.currentTarget); }}>
              {nextBefore && (
                <button className="ig-load-more" type="button" onClick={() => void loadThread(targetUid, { before: nextBefore, mode: "older" })}>
                  Mensagens anteriores
                </button>
              )}
              {threadLoading && !messages.length && <div className="ig-thread-loading">Carregando conversa…</div>}

              {messages.map((message, index) => {
                const mine = message.senderUid === meUid;
                const liked = Boolean(meUid && message.likedBy?.includes(meUid));
                const previous = messages[index - 1];
                const compact = previous && previous.senderUid === message.senderUid &&
                  Math.abs(new Date(message.createdAt || 0).getTime() - new Date(previous.createdAt || 0).getTime()) < 5 * 60 * 1000;
                return (
                  <article className={`ig-message-row ${mine ? "mine" : "theirs"} ${compact ? "compact" : ""}`} key={message.id}>
                    <div className={`ig-bubble ${message.optimistic ? "sending" : ""}`}>
                      {message.replyTo && (
                        <button type="button" className="ig-reply-preview">
                          <strong>{message.replyTo.senderUid === meUid ? "Você" : target?.displayName || "Mensagem"}</strong>
                          <span>{message.replyTo.cancelledAt ? "Mensagem cancelada" : message.replyTo.text || "Mensagem"}</span>
                        </button>
                      )}

                      {message.cancelledAt ? (
                        <p className="ig-cancelled">Mensagem cancelada</p>
                      ) : (
                        <>
                          {message.text && <p>{message.text}</p>}
                          {message.sharedPost && (
                            <button
                              type="button"
                              className="ig-shared-post"
                              onClick={() => window.dispatchEvent(new CustomEvent("uorqui:open-post-thread", { detail: { postId: message.sharedPost?.id, companyId: message.sharedPost?.companyId || "" } }))}
                            >
                              <Share2 size={16} />
                              <span><strong>Publicação de {message.sharedPost.authorName || "usuário"}</strong><small>{message.sharedPost.text || "Abrir publicação"}</small></span>
                            </button>
                          )}
                          {(message.attachments || []).map(attachment => {
                            const url = mediaUrls[attachment.id] || "";
                            const type = String(attachment.contentType || "");
                            if (!url) return <span className="ig-media-loading" key={attachment.id}>Carregando mídia…</span>;
                            if (type.startsWith("image/")) return <img className="ig-message-image" src={url} alt={attachment.name || "Foto"} key={attachment.id} />;
                            if (type.startsWith("video/")) return <video className="ig-message-video" src={url} controls playsInline key={attachment.id} />;
                            if (type.startsWith("audio/")) return <audio className="ig-message-audio" src={url} controls preload="metadata" key={attachment.id} />;
                            return <a className="ig-message-file" href={url} download={attachment.name || "arquivo"} key={attachment.id}>{attachment.name || "Arquivo"}</a>;
                          })}
                        </>
                      )}

                      <div className="ig-message-meta">
                        <time>{clock(message.createdAt)}</time>
                        {message.optimistic && <span>Enviando…</span>}
                      </div>
                    </div>

                    {!message.optimistic && !message.cancelledAt && (
                      <div className="ig-message-actions">
                        <button type="button" className={liked ? "liked" : ""} onClick={() => void toggleLike(message)} disabled={actionBusy === message.id} aria-label={liked ? "Remover curtida" : "Curtir mensagem"}><Heart size={15} fill={liked ? "currentColor" : "none"} /></button>
                        <button type="button" onClick={() => setReplyTo(message)} aria-label="Responder"><MessageCircleReply size={15} /></button>
                        {mine && <button type="button" onClick={() => void cancelMessage(message)} disabled={actionBusy === message.id} aria-label="Cancelar envio"><Trash2 size={14} /></button>}
                      </div>
                    )}

                    {!!message.likedBy?.length && <span className="ig-like-count"><Heart size={11} fill="currentColor" />{message.likedBy.length}</span>}
                    {mine && message.id === latestOwnMessageId && message.readAt && !message.cancelledAt && <span className="ig-seen">Visto</span>}
                  </article>
                );
              })}
            </div>

            <form className="ig-composer" onSubmit={submit}>
              {localError && <div className="ig-local-error"><span>{localError}</span><button type="button" onClick={() => setLocalError("")}><X size={14} /></button></div>}
              {replyTo && (
                <div className="ig-composer-reply">
                  <span><strong>Respondendo</strong><small>{messagePreview(replyTo)}</small></span>
                  <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancelar resposta"><X size={16} /></button>
                </div>
              )}
              {sharedPostId && (
                <div className="ig-pending-share"><Share2 size={14} /><span>Publicação pronta para enviar</span><button type="button" onClick={() => setSharedPostId("")}><X size={15} /></button></div>
              )}
              {!!files.length && (
                <div className="ig-file-preview">
                  {files.map(file => <span key={`${file.name}_${file.size}`}><b>{file.type.startsWith("video/") ? "Vídeo" : "Foto"}</b>{file.name}</span>)}
                  <button type="button" onClick={() => setFiles([])}><X size={15} /></button>
                </div>
              )}
              {audioFile && (
                <div className="ig-audio-preview">
                  <audio src={audioUrl} controls preload="metadata" />
                  <button type="button" onClick={clearAudio} aria-label="Cancelar áudio"><X size={16} /></button>
                </div>
              )}

              <div className="ig-compose-line">
                <label className="ig-media-button" aria-label="Enviar foto ou vídeo">
                  <Camera size={21} />
                  <Video size={10} className="ig-video-mark" />
                  <input hidden type="file" accept="image/*,video/*" multiple onChange={event => setFiles(Array.from(event.target.files || []).slice(0, 4))} />
                </label>

                {recording ? (
                  <div className="ig-recording"><span /> Gravando áudio…</div>
                ) : audioFile ? (
                  <div className="ig-compose-placeholder">Áudio pronto para enviar</div>
                ) : (
                  <textarea
                    rows={1}
                    value={text}
                    onChange={event => setText(event.target.value)}
                    onKeyDown={handleComposerKey}
                    placeholder="Mensagem…"
                    maxLength={4000}
                    disabled={busy}
                  />
                )}

                {recording ? (
                  <button type="button" className="ig-round-action" onClick={stopRecording} aria-label="Parar gravação"><Square size={16} /></button>
                ) : audioFile ? (
                  <button type="button" className="ig-round-action primary" onClick={() => void sendPayload({ payloadFiles: [audioFile] }).then(clearAudio)} disabled={busy} aria-label="Enviar áudio"><Send size={19} /></button>
                ) : text.trim() || files.length || sharedPostId ? (
                  <button type="submit" className="ig-round-action primary" disabled={busy} aria-label="Enviar mensagem"><Send size={19} /></button>
                ) : (
                  <button type="button" className="ig-round-action" onClick={() => void startRecording()} disabled={busy} aria-label="Gravar áudio"><Mic size={20} /></button>
                )}
              </div>
            </form>
          </>
        )}
      </section>
    </section>
  );
}

export function InstagramMessagesOverlay() {
  const surface = useMessageSurface();
  if (!surface) return null;

  return (
    <div
      className="ig-messages-overlay"
      style={{ top: surface.top, left: surface.left, width: surface.width, bottom: surface.bottom }}
    >
      <InstagramMessagesPage />
    </div>
  );
}
