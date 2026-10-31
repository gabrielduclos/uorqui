import { useCallback, useEffect, useLayoutEffect, useRef, useState, type UIEvent } from 'react';
import { ArrowDown, ArrowLeft, MessageCircle, Search, UserPlus, X } from 'lucide-react';
import { UserAvatar } from './UserProfiles';
import { DirectMessageBubble, type DirectChatMessage } from './DirectMessageBubble';
import { LiveMessageComposer } from './LiveMessageComposer';
import { ChatMediaViewer } from './ChatMediaViewer';
import { navigateToPublicProfile } from './publicProfileNavigation';
import { useUorquiPreferences } from './UorquiPreferences';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Conversation = {
  id: string; peerHandle: string; peerName: string; peerAvatarUrl: string | null;
  lastBody: string | null; lastAt: string | null; lastAuthorId: string | null; lastDeleted: boolean; unreadCount: number;
  unreadReactionCount: number; lastReactionEmoji: string | null; lastReactionAt: string | null; lastReactionMessageId: string | null; lastReactionAuthorId: string | null;
  pendingReceivedAt: string | null;
};
type Person = { handle: string; displayName: string; avatarUrl: string | null };
type Message = DirectChatMessage;
type PendingMessage = Message & { clientId: string; pendingStatus: 'sending' | 'failed'; statusUpdatedAt: string };
type IncomingNotice = { id: string; name: string; preview: string };
function optimisticReaction(message: Message, next: string | null): Message {
  const prior = message.myReaction;
  if (prior === next) return message;
  const counts = message.reactions.map(reaction => ({ ...reaction }));
  if (prior) {
    const existing = counts.find(reaction => reaction.emoji === prior);
    if (existing) existing.count--;
  }
  if (next) {
    const existing = counts.find(reaction => reaction.emoji === next);
    if (existing) existing.count++;
    else counts.push({ emoji: next, count: 1 });
  }
  return { ...message, myReaction: next, reactions: counts.filter(reaction => reaction.count > 0) };
}

const NEAR_BOTTOM_PX = 96;

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
  if (!response.ok) {
    if (response.status === 401) throw new Error('UNAUTHORIZED');
    throw new Error('HTTP_' + response.status);
  }
  return response.json() as Promise<T>;
}
function formatTime(value: string | null | undefined, locale: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '';
}

type BlockDeliveryState = 'failed' | 'sending' | 'sent' | 'received' | 'read';
type BlockReceipt = { label: string; updatedAt: string };
type MessageReceipt = { state: BlockDeliveryState; updatedAt: string };

/** A receipt predating the current edit belongs to an older version of the text. */
function currentRevisionAcknowledged(receiptAt: string | null, editedAt: string | null): boolean {
  return !!receiptAt && (!editedAt || Date.parse(receiptAt) >= Date.parse(editedAt));
}

function messageReceipt(message: Message): MessageReceipt {
  if (message.pendingStatus === 'failed' || message.pendingStatus === 'sending') {
    return { state: message.pendingStatus, updatedAt: message.statusUpdatedAt ?? message.createdAt };
  }
  if (currentRevisionAcknowledged(message.readAt, message.editedAt)) {
    return { state: 'read', updatedAt: message.readAt! };
  }
  if (currentRevisionAcknowledged(message.deliveredAt, message.editedAt)) {
    return { state: 'received', updatedAt: message.deliveredAt! };
  }
  // Editing restarts the delivery of that revised text, not its original timestamp.
  return { state: 'sent', updatedAt: message.editedAt ?? message.createdAt };
}

/** Each visible status line represents only messages with exactly the same state. */
function statusForOutgoingBlock(messages: Message[], pt: boolean): BlockReceipt | null {
  if (!messages.length) return null;
  const state = messageReceipt(messages[0]).state;
  const updatedAt = messages.map(message => messageReceipt(message).updatedAt)
    .reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest);
  const many = messages.length > 1;
  const label = pt
    ? ({ failed: 'Falha no envio', sending: 'Enviando', sent: many ? 'Enviadas' : 'Enviada',
        received: many ? 'Recebidas' : 'Recebida', read: many ? 'Lidas' : 'Lida' } as const)[state]
    : ({ failed: 'Send failed', sending: 'Sending', sent: 'Sent', received: 'Received', read: 'Read' } as const)[state];
  return { label, updatedAt };
}

export default function LiveDirectChat({ myId, initialHandle, onStarted, onMobileOpenChange }: {
  myId: string; initialHandle?: string | null; onStarted?: () => void;
  onMobileOpenChange?: (open: boolean) => void;
}) {
  const { locale } = useUorquiPreferences();
  const pt = locale === 'pt-BR';
  const [threads, setThreads] = useState<Conversation[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileOpened, setMobileOpened] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [chatError, setChatError] = useState('');
  const [atBottom, setAtBottom] = useState(true);
  const [newBelow, setNewBelow] = useState(0);
  const [incoming, setIncoming] = useState<IncomingNotice | null>(null);
  const [replySource, setReplySource] = useState<Message | null>(null);
  const [reactionOverrides, setReactionOverrides] = useState<Record<string, string | null>>({});
  const reactionInFlight = useRef(new Set<string>());
  const pendingFiles = useRef(new Map<string, File>());
  const pendingBlobUrls = useRef(new Map<string, string>());
  useEffect(() => () => {
    for (const url of pendingBlobUrls.current.values()) URL.revokeObjectURL(url);
    pendingBlobUrls.current.clear();
    pendingFiles.current.clear();
  }, []);
  const [editing, setEditing] = useState<Message | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Message | null>(null);
  const [jumpTarget, setJumpTarget] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [mediaViewerId,setMediaViewerId] = useState<string | null>(null);
  useEffect(()=>{setMediaViewerId(null);},[activeId]);
  const highlightTimer = useRef<number | null>(null);
  const [forwardTarget, setForwardTarget] = useState<Message | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionNotice, setActionNotice] = useState('');
  const draftBeforeEdit = useRef('');
  const forwardAttempt = useRef<{ sourceId: string; targetId: string; clientId: string } | null>(null);
  const realtimeConnected = useRef(false);
  const lastThreadFallback = useRef(0);
  const lastMessageFallback = useRef(0);
  const scrollBox = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const reading = useRef<string | null>(null);
  const lastReadFailure = useRef(0);
  const activeIdRef = useRef<string | null>(null);
  const mobileOpenedRef = useRef(false);
  const atBottomRef = useRef(true);
  const positionedRef = useRef(false);
  const previousLastRef = useRef('');
  const handledHandle = useRef<string | null>(null);
  activeIdRef.current = activeId;
  mobileOpenedRef.current = mobileOpened;
  atBottomRef.current = atBottom;

  useEffect(() => onMobileOpenChange?.(mobileOpened), [mobileOpened, onMobileOpenChange]);

  /** A selected list row is not a read receipt: only the visible chat panel counts. */
  const isConversationVisible = useCallback((id: string) => {
    if (activeIdRef.current !== id || document.visibilityState !== 'visible' || !document.hasFocus()) return false;
    if (window.matchMedia('(max-width: 767px)').matches && !mobileOpenedRef.current) return false;
    const node = panelRef.current;
    if (!node || !node.isConnected || node.getClientRects().length === 0) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.height > 0 && rect.width > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }, []);

  const loadThreads = useCallback(async () => {
    const result = await api<{ conversations: Conversation[] }>('/api/v1/dm/conversations');
    setThreads(result.conversations);
    window.dispatchEvent(new CustomEvent('uorqui:dm-unread-count', {
      detail: result.conversations.reduce((total, thread) => total + Math.max(0, thread.unreadCount), 0),
    }));
    setError('');
    setLoading(false);
    return result.conversations;
  }, []);

  useEffect(() => {
    let mounted = true;
    void loadThreads().catch(() => {
      if (mounted) { setLoading(false); setError(pt ? 'Não foi possível carregar suas conversas.' : 'Could not load your conversations.'); }
    });
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (!realtimeConnected.current || Date.now() - lastThreadFallback.current >= 25_000) {
        lastThreadFallback.current = Date.now();
        void loadThreads().catch(() => {});
      }
    }, 4000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, [loadThreads, pt]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) { setPeople([]); setSearching(false); return; }
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      void api<{ people: Person[] }>('/api/v1/dm/people?q=' + encodeURIComponent(q), { signal: ctrl.signal })
        .then(result => setPeople(result.people))
        .catch(() => { if (!ctrl.signal.aborted) setPeople([]); })
        .finally(() => { if (!ctrl.signal.aborted) setSearching(false); });
    }, 300);
    return () => { ctrl.abort(); window.clearTimeout(timer); };
  }, [search]);

  const openThread = useCallback((id: string) => {
    setActiveId(id);
    setMobileOpened(true);
    setMessages([]);
    setJumpTarget(null);
    setHighlightId(null);
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    setMessagesLoading(true);
    setAtBottom(true);
    setNewBelow(0);
    atBottomRef.current = true;
    positionedRef.current = false;
    previousLastRef.current = '';
    setChatError('');
    setIncoming(null);
    setReplySource(null);
    setReactionOverrides({});
    setEditing(null); setCancelTarget(null); setForwardTarget(null); setActionNotice(''); forwardAttempt.current = null;
    // Keep a draft for the selected conversation only until it is closed.
    setDraft('');
  }, []);
  const closeThread = useCallback(() => {
    setActiveId(null);
    activeIdRef.current = null;
    setMobileOpened(false);
    mobileOpenedRef.current = false;
    setMessages([]);
    setJumpTarget(null);
    setHighlightId(null);
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    setMessagesLoading(false);
    setNewBelow(0);
    positionedRef.current = false;
    setReplySource(null);
    setReactionOverrides({});
    setEditing(null); setCancelTarget(null); setForwardTarget(null); setActionNotice(''); forwardAttempt.current = null;
    setDraft('');

  }, []);

  const startPerson = useCallback(async (handle: string) => {
    setBusy(true); setError('');
    try {
      const result = await api<{ id: string }>('/api/v1/dm/conversations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      });
      await loadThreads();
      openThread(result.id);
      setSearch('');
    } catch {
      setError(pt ? 'Não foi possível iniciar esta conversa.' : 'Could not open this conversation.');
    } finally { setBusy(false); }
  }, [loadThreads, openThread, pt]);

  useEffect(() => {
    if (!initialHandle) { handledHandle.current = null; return; }
    if (initialHandle === handledHandle.current) return;
    handledHandle.current = initialHandle;
    void startPerson(initialHandle).finally(() => onStarted?.());
  }, [initialHandle, startPerson, onStarted]);

  // Fetching is strictly read-only. Never acknowledge in this function.
  const loadMessages = useCallback(async (id: string) => {
    if (activeIdRef.current !== id) return;
    const result = await api<{ messages: Message[] }>('/api/v1/dm/conversations/' + id + '/messages');
    if (activeIdRef.current !== id) return;
    setMessages(previous => {
      // Retain explicitly loaded older history while refreshing the newest 100.
      const earliest = result.messages[0]?.createdAt;
      const older = earliest ? previous.filter(message => message.createdAt < earliest) : [];
      const next = [...older, ...result.messages].sort((a,b) => a.createdAt.localeCompare(b.createdAt));
      return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
    });
    setPendingMessages(previous => previous.filter(p => p.conversationId !== id || !result.messages.some(m => m.clientId === p.clientId)));
    setMessagesLoading(false);
  }, []);

  useEffect(() => {
    if (!activeId) return;
    let alive = true;
    void loadMessages(activeId).catch(() => {
      if (alive) { setMessagesLoading(false); setChatError(pt ? 'Falha ao carregar mensagens.' : 'Could not load messages.'); }
    });
    const timer = window.setInterval(() => {
      if (!alive || document.visibilityState !== 'visible') return;
      if (!realtimeConnected.current || Date.now() - lastMessageFallback.current >= 25_000) {
        lastMessageFallback.current = Date.now();
        void loadMessages(activeId).catch(() => {});
      }
    }, 3000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [activeId, loadMessages, pt]);

  const jumpToLast = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const node = scrollBox.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
    atBottomRef.current = true;
    setAtBottom(true);
    setNewBelow(0);
  }, []);

  function onMessagesScroll(event: UIEvent<HTMLDivElement>) {
    const node = event.currentTarget;
    const near = node.scrollHeight - node.scrollTop - node.clientHeight < NEAR_BOTTOM_PX;
    if (near === atBottomRef.current) return;
    atBottomRef.current = near;
    setAtBottom(near);
    if (near) setNewBelow(0);
  }


  const jumpToRepliedMessage = useCallback(async (id: string) => {
    const conversationId = activeIdRef.current;
    if (!conversationId) return;
    if (messages.some(message => message.id === id)) {
      setJumpTarget(id);
      return;
    }
    try {
      const result = await api<{ messages: Message[] }>('/api/v1/dm/conversations/' + conversationId + '/messages?around=' + encodeURIComponent(id));
      if (activeIdRef.current !== conversationId) return;
      setMessages(previous => {
        const next = new Map(previous.map(message => [message.id, message]));
        result.messages.forEach(message => next.set(message.id, message));
        return [...next.values()].sort((a,b) => a.createdAt.localeCompare(b.createdAt));
      });
      setJumpTarget(id);
    } catch {
      setChatError(pt ? 'A mensagem original não está mais disponível.' : 'The original message is no longer available.');
    }
  }, [messages, pt]);

  useLayoutEffect(() => {
    if (!jumpTarget || !scrollBox.current) return;
    const target = [...scrollBox.current.querySelectorAll<HTMLElement>('[data-direct-message-id]')]
      .find(element => element.dataset.directMessageId === jumpTarget);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    setHighlightId(jumpTarget);
    setJumpTarget(null);
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightId(null), 2200);
  }, [jumpTarget, messages]);

  useEffect(() => () => {
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
  }, []);

  // The Uorqui-chat behavior: start at the latest message, preserve scroll when
  // reading older ones, and show a downward arrow for messages arriving below.
  const renderedMessages: Message[] = [...messages, ...pendingMessages.filter(p => p.conversationId === activeId && !messages.some(m => m.clientId === p.clientId))]
    .filter(message => !message.deletedAt) // Old tombstones never occupy a chat row.
    .sort((a,b) => a.createdAt.localeCompare(b.createdAt))
    .map(message => Object.prototype.hasOwnProperty.call(reactionOverrides, message.id)
      ? optimisticReaction(message, reactionOverrides[message.id]) : message);
  const blockReceipts = new Map<string, BlockReceipt>();
  let outgoingBlock: Message[] = [];
  function endBlock() {
    if (!outgoingBlock.length) return;
    const status = statusForOutgoingBlock(outgoingBlock, pt);
    if (status) blockReceipts.set(outgoingBlock[outgoingBlock.length - 1].id, status);
    outgoingBlock = [];
  }
  renderedMessages.forEach(message => {
    if (message.authorId !== myId) { endBlock(); return; }
    const previous = outgoingBlock[outgoingBlock.length - 1];
    // Never mix read, received, sent or pending messages in one system status.
    // An edited message also starts a fresh receipt block, even next to
    // another message that happens to have the same state.
    if (previous && (messageReceipt(previous).state !== messageReceipt(message).state ||
        !!previous.editedAt || !!message.editedAt)) endBlock();
    outgoingBlock.push(message);
  });
  endBlock();
  const mediaItems=renderedMessages.filter((message):message is Message & {attachment:NonNullable<Message['attachment']>} =>
    !!message.attachment && !message.deletedAt &&
    (message.attachment.type.startsWith('image/') || message.attachment.type.startsWith('video/')));
  const lastId = renderedMessages.at(-1)?.id ?? '';
  useLayoutEffect(() => {
    if (!activeId || messagesLoading || !scrollBox.current ||
        messages.some(message => message.conversationId !== activeId)) return;
    const last = renderedMessages.at(-1);
    if (!positionedRef.current) {
      positionedRef.current = true;
      previousLastRef.current = last?.id ?? '';
      jumpToLast('instant');
      return;
    }
    if (!last || last.id === previousLastRef.current) return;
    previousLastRef.current = last.id;
    if (atBottomRef.current || last.authorId === myId) jumpToLast('instant');
    else if (last.authorId !== myId) setNewBelow(n => n + 1);
  }, [activeId, messages, pendingMessages, messagesLoading, lastId, myId, jumpToLast]);

  // Read only when actual message content has been rendered AND the recipient
  // is viewing the bottom of that conversation; merely listing/selecting is
  // never enough. No read-on-fetch, including SSE background refreshes.
  const [visibilityTick, setVisibilityTick] = useState(0);
  useEffect(() => {
    const check = () => setVisibilityTick(v => v + 1);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    window.addEventListener('blur', check);
    return () => { document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check); window.removeEventListener('blur', check); };
  }, []);
  useEffect(() => {
    if (!activeId || messagesLoading || !positionedRef.current || !atBottom ||
        reading.current || Date.now() - lastReadFailure.current < 5000 ||
        !isConversationVisible(activeId)) return;
    if (!messages.some(m => m.authorId !== myId && !currentRevisionAcknowledged(m.readAt, m.editedAt)) &&
        !threads.some(thread => thread.id === activeId && thread.unreadReactionCount > 0)) return;
    reading.current = activeId;
    void api('/api/v1/dm/conversations/' + activeId + '/read', { method: 'POST' })
      .then(async () => {
        await Promise.all([loadMessages(activeId), loadThreads()]);
      }).catch(() => { lastReadFailure.current = Date.now(); })
      .finally(() => { reading.current = null; });
  }, [activeId, messages, threads, messagesLoading, atBottom, mobileOpened, visibilityTick, isConversationVisible, myId, loadMessages, loadThreads]);

  useEffect(() => {
    let stream: EventSource | null = null;
    let disposed = false;
    const updateConnected = (connected: boolean) => {
      realtimeConnected.current = connected;
      if (disposed) return;
    };
    const onReady = () => {
      void loadThreads().catch(() => {});
      if (activeIdRef.current && isConversationVisible(activeIdRef.current))
        void loadMessages(activeIdRef.current).catch(() => {});
    };
    const onDmUpdate = (event: Event) => {
      try {
        const data = JSON.parse((event as MessageEvent<string>).data) as { conversationId?: string; kind?: string };
        if (!data.conversationId || !['message', 'read', 'conversation', 'update', 'received'].includes(data.kind ?? '')) return;
        const conversationId = data.conversationId;
        const isOpen = isConversationVisible(conversationId);
        void loadThreads().then(next => {
          if (data.kind !== 'message' || isConversationVisible(conversationId)) return;
          const peer = next.find(thread => thread.id === conversationId);
          if (peer && peer.lastAuthorId !== myId) setIncoming({
            id: peer.id, name: peer.peerName,
            preview: peer.lastBody ?? (pt ? 'Nova mensagem' : 'New message'),
          });
        }).catch(() => {});
        if (isOpen) void loadMessages(conversationId).catch(() => {});
      } catch { /* malformed event cannot change state */ }
    };
    const connect = () => {
      if (disposed || document.visibilityState === 'hidden' || stream || typeof EventSource === 'undefined') return;
      stream = new EventSource('/api/v1/dm/events', { withCredentials: true });
      stream.addEventListener('ready', onReady);
      stream.addEventListener('dm-update', onDmUpdate);
      stream.onopen = () => updateConnected(true);
      stream.onerror = () => updateConnected(false);
    };
    const disconnect = () => {
      updateConnected(false);
      if (!stream) return;
      stream.removeEventListener('ready', onReady);
      stream.removeEventListener('dm-update', onDmUpdate);
      stream.close();
      stream = null;
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') { disconnect(); return; }
      connect(); onReady();
    };
    document.addEventListener('visibilitychange', visibility);
    connect();
    return () => { disposed = true; document.removeEventListener('visibilitychange', visibility); disconnect(); };
  }, [loadThreads, loadMessages, isConversationVisible, myId, pt]);
  // Delivery is not reading: receiving an inbox update never clears the unread badge.
  const receiving = useRef(new Set<string>());
  const receivedIds = useRef(new Set<string>());
  useEffect(() => {
    // Only the visible, focused inbox (or visible desktop sidebar) confirms delivery.
    // Simply mounting the messenger elsewhere must not emit acknowledgements.
    const list = listRef.current;
    if (!list || !threads.length || document.visibilityState !== 'visible' || !document.hasFocus() ||
        list.getClientRects().length === 0) return;
    for (const thread of threads) {
      // Identify the newest pending delivery revision, not just the latest
      // message timestamp: editing an older message must re-acknowledge delivery.
      const key = thread.id + ':' + thread.pendingReceivedAt;
      if (!thread.pendingReceivedAt || receivedIds.current.has(key) || receiving.current.has(thread.id)) continue;
      receiving.current.add(thread.id);
      void api('/api/v1/dm/conversations/' + thread.id + '/received', { method: 'POST' })
        .then(() => receivedIds.current.add(key))
        .catch(() => {})
        .finally(() => receiving.current.delete(thread.id));
    }
  }, [threads, myId, mobileOpened, visibilityTick]);

  useEffect(() => {
    if (!incoming) return;
    const timer = window.setTimeout(() => setIncoming(null), 6500);
    return () => window.clearTimeout(timer);
  }, [incoming]);

  useEffect(() => {
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (cancelTarget) { event.preventDefault(); setCancelTarget(null); return; }
      if (forwardTarget) { event.preventDefault(); setForwardTarget(null); forwardAttempt.current = null; return; }
      if (editing) { event.preventDefault(); cancelEdit(); return; }
      if (replySource) { setReplySource(null); return; }
      if (activeIdRef.current) { event.preventDefault(); closeThread(); }
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [replySource, editing, cancelTarget, forwardTarget, closeThread]);


  function beginEdit(message: Message) {
    if (actionBusy || busy || message.deletedAt) return;
    draftBeforeEdit.current = draft;
    setReplySource(null); setEditing(message); setDraft(message.body); setActionNotice('');
    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
  }
  function cancelEdit() { setEditing(null); setDraft(draftBeforeEdit.current); }
  async function cancelMessage() {
    if (!cancelTarget || actionBusy || !activeId) return;
    const id = activeId, message = cancelTarget;
    if (messages.find(item => item.id === message.id)?.readAt) {
      setCancelTarget(null);
      setChatError(pt ? 'Não é possível cancelar uma mensagem já lida.' : 'A read message cannot be canceled.');
      return;
    }
    setActionBusy(true); setChatError('');
    try {
      await api('/api/v1/dm/conversations/' + id + '/messages/' + message.id, { method:'DELETE' });
      setCancelTarget(null);
      setMessages(previous => previous.filter(item => item.id !== message.id));
      if (editing?.id === message.id) cancelEdit();
      if (replySource?.id === message.id) setReplySource(null);
      await Promise.all([loadMessages(id),loadThreads()]);
    } catch (error) {
      if (error instanceof Error && error.message === 'HTTP_409') {
        setCancelTarget(null);
        setChatError(pt ? 'Não é possível cancelar uma mensagem já lida.' : 'A read message cannot be canceled.');
        void loadMessages(id).catch(() => {});
      } else setChatError(pt ? 'Não foi possível cancelar a mensagem.' : 'Could not cancel message.');
    } finally { setActionBusy(false); }
  }
  async function react(message: Message, emoji: string | null) {
    if (!activeId || actionBusy || message.deletedAt || message.authorId === myId ||
        reactionInFlight.current.has(message.id)) return;
    const id = activeId;
    reactionInFlight.current.add(message.id);
    // Hold the local choice over incoming SSE/poll refreshes until the write finishes.
    setReactionOverrides(previous => ({ ...previous, [message.id]: emoji }));
    setChatError('');
    try {
      await api('/api/v1/dm/conversations/' + id + '/messages/' + message.id + '/reaction', {
        method: emoji ? 'PUT' : 'DELETE',
        ...(emoji ? { headers:{'Content-Type':'application/json'}, body:JSON.stringify({emoji}) } : {}),
      });
      await Promise.all([loadMessages(id), loadThreads()]);
    } catch {
      setChatError(pt ? 'Não foi possível atualizar a reação.' : 'Could not update reaction.');
    } finally {
      reactionInFlight.current.delete(message.id);
      // Roll back on failure; on success the refreshed server state takes over.
      setReactionOverrides(previous => {
        const next = { ...previous };
        delete next[message.id];
        return next;
      });
    }
  }
  async function forward(targetId: string) {
    if (!forwardTarget || !activeId || targetId === activeId || actionBusy) return;
    const source = forwardTarget, id = activeId, previous = forwardAttempt.current;
    const clientId = previous?.sourceId === source.id && previous.targetId === targetId ? previous.clientId : crypto.randomUUID();
    forwardAttempt.current = { sourceId:source.id, targetId, clientId };
    setActionBusy(true); setChatError('');
    try {
      await api('/api/v1/dm/conversations/' + id + '/messages/' + source.id + '/forward',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({targetConversationId:targetId,clientId}),
      });
      const peer = threads.find(t => t.id === targetId);
      setActionNotice(pt ? 'Encaminhada para ' + (peer?.peerName ?? 'conversa') : 'Forwarded to ' + (peer?.peerName ?? 'chat'));
      setForwardTarget(null); forwardAttempt.current = null;
      await loadThreads();
    } catch { setChatError(pt ? 'Falha ao encaminhar. Tente novamente.' : 'Forward failed. Retry.'); }
    finally { setActionBusy(false); }
  }
  async function submitPending(pending: PendingMessage) {
    setPendingMessages(prev => prev.map(p => p.clientId === pending.clientId ? {...p,pendingStatus:'sending',statusUpdatedAt:new Date().toISOString()} : p));
    try {
      if (pending.attachment) {
        const file = pendingFiles.current.get(pending.clientId);
        if (!file) throw new Error('MISSING_FILE');
        const response = await fetch('/api/media/dm/' + pending.conversationId,{
          method:'POST',credentials:'same-origin',cache:'no-store',
          headers:{
            'Content-Type':pending.attachment.type,
            'x-uorqui-client-id':pending.clientId,
            'x-uorqui-filename':encodeURIComponent(pending.attachment.name),
            ...(pending.body ? {'x-uorqui-caption':encodeURIComponent(pending.body)} : {}),
            ...(pending.replyToId ? {'x-uorqui-reply-to-id':pending.replyToId} : {}),
          },
          body:file,
        });
        if (!response.ok) throw new Error('UPLOAD_' + response.status);
      } else {
        await api('/api/v1/dm/conversations/' + pending.conversationId + '/messages', {
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({body:pending.body,clientId:pending.clientId,...(pending.replyToId ? {replyToId:pending.replyToId} : {})}),
        });
      }
      if (activeIdRef.current === pending.conversationId) await loadMessages(pending.conversationId);
      void loadThreads().catch(() => {});
      setPendingMessages(prev => prev.filter(p => p.clientId !== pending.clientId));
      pendingFiles.current.delete(pending.clientId);
      const localUrl=pendingBlobUrls.current.get(pending.clientId);
      if(localUrl) { pendingBlobUrls.current.delete(pending.clientId); URL.revokeObjectURL(localUrl); }
    } catch {
      setPendingMessages(prev => prev.map(p => p.clientId === pending.clientId ? {...p,pendingStatus:'failed',statusUpdatedAt:new Date().toISOString()} : p));
    }
  }
  function sendAttachment(file: File, caption: string) {
    const conversationId=activeIdRef.current;
    if(!conversationId || busy) return;
    const allowed=new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','video/mp4','video/webm','video/quicktime',
      'application/pdf','text/plain','application/zip','application/octet-stream',
      'audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav','audio/x-m4a','audio/aac']);
    const mime=file.type || 'application/octet-stream';
    if(!file.size || file.size>50*1024*1024) {
      setChatError(pt ? 'O anexo deve ter até 50 MB.' : 'Attachment must be 50 MB or less.'); return;
    }
    if (!allowed.has(mime) || !file.name || file.name.length>180 || /[\\/\r\n]/.test(file.name)) {
      setChatError(pt ? 'Tipo ou nome de arquivo não permitido.' : 'Unsupported file type or filename.'); return;
    }
    if(editing) cancelEdit();
    setChatError('');
    const clientId=crypto.randomUUID();
    const sentAt=new Date().toISOString();
    const previewUrl=URL.createObjectURL(file);
    pendingFiles.current.set(clientId,file);
    pendingBlobUrls.current.set(clientId,previewUrl);
    const pending:PendingMessage={
      id:clientId,clientId,conversationId,authorId:myId,body:caption.trim().slice(0,4000),
      createdAt:sentAt,readAt:null,deliveredAt:null,editedAt:null,deletedAt:null,
      forwarded:false,reactions:[],myReaction:null,pendingStatus:'sending',statusUpdatedAt:sentAt,
      attachment:{id:clientId,name:file.name,type:mime,size:file.size},attachmentUrl:previewUrl,
      replyToId:replySource?.id??null,
      replyTo:replySource ? {id:replySource.id,body:replySource.body || ('📎 ' + (replySource.attachment?.name ?? '')),authorId:replySource.authorId,deleted:false} : null,
    };
    setPendingMessages(prev=>[...prev,pending]);
    setReplySource(null);
    jumpToLast('smooth');
    void submitPending(pending);
  }
  async function send() {
    const id = activeId;
    const body = draft.trim();
    if (!id || !draft.trim() || busy || body.length > 4000) return;
    setChatError(''); setActionNotice('');
    if (editing) {
      setBusy(true);
      try {
        await api('/api/v1/dm/conversations/' + id + '/messages/' + editing.id,{
          method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:draft.trim()}),
        });
        cancelEdit();
        await Promise.all([loadMessages(id),loadThreads()]);
      } catch { setChatError(pt ? 'Falha ao editar mensagem.' : 'Could not edit message.'); }
      finally { setBusy(false); }
      return;
    }
    const clientId = crypto.randomUUID();
    const sentAt = new Date().toISOString();
    const pending: PendingMessage = {
      id:clientId, clientId,conversationId:id,authorId:myId,body,
      createdAt:sentAt,readAt:null,deliveredAt:null,editedAt:null,deletedAt:null,
      forwarded:false,reactions:[],myReaction:null,pendingStatus:'sending',statusUpdatedAt:sentAt,
      replyToId:replySource?.id??null,
      replyTo:replySource ? {id:replySource.id,body:replySource.body,authorId:replySource.authorId,deleted:false} : null,
    };
    setPendingMessages(prev => [...prev,pending]);
    setDraft(''); setReplySource(null);
    jumpToLast('smooth');
    textareaRef.current?.focus({preventScroll:true});
    void submitPending(pending);
  }
  function onDraftChange(value: string) { setDraft(value); }
  function respond(message: Message) {
    if (editing) cancelEdit();
    setReplySource(message);
    textareaRef.current?.focus({ preventScroll: true });
  }
  const active = threads.find(c => c.id === activeId);
  const query = search.trim().toLocaleLowerCase(locale);
  const visibleThreads = threads.filter(c =>
    (filter === 'all' || c.unreadCount > 0) &&
    (c.peerName + ' ' + c.peerHandle).toLocaleLowerCase(locale).includes(query));
  const unreadThreads = threads.filter(c => c.unreadCount > 0).length;

  return <div className="relative flex h-full min-h-0 min-w-0 overflow-hidden">
    <section ref={listRef} aria-label={pt ? 'Lista de conversas' : 'Conversation list'} className={cn(
      'h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-r border-border bg-card md:flex md:w-[336px] md:shrink-0 xl:w-[370px]',
      mobileOpened ? 'hidden' : 'flex'
    )}>
      <div className="shrink-0 border-b border-border px-4 pb-3 pt-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div><h2 className="text-[23px] font-semibold tracking-tight">{pt ? 'Conversas' : 'Messages'}</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{pt ? 'Tudo perto. Tudo em um lugar.' : 'Close conversations, all in one place.'}</p>
          </div>

        </div>
        <div className="relative">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
          <Input value={search} onChange={e => setSearch(e.target.value)}
            aria-label={pt ? 'Buscar contatos ou conversas' : 'Search contacts or conversations'}
            placeholder={pt ? 'Buscar conversa ou @usuário' : 'Find a chat or @username'}
            className="h-11 rounded-xl bg-background pl-9 pr-10 text-base"/>
          {search && <button type="button" onClick={() => setSearch('')} aria-label={pt ? 'Limpar pesquisa' : 'Clear search'}
            className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-accent"><X className="size-4"/></button>}
        </div>
        <div className="mt-3 flex gap-1" role="group" aria-label={pt ? 'Filtrar conversas' : 'Filter conversations'}>
          {(['all', 'unread'] as const).map(value => <button type="button" key={value} onClick={() => setFilter(value)}
            aria-pressed={filter === value} className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium',
              filter === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary')}>
            {value === 'all' ? (pt ? 'Todas' : 'All') : (pt ? 'Não lidas' : 'Unread')}
            {value === 'unread' && unreadThreads > 0 && <span className="rounded bg-current/10 px-1 text-[10px]">{unreadThreads}</span>}
          </button>)}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3">
        {error && <div role="alert" className="m-2 rounded-lg border border-destructive/30 p-3 text-xs text-destructive">{error}
          <Button className="ml-2" size="sm" variant="outline" onClick={() => void loadThreads().catch(() => {})}>{pt ? 'Tentar novamente' : 'Retry'}</Button>
        </div>}
        {loading && <div className="space-y-2 px-3 py-2" role="status" aria-label={pt ? 'Carregando conversas' : 'Loading chats'}>
          {[0, 1, 2].map(n => <div key={n} className="flex h-16 animate-pulse items-center gap-3"><div className="size-11 rounded-full bg-muted"/><div className="flex-1 space-y-2"><div className="h-3 w-1/2 rounded bg-muted"/><div className="h-3 w-4/5 rounded bg-muted"/></div></div>)}
        </div>}
        {query.length >= 2 && <>
          <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{pt ? 'Pessoas' : 'People'} {searching ? '…' : ''}</p>
          {people.map(person => <button type="button" key={person.handle} disabled={busy} onClick={() => void startPerson(person.handle)}
            className="flex min-h-16 w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-accent disabled:opacity-50">
            <UserAvatar name={person.displayName} image={person.avatarUrl} size="sm"/>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{person.displayName}</span>
              <span className="block truncate text-xs text-muted-foreground">@{person.handle}</span></span>
            <UserPlus className="size-4 shrink-0 text-muted-foreground"/>
          </button>)}
        </>}
        {visibleThreads.map(thread => <button type="button" key={thread.id} onClick={() => openThread(thread.id)}
          className={cn('flex min-h-[76px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-secondary/70',
            activeId === thread.id && mobileOpened && 'bg-secondary')}
          aria-current={activeId === thread.id && mobileOpened ? 'true' : undefined}>
          <UserAvatar name={thread.peerName} image={thread.peerAvatarUrl} size="sm"/>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2"><span className={cn('truncate text-sm font-semibold', thread.unreadCount > 0 && 'font-bold')}>{thread.peerName}</span>
              <time className="shrink-0 text-[10px] text-muted-foreground">{formatTime(thread.lastReactionAt && (!thread.lastAt || thread.lastReactionAt > thread.lastAt) ? thread.lastReactionAt : thread.lastAt, locale)}</time></span>
            <span className="mt-1 flex items-center justify-between gap-2">
              <span className={cn('min-w-0 flex-1 truncate text-xs text-muted-foreground', thread.unreadCount > 0 && 'font-medium text-foreground/75')}>
                {thread.lastReactionEmoji && thread.lastReactionAt && (!thread.lastAt || thread.lastReactionAt > thread.lastAt)
                  ? (thread.lastReactionAuthorId === myId
                      ? (pt ? 'Você reagiu ' + thread.lastReactionEmoji + ' à mensagem' : 'You reacted ' + thread.lastReactionEmoji + ' to a message')
                      : (pt ? thread.peerName + ' reagiu ' + thread.lastReactionEmoji + ' à sua mensagem' : thread.peerName + ' reacted ' + thread.lastReactionEmoji + ' to your message'))
                  : thread.lastDeleted ? (pt ? 'Mensagem excluída' : 'Deleted message') : thread.lastBody ? (thread.lastAuthorId === myId ? (pt ? 'Você: ' : 'You: ') : '') + thread.lastBody : '@' + thread.peerHandle}
              </span>
              {thread.unreadCount > 0 && <span aria-label={String(thread.unreadCount) + (pt ? ' não lidas' : ' unread')}
                className="grid min-h-5 min-w-5 shrink-0 place-items-center rounded-md bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {thread.unreadCount > 99 ? '99+' : thread.unreadCount}
              </span>}
            </span>
          </span>
        </button>)}
        {!loading && !visibleThreads.length && query.length < 2 && <div className="px-5 py-14 text-center">
          <MessageCircle className="mx-auto size-9 text-primary"/>
          <h3 className="mt-3 font-semibold">{filter === 'unread' ? (pt ? 'Tudo em dia' : 'All caught up') : (pt ? 'Comece uma conversa' : 'Start a conversation')}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{pt ? 'Busque uma pessoa pelo nome ou @usuário.' : 'Search people by name or @username.'}</p>
        </div>}
      </div>
    </section>

    <section ref={panelRef} aria-label={pt ? 'Conversa individual' : 'Direct message'}
      data-chat-conversation className={cn('h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden', mobileOpened ? 'flex' : 'hidden md:flex')}>
      {active ? <>
        <header data-uorqui-context-header className="relative z-20 flex h-16 min-h-16 shrink-0 items-center gap-2 border-b border-border bg-card/95 px-3 backdrop-blur sm:gap-3 sm:px-4">
          <button type="button" onClick={closeThread} aria-label={pt ? 'Voltar às conversas' : 'Back to conversations'}
            className="grid size-10 shrink-0 place-items-center rounded-lg text-foreground hover:bg-accent">
            <ArrowLeft className="size-[21px]"/>
          </button>
          <a href={'/@' + active.peerHandle} onClick={event => navigateToPublicProfile(event, active.peerHandle)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left hover:bg-accent/50">
            <UserAvatar name={active.peerName} image={active.peerAvatarUrl} size="sm"/>
            <span className="min-w-0"><span className="block truncate text-sm font-semibold">{active.peerName}</span>
              <span className="block truncate text-xs text-muted-foreground">@{active.peerHandle}</span></span>
          </a>

        </header>
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div ref={scrollBox} onScroll={onMessagesScroll}
            data-testid="messages-scroll" className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background px-3 py-4 sm:px-6">
            <div className="flex w-full min-w-0 flex-col gap-2.5">
              {messagesLoading && <div className="space-y-3 py-4" role="status" aria-label={pt ? 'Carregando mensagens' : 'Loading messages'}>
                <div className="h-12 w-1/2 animate-pulse self-start bg-muted"/>
                <div className="h-12 w-2/3 animate-pulse self-end bg-muted"/>
              </div>}
              {!messagesLoading && !renderedMessages.length && <p className="my-12 text-center text-sm text-muted-foreground">{pt ? 'Envie a primeira mensagem.' : 'Send the first message.'}</p>}
              {renderedMessages.map(message => {
                const status = blockReceipts.get(message.id);
                return <div key={message.id} className="flex min-w-0 flex-col gap-1.5">
                  <DirectMessageBubble message={message}
                    onOpenMedia={setMediaViewerId}
                    mine={message.authorId === myId} locale={locale} myId={myId} peerName={active.peerName} onReply={respond}
                    onJumpToReply={id => void jumpToRepliedMessage(id)} highlighted={highlightId === message.id}
                    disabled={actionBusy || busy || Object.prototype.hasOwnProperty.call(reactionOverrides, message.id)} onEdit={beginEdit} onCancel={setCancelTarget}
                    onForward={message => { forwardAttempt.current = null; setActionNotice(''); setForwardTarget(message); }}
                    onReact={(message, emoji) => void react(message, emoji)}
                    onRetry={message => {
                      const pending = pendingMessages.find(p => p.clientId === message.clientId);
                      if (pending) void submitPending(pending);
                    }}/>
                  {status && <div role="note" className="flex justify-center py-0.5">
                    <span className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-1.5 rounded-md border border-border/50 bg-muted/60 px-3 py-1 text-center text-[11px] text-muted-foreground">
                      <span>{status.label}</span>
                      <span aria-hidden="true">·</span>
                      <span>{pt ? 'Atualizado às' : 'Updated at'}</span>
                      <time dateTime={status.updatedAt}>{formatTime(status.updatedAt, locale)}</time>
                    </span>
                  </div>}
                </div>;
              })}
            </div>
          </div>
          {!atBottom && <div className="pointer-events-none absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">
            {newBelow > 0 && <span className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-sm">
              {pt ? (newBelow === 1 ? 'Nova mensagem' : newBelow + ' novas mensagens') : (newBelow === 1 ? 'New message' : newBelow + ' new messages')}
            </span>}
            <button type="button" onClick={() => jumpToLast('smooth')}
              aria-label={pt ? 'Ir para a última mensagem' : 'Jump to latest message'}
              className="pointer-events-auto relative grid size-11 place-items-center rounded-full border border-border bg-card text-foreground shadow-lg hover:bg-accent">
              <ArrowDown className="size-5"/>
              {newBelow > 0 && <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{newBelow}</span>}
            </button>
          </div>}
        </div>
        <div className="relative z-10 shrink-0 border-t border-border/70 bg-card/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
          {chatError && <p role="alert" className="mb-2 text-xs text-destructive">{chatError}</p>}
          {actionNotice && <p role="status" className="mb-2 text-xs text-primary">{actionNotice}</p>}
          {editing && <div className="mb-2 flex items-center gap-2 border-l-2 border-primary bg-secondary/70 px-3 py-2 text-xs">
            <div className="min-w-0 flex-1"><strong className="block">{pt ? 'Editando mensagem' : 'Editing message'}</strong>
              <span className="block truncate text-muted-foreground">{editing.body}</span>
            </div>
            <button type="button" onClick={cancelEdit} aria-label={pt ? 'Cancelar edição' : 'Cancel edit'}
              className="grid size-9 place-items-center hover:bg-accent"><X className="size-4"/></button>
          </div>}
          {replySource && !editing && <div className="mb-2 flex items-center gap-2 border-l-2 border-primary bg-secondary/50 px-3 py-2 text-xs">
            <div className="min-w-0 flex-1">
              <span className="block font-semibold">{pt ? 'Respondendo a ' : 'Replying to '}{replySource.authorId === myId ? (pt ? 'você' : 'you') : active.peerName}</span>
              <span className="mt-0.5 block truncate text-muted-foreground">{replySource.body}</span>
            </div>
            <button type="button" onClick={() => setReplySource(null)}
              aria-label={pt ? 'Cancelar resposta' : 'Cancel reply'} className="grid size-9 place-items-center hover:bg-accent">
              <X className="size-4"/>
            </button>
          </div>}
          <LiveMessageComposer value={draft} onChange={onDraftChange} onSubmit={() => void send()}
            onAttach={sendAttachment} sending={busy} locale={locale} textareaRef={textareaRef} editing={!!editing}/>
        </div>
        {cancelTarget && <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/65 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-direct-message-title"
            className="w-full max-w-sm rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl">
            <h3 id="delete-direct-message-title" className="text-base font-semibold">{pt ? 'Cancelar mensagem?' : 'Cancel message?'}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{pt ? 'A mensagem será cancelada e removida por completo, sem deixar aviso na conversa. Isso só é possível antes da leitura.' : 'The message will be canceled and removed completely, with no placeholder. This is only possible before it is read.'}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" disabled={actionBusy} onClick={() => setCancelTarget(null)}>{pt ? 'Cancelar' : 'Cancel'}</Button>
              <Button variant="destructive" disabled={actionBusy} onClick={() => void cancelMessage()}>{pt ? 'Cancelar mensagem' : 'Cancel message'}</Button>
            </div>
          </div>
        </div>}
        {forwardTarget && <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/65 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="forward-direct-message-title"
            className="flex max-h-[min(520px,75dvh)] w-full max-w-md flex-col rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <h3 id="forward-direct-message-title" className="font-semibold">{pt ? 'Encaminhar mensagem' : 'Forward message'}</h3>
              <button type="button" aria-label={pt ? 'Cancelar encaminhamento' : 'Cancel forward'} disabled={actionBusy}
                onClick={() => { setForwardTarget(null); forwardAttempt.current = null; }} className="grid size-9 place-items-center rounded-md hover:bg-accent"><X className="size-4"/></button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{pt ? 'Escolha uma conversa de destino.' : 'Select a destination conversation.'}</p>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
              {threads.filter(thread => thread.id !== activeId).map(thread => <button type="button" key={thread.id}
                disabled={actionBusy} onClick={() => void forward(thread.id)}
                className="flex min-h-14 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-accent disabled:opacity-50">
                <UserAvatar name={thread.peerName} image={thread.peerAvatarUrl} size="sm"/>
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{thread.peerName}</strong>
                  <span className="block truncate text-xs text-muted-foreground">@{thread.peerHandle}</span></span>
              </button>)}
              {threads.length <= 1 && <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                {pt ? 'Abra outra conversa para poder encaminhar uma mensagem.' : 'Start another conversation to forward this message.'}
              </p>}
            </div>
            {chatError && <p role="alert" className="mt-2 text-xs text-destructive">{chatError}</p>}
          </div>
        </div>}
      </> : <div className="flex h-full flex-col items-center justify-center gap-3 px-5 text-center">
        <MessageCircle className="size-10 text-primary"/>
        <h3 className="font-semibold">{pt ? 'Selecione uma conversa' : 'Select a conversation'}</h3>
        <p className="max-w-xs text-sm text-muted-foreground">{pt ? 'Busque uma pessoa ou abra uma conversa existente.' : 'Find someone or open an existing conversation.'}</p>
      </div>}
    </section>

    <ChatMediaViewer items={mediaItems} selectedId={mediaViewerId} onSelect={setMediaViewerId}
      onClose={()=>setMediaViewerId(null)} locale={locale}/>
    {incoming && <aside role="status" aria-live="polite"
      className="absolute left-3 right-3 top-3 z-40 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-border bg-popover px-3 py-2.5 text-popover-foreground shadow-xl">
      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={() => { openThread(incoming.id); setIncoming(null); }}>
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/15 font-bold text-primary">U</span>
        <span className="min-w-0"><strong className="block truncate text-xs">{incoming.name}</strong>
          <small className="block truncate text-xs text-muted-foreground">{incoming.preview}</small></span>
      </button>
      <button type="button" onClick={() => setIncoming(null)}
        aria-label={pt ? 'Dispensar aviso' : 'Dismiss notification'}
        className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-accent"><X className="size-4"/></button>
    </aside>}
  </div>;
}
