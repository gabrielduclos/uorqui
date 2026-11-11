import { compactUserName } from './userDisplayName';
import { directApiRequest as api } from './lib/apiClient';
import { Spinner } from '@/components/ui/spinner';
import { WorkspaceContentLoading } from './ui-kit/WorkspaceContentLoading';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import { Archive, ArchiveRestore, ArrowDown, ArrowLeft, ContactRound, Images, MessageCircle, MoreHorizontal, Pin, PinOff, Search, ShieldBan, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react';
import { UserAvatar } from './UserProfiles';
import { DirectMessageBubble, type DirectChatMessage } from './DirectMessageBubble';
import { formatMessageTimestamp, useLocalDayKey } from './messageTimestamp';
import { channelHistoryDayLabel, groupChannelMessages, type ChannelHistoryPeriod, type CustomChannelDateRange } from './channelHistory';
import { ChannelDateFilter } from './ChannelDateFilter';
import { directMessageHistoryPath } from './directMessageHistory';
import { ReplyComposerPreview } from './ReplyReference';
import { LiveMessageComposer } from './LiveMessageComposer';
import CommunityMediaPicker, { isCommunityGifUrl } from './CommunityMediaPicker';
import { attachmentLabel } from './chatAttachmentLabels';
import { clearChatMediaCache, invalidateChatMedia } from './chatMediaCache';
import { ChatMediaViewer } from './ChatMediaViewer';
import { ConversationAttachmentsPanel } from './ConversationAttachmentsPanel';
import { InternalShareDialog } from './InternalShareDialog';
import { ContentReportDialog } from './ContentReportDialog';
import { clearProfileImageCache } from './profileImageCache';
import { clearDmConversation, listDmCommands, peekDmInbox, peekDmRoom, readDmInbox, readDmRoom, saveDmInbox, saveDmRoom } from './dmCache';
import { enqueueDmMessage, retryDmMessage, type DmOutboxUpdate } from './dmOutbox';
import { dmStreamConnected, invalidateDmInbox, loadDmInboxNetwork, subscribeDmStream } from './dmEventStream';
import { navigateToPublicProfile } from './publicProfileNavigation';
import { clearReadPush } from './readPushNotifications';
import { useUorquiPreferences } from './UorquiPreferences';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Conversation = {
  id: string; peerHandle: string; peerName: string; peerAvatarUrl: string | null;
  lastBody: string | null; lastAttachmentType?: string | null; lastReplyToId?: string | null; lastAt: string | null; lastAuthorId: string | null; lastDeleted: boolean; unreadCount: number;
  unreadReactionCount: number; lastReactionEmoji: string | null; lastReactionAt: string | null; lastReactionMessageId: string | null; lastReactionAuthorId: string | null;
  pendingReceivedAt: string | null; canMessage: boolean; archived: boolean;
};
type Person = { handle: string; displayName: string; avatarUrl: string | null };
type Message = DirectChatMessage;
type PinnedMessage={id:string;body:string;authorId:string;createdAt:string;attachment:NonNullable<Message['attachment']>|null};
type PendingMessage = Message & { clientId: string; pendingStatus: 'sending' | 'failed'; statusUpdatedAt: string };
type ConfirmedInboxPreview = { pending: PendingMessage; serverCreatedAt: string | null };
type PreviewConversation = Conversation & { optimisticStatus?: PendingMessage['pendingStatus'] };
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

/** Group outgoing messages by delivery state, but display only confirmed reads. */
function statusForOutgoingBlock(messages: Message[], pt: boolean): BlockReceipt | null {
  // The only visible delivery receipt is a confirmed read of the current revision.
  if (!messages.length || messageReceipt(messages[0]).state !== 'read') return null;
  const updatedAt = messages.map(message => messageReceipt(message).updatedAt)
    .reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest);
  return { label: pt ? 'Lida' : 'Read', updatedAt };
}

export default function LiveDirectChat({ myId, initialHandle, initialConversationId, requestedOpenNonce, onStarted, onMobileOpenChange, onOpenContacts }: {
  myId: string; initialHandle?: string | null; initialConversationId?: string|null; requestedOpenNonce?: number; onStarted?: () => void;
  onMobileOpenChange?: (open: boolean) => void; onOpenContacts?: () => void;
}) {
  const { locale } = useUorquiPreferences();
  const todayKey = useLocalDayKey();
  const pt = locale === 'pt-BR';
  const [threads, setThreads] = useState<Conversation[]>(() => peekDmInbox<Conversation>(myId));
  const [people, setPeople] = useState<Person[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'archived'>('all');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileOpened, setMobileOpened] = useState(false);
  const [historyPeriod,setHistoryPeriod]=useState<ChannelHistoryPeriod>('all');
  const [customHistoryRange,setCustomHistoryRange]=useState<CustomChannelDateRange>({from:'',to:''});
  const [filteredHistory,setFilteredHistory]=useState<Message[]>([]);
  const [historyLoading,setHistoryLoading]=useState(false);
  const [historyMoreLoading,setHistoryMoreLoading]=useState(false);
  const [historyHasMore,setHistoryHasMore]=useState(false);
  const [historyError,setHistoryError]=useState('');
  const historyRequestKey=useRef('');
  const historyFiltered=historyPeriod!=='all';
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const pendingMessagesRef = useRef(pendingMessages);
  pendingMessagesRef.current = pendingMessages;
  // Keep a just-confirmed preview until the authoritative inbox catches up.
  const [confirmedInboxPreviews, setConfirmedInboxPreviews] = useState<ConfirmedInboxPreview[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(() => peekDmInbox<Conversation>(myId).length === 0);
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
  const [reportMessageId,setReportMessageId] = useState<string|null>(null);
  const [jumpTarget, setJumpTarget] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [mediaViewerId,setMediaViewerId] = useState<string | null>(null);
  const [galleryOpen,setGalleryOpen]=useState(false);
  const [pinnedMessage,setPinnedMessage]=useState<PinnedMessage|null>(null);
  const [pinBusy,setPinBusy]=useState(false);
  const loadPinned=useCallback(async(id:string)=>{
    const response=await api<{pinned:PinnedMessage|null}>('/api/v1/dm/conversations/'+id+'/pinned');
    if(activeIdRef.current===id)setPinnedMessage(response.pinned);
  },[]);
  useEffect(()=>{
    if(!activeId)return;
    void loadPinned(activeId).catch(()=>{});
  },[activeId,loadPinned]);
  async function togglePinned(message:Message|null){
    const id=activeIdRef.current;
    if(!id||pinBusy)return;
    setPinBusy(true);
    try{
      await api('/api/v1/dm/conversations/'+id+'/pinned',{
        method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({messageId:message?.id??null})
      });
      await loadPinned(id);
    }catch{setChatError(pt?'Não foi possível atualizar a mensagem fixada.':'Could not update pinned message.');}
    finally{setPinBusy(false);}
  }
  useEffect(()=>{setMediaViewerId(null);},[activeId]);
  const highlightTimer = useRef<number | null>(null);
  const [forwardTarget, setForwardTarget] = useState<Message | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionNotice, setActionNotice] = useState('');
  const [conversationMenuOpen,setConversationMenuOpen]=useState(false);
  const [conversationConfirm,setConversationConfirm]=useState<'delete'|'block'|null>(null);
  const [gifPickerOpen,setGifPickerOpen]=useState(false);
  const [conversationBusy,setConversationBusy]=useState(false);
  const [blockedHandles,setBlockedHandles]=useState<string[]>([]);
  const conversationMenuRef=useRef<HTMLDivElement>(null);
  const draftBeforeEdit = useRef('');
  const threadRequest = useRef(0);
  const roomRequest = useRef(0);
  const lastThreadFallback = useRef(Date.now());
  const lastMessageFallback = useRef(Date.now());
  const scrollBox = useRef<HTMLDivElement>(null);
  const messageContentRef = useRef<HTMLDivElement>(null);
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
  useEffect(()=>{
    const controller=new AbortController();
    void fetch('/api/v1/blocks',{credentials:'same-origin',cache:'no-store',signal:controller.signal})
      .then(async response=>response.ok?response.json() as Promise<{blocked:{handle:string}[]}>:{blocked:[]})
      .then(result=>{if(!controller.signal.aborted)setBlockedHandles(result.blocked.map(b=>b.handle));})
      .catch(()=>{});
    return ()=>controller.abort();
  },[activeId]);
  useEffect(()=>{
    if(!conversationMenuOpen)return;
    const dismiss=(event:PointerEvent)=>{if(!conversationMenuRef.current?.contains(event.target as Node))setConversationMenuOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setConversationMenuOpen(false);};
    document.addEventListener('pointerdown',dismiss);
    document.addEventListener('keydown',escape);
    return ()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape);};
  },[conversationMenuOpen]);

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
    const version = ++threadRequest.current;
    const result = await loadDmInboxNetwork<Conversation>(myId);
    if (version !== threadRequest.current) return result.conversations;
    saveDmInbox(myId, result.conversations);
    lastThreadFallback.current = Date.now();
    setThreads(result.conversations);
    // Reconcile stale delivered pushes after a read from another device.
    const readConversations=result.conversations.filter(thread=>thread.unreadCount===0 && /^[0-9a-f-]{36}$/i.test(thread.id));
    if(readConversations.length)clearReadPush(readConversations.slice(0,100).map(thread=>({kind:'dm' as const,conversationId:thread.id})));
    setConfirmedInboxPreviews(previous => previous.filter(({ pending, serverCreatedAt }) => {
      const canonical = result.conversations.find(thread => thread.id === pending.conversationId);
      if (!canonical || !serverCreatedAt) return false;
      // Don't drop the optimistic preview if an older in-flight inbox request
      // completed before the newly-sent message became visible there.
      return !canonical.lastAt || Date.parse(canonical.lastAt) < Date.parse(serverCreatedAt);
    }));
    window.dispatchEvent(new CustomEvent('uorqui:dm-unread-count', {
      detail: result.conversations.reduce((total, thread) => total + (thread.archived ? 0 : Math.max(0, thread.unreadCount)), 0),
    }));
    setError('');
    setLoading(false);
    return result.conversations;
  }, [myId]);

  useEffect(() => {
    let mounted = true;
    void readDmInbox<Conversation>(myId).then(cached => {
      if (!mounted || !cached.length) return;
      setThreads(previous => previous.length ? previous : cached);
      setLoading(false);
    }).catch(() => {});
    void loadThreads().catch(() => {
      if (mounted) { setLoading(false); setError(pt ? 'Não foi possível carregar suas conversas.' : 'Could not load your conversations.'); }
    });
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if ((!dmStreamConnected() && Date.now() - lastThreadFallback.current >= 12_000) ||
          Date.now() - lastThreadFallback.current >= 120_000) {
        lastThreadFallback.current = Date.now();
        void loadThreads().catch(() => {});
      }
    }, 4000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, [loadThreads, pt, myId]);

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
    setConversationMenuOpen(false);setConversationConfirm(null);
    setGalleryOpen(false);setPinnedMessage(null);
    setHistoryPeriod('all');setCustomHistoryRange({from:'',to:''});
    setFilteredHistory([]);setHistoryHasMore(false);setHistoryError('');
    setActiveId(id);
    setMobileOpened(true);
    const cached = peekDmRoom(myId, id);
    setMessages(cached);
    setJumpTarget(null);
    setHighlightId(null);
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    setMessagesLoading(!cached.length);
    setAtBottom(true);
    setNewBelow(0);
    atBottomRef.current = true;
    positionedRef.current = false;
    previousLastRef.current = '';
    setChatError('');
    setIncoming(null);
    setReplySource(null);
    setReactionOverrides({});
    setEditing(null); setCancelTarget(null); setForwardTarget(null); setActionNotice('');
    // Keep a draft for the selected conversation only until it is closed.
    setDraft('');
  }, [myId]);
  useEffect(()=>{
    if(initialConversationId&&/^[0-9a-f-]{36}$/i.test(initialConversationId))openThread(initialConversationId);
  },[initialConversationId,requestedOpenNonce,openThread]);
  const closeThread = useCallback(() => {
    setConversationMenuOpen(false);setConversationConfirm(null);
    setGalleryOpen(false);setPinnedMessage(null);
    setHistoryPeriod('all');setCustomHistoryRange({from:'',to:''});
    setFilteredHistory([]);setHistoryHasMore(false);setHistoryError('');
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
    setEditing(null); setCancelTarget(null); setForwardTarget(null); setActionNotice('');
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
    } catch (e) {
      setError(e instanceof Error && e.message === 'HTTP_403'
        ? (pt ? 'Este perfil é privado. É preciso aceitar uma solicitação de contato antes de conversar.' : 'This private profile must accept your contact request before you can message them.')
        : (pt ? 'Não foi possível iniciar esta conversa.' : 'Could not open this conversation.'));
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
    const version = ++roomRequest.current;
    const requestedAt = Date.now();
    const result = await api<{ messages: Message[] }>('/api/v1/dm/conversations/' + id + '/messages');
    if (activeIdRef.current !== id || version !== roomRequest.current) return;
    setMessages(previous => {
      // Retain explicitly loaded older history while refreshing the newest 100.
      const earliest = result.messages[0]?.createdAt;
      const latest = result.messages.at(-1)?.createdAt;
      const receivedIds = new Set(result.messages.map(message => message.id));
      // Preserve newer realtime messages that arrived while HTTP was in flight.
      const retained = previous.filter(message => !receivedIds.has(message.id) &&
        ((earliest && message.createdAt < earliest) || (latest && Date.parse(message.createdAt) >= requestedAt)));
      const next = [...retained, ...result.messages].sort((a,b) => a.createdAt.localeCompare(b.createdAt));
      saveDmRoom(myId, id, next);
      return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
    });
    setPendingMessages(previous => previous.filter(p => p.conversationId !== id || !result.messages.some(m => m.clientId === p.clientId)));
    lastMessageFallback.current = Date.now();
    setMessagesLoading(false);
  }, [myId]);

  useEffect(() => {
    if (!activeId) return;
    let alive = true;
    const existing = peekDmRoom(myId, activeId);
    void readDmRoom(myId, activeId).then(cached => {
      if (!alive || activeIdRef.current !== activeId || !cached.length) return;
      setMessages(previous => previous.length ? previous : cached);
      setMessagesLoading(false);
    }).catch(() => {});
    if (existing.length) setMessagesLoading(false);
    void loadMessages(activeId).catch(() => {
      if (alive) { setMessagesLoading(false); setChatError(pt ? 'Falha ao carregar mensagens.' : 'Could not load messages.'); }
    });
    const timer = window.setInterval(() => {
      if (!alive || document.visibilityState !== 'visible') return;
      if ((!dmStreamConnected() && Date.now() - lastMessageFallback.current >= 12_000) ||
          Date.now() - lastMessageFallback.current >= 120_000) {
        lastMessageFallback.current = Date.now();
        void loadMessages(activeId).catch(() => {});
      }
    }, 3000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [activeId, loadMessages, pt, myId]);

  useEffect(() => {
    let mounted = true;
    void listDmCommands(myId).then(commands => {
      if (!mounted) return;
      const restored: PendingMessage[] = commands.map(command => {
        const pending = { ...command.pending,
          pendingStatus: command.state === 'failed' ? 'failed' as const : 'sending' as const };
        if (command.file && pending.attachment) {
          const url = URL.createObjectURL(command.file);
          const old = pendingBlobUrls.current.get(pending.clientId);
          if (old) URL.revokeObjectURL(old);
          pendingBlobUrls.current.set(pending.clientId, url);
          pendingFiles.current.set(pending.clientId, command.file);
          pending.attachmentUrl = url;
        }
        return pending;
      });
      setPendingMessages(previous => {
        const known = new Set(previous.map(item => item.clientId));
        return [...previous, ...restored.filter(item => !known.has(item.clientId))];
      });
    }).catch(() => {});
    const onOutbox = (event: Event) => {
      const update = (event as CustomEvent<DmOutboxUpdate>).detail;
      if (!update || update.accountId !== myId) return;
      if (update.state === 'sent') {
        const createdAt = update.message && typeof update.message === 'object' &&
          'createdAt' in update.message && typeof update.message.createdAt === 'string'
          ? update.message.createdAt : null;
        setConfirmedInboxPreviews(previous => [
          ...previous.filter(item => item.pending.clientId !== update.clientId),
          { pending: { ...update.pending, pendingStatus: 'sending' as const }, serverCreatedAt: createdAt },
        ].slice(-50));
        if (update.message && typeof update.message === 'object' &&
            'id' in update.message && typeof update.message.id === 'string' &&
            activeIdRef.current === update.conversationId) {
          // The send response has replyToId but may omit the expanded replyTo.
          // Keep the optimistic quoted-message card until HTTP reconciliation.
          const confirmed: Message = {
            ...(update.message as Message), reactions: [], myReaction: null,
            replyTo: (update.message as Message).replyTo ?? update.pending.replyTo ?? null,
          };
          setMessages(previous => {
            const existing = previous.find(item => item.id === confirmed.id);
            if (existing) {
              if (existing.replyTo || !confirmed.replyTo) return previous;
              const next = previous.map(item => item.id === confirmed.id
                ? { ...item, replyTo: confirmed.replyTo } : item);
              saveDmRoom(myId, update.conversationId, next);
              return next;
            }
            const next = [...previous, confirmed].sort((a,b) => a.createdAt.localeCompare(b.createdAt));
            saveDmRoom(myId, update.conversationId, next);
            return next;
          });
        } else if (activeIdRef.current === update.conversationId) {
          void loadMessages(update.conversationId).catch(() => {});
        }
        setPendingMessages(previous => previous.filter(item => item.clientId !== update.clientId));
        pendingFiles.current.delete(update.clientId);
        const url = pendingBlobUrls.current.get(update.clientId);
        if (url) { pendingBlobUrls.current.delete(update.clientId); URL.revokeObjectURL(url); }
        invalidateDmInbox();
        void loadThreads().catch(() => {});
        return;
      }
      setPendingMessages(previous => previous.map(item =>
        item.clientId === update.clientId
          ? { ...item, pendingStatus: update.state === 'failed' ? 'failed' : 'sending',
            statusUpdatedAt: new Date().toISOString() } : item));
    };
    window.addEventListener('uorqui:dm-outbox', onOutbox);
    return () => { mounted = false; window.removeEventListener('uorqui:dm-outbox', onOutbox); };
  }, [myId, loadThreads, loadMessages]);

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
  const renderedMessages = useMemo<Message[]>(() =>
    [...messages, ...pendingMessages.filter(p => p.conversationId === activeId &&
      !messages.some(m => m.clientId === p.clientId))]
      .filter(message => !message.deletedAt)
      .sort((a,b) => a.createdAt.localeCompare(b.createdAt))
      .map(message => Object.prototype.hasOwnProperty.call(reactionOverrides, message.id)
        ? optimisticReaction(message, reactionOverrides[message.id]) : message),
  [messages, pendingMessages, activeId, reactionOverrides]);
  useEffect(()=>{
    if(!activeId||!historyFiltered){historyRequestKey.current='';setFilteredHistory([]);setHistoryLoading(false);return;}
    const key=activeId+'/'+historyPeriod+'/'+customHistoryRange.from+'/'+customHistoryRange.to;
    historyRequestKey.current=key;
    let alive=true;
    setFilteredHistory([]);setHistoryLoading(true);setHistoryHasMore(false);setHistoryError('');
    void api<{messages:Message[];hasMore:boolean}>(
      directMessageHistoryPath(activeId,historyPeriod,customHistoryRange)
    ).then(result=>{
      if(!alive||historyRequestKey.current!==key)return;
      setFilteredHistory(result.messages);setHistoryHasMore(result.hasMore);
      requestAnimationFrame(()=>{if(scrollBox.current)scrollBox.current.scrollTop=0;});
    }).catch(()=>{
      if(alive&&historyRequestKey.current===key)setHistoryError(pt?'Não foi possível filtrar as mensagens.':'Could not filter messages.');
    }).finally(()=>{if(alive&&historyRequestKey.current===key)setHistoryLoading(false);});
    return()=>{alive=false;};
  },[activeId,historyFiltered,historyPeriod,customHistoryRange.from,customHistoryRange.to,pt]);
  async function loadMoreFilteredHistory(){
    if(!activeId||!historyFiltered||historyLoading||historyMoreLoading||!historyHasMore)return;
    const key=historyRequestKey.current;
    setHistoryMoreLoading(true);setHistoryError('');
    try{
      const result=await api<{messages:Message[];hasMore:boolean}>(
        directMessageHistoryPath(activeId,historyPeriod,customHistoryRange,filteredHistory.length)
      );
      if(key!==historyRequestKey.current)return;
      setFilteredHistory(old=>{
        const ids=new Set(old.map(m=>m.id));
        return [...result.messages.filter(m=>!ids.has(m.id)),...old];
      });
      setHistoryHasMore(result.hasMore);
    }catch{if(key===historyRequestKey.current)setHistoryError(pt?'Não foi possível carregar mensagens antigas.':'Could not load older messages.');}
    finally{if(key===historyRequestKey.current)setHistoryMoreLoading(false);}
  }
  const shownMessages=historyFiltered?filteredHistory:renderedMessages;
  const dayGroups=groupChannelMessages(shownMessages);
  const blockReceipts = useMemo(() => {
    const receipts = new Map<string, BlockReceipt>();
    let outgoingBlock: Message[] = [];
    function endBlock() {
      if (!outgoingBlock.length) return;
      const status = statusForOutgoingBlock(outgoingBlock, pt);
      if (status) receipts.set(outgoingBlock[outgoingBlock.length - 1].id, status);
      outgoingBlock = [];
    }
    renderedMessages.forEach(message => {
      if (message.authorId !== myId) { endBlock(); return; }
      const previous = outgoingBlock[outgoingBlock.length - 1];
      if (previous && (messageReceipt(previous).state !== messageReceipt(message).state ||
          !!previous.editedAt || !!message.editedAt)) endBlock();
      outgoingBlock.push(message);
    });
    endBlock();
    return receipts;
  }, [renderedMessages, myId, pt]);
  const mediaItems = useMemo(() => renderedMessages.filter(
    (message): message is Message & { attachment: NonNullable<Message['attachment']> } =>
      !!message.attachment && !message.deletedAt &&
      (message.attachment.type.startsWith('image/') || message.attachment.type.startsWith('video/'))
  ), [renderedMessages]);
  const lastId = renderedMessages.at(-1)?.id ?? '';
  useLayoutEffect(() => {
    if (historyFiltered || !activeId || messagesLoading || !scrollBox.current ||
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
  }, [activeId, messages, pendingMessages, messagesLoading, lastId, myId, jumpToLast, historyFiltered]);

  // Images, attachment previews and fonts can change the height of the history
  // after the first "jump to latest". Follow that growth only while the user
  // is at (or very near) the bottom; do not pull them away from older messages.
  useLayoutEffect(() => {
    const scroller=scrollBox.current;
    const content=messageContentRef.current;
    if (historyFiltered || !activeId || messagesLoading || !positionedRef.current || !scroller || !content) return;
    let priorHeight=scroller.scrollHeight;
    let frame=0;
    const followGrowth=()=>{
      const nextHeight=scroller.scrollHeight;
      const grew=nextHeight>priorHeight;
      const wasNearBottom=priorHeight-scroller.scrollTop-scroller.clientHeight<NEAR_BOTTOM_PX;
      priorHeight=nextHeight;
      if (!atBottomRef.current && !(grew&&wasNearBottom)) return;
      window.cancelAnimationFrame(frame);
      frame=window.requestAnimationFrame(()=>{
        if(activeIdRef.current!==activeId || !scroller.isConnected)return;
        scroller.scrollTop=scroller.scrollHeight;
      });
    };
    let observer:ResizeObserver|null=null;
    if (typeof ResizeObserver!=='undefined'){
      observer=new ResizeObserver(followGrowth);
      observer.observe(content);
      observer.observe(scroller);
    }
    // A frame after opening covers the first browser layout on mobile/PWA.
    const openingFrame=window.requestAnimationFrame(followGrowth);
    return ()=>{
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(openingFrame);
    };
  }, [activeId, messagesLoading, historyFiltered]);

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
    if (historyFiltered || !activeId || messagesLoading || !positionedRef.current || !atBottom ||
        reading.current || Date.now() - lastReadFailure.current < 5000 ||
        !isConversationVisible(activeId)) return;
    if (!messages.some(m => m.authorId !== myId && !currentRevisionAcknowledged(m.readAt, m.editedAt)) &&
        !threads.some(thread => thread.id === activeId && thread.unreadReactionCount > 0)) return;
    reading.current = activeId;
    void api('/api/v1/dm/conversations/' + activeId + '/read', { method: 'POST' })
      .then(async () => {
        clearReadPush({kind:'dm',conversationId:activeId});
        await Promise.all([loadMessages(activeId), loadThreads()]);
      }).catch(() => { lastReadFailure.current = Date.now(); })
      .finally(() => { reading.current = null; });
  }, [activeId, messages, threads, messagesLoading, atBottom, mobileOpened, visibilityTick, isConversationVisible, myId, loadMessages, loadThreads, historyFiltered]);

  useEffect(() => {
    const onReady = () => {
      invalidateDmInbox();
      void loadThreads().catch(() => {});
      if (activeIdRef.current && isConversationVisible(activeIdRef.current))
        void loadMessages(activeIdRef.current).catch(() => {});
    };
    const unsubscribe = subscribeDmStream(data => {
      if (data.kind === 'ready') { onReady(); return; }
      if (data.kind === 'friendship-update') {
        clearProfileImageCache(); invalidateDmInbox();
        void loadThreads().catch(() => {}); return;
      }
      if (!data.conversationId || !['message', 'read', 'conversation', 'update', 'received'].includes(data.kind)) return;
      const conversationId = data.conversationId;
      const isOpen = isConversationVisible(conversationId);
      // Project a new message at once rather than waiting for an entire HTTP page.
      if (data.kind === 'message' && data.message?.id && isOpen) {
        const source = data.message.replyToId
          ? messagesRef.current.find(item => item.id === data.message?.replyToId) : null;
        const matchingPending = pendingMessagesRef.current.find(item =>
          item.conversationId === conversationId && item.clientId === data.message?.clientId);
        const replyTo = data.message.replyToId
          ? (matchingPending?.replyTo ?? (source
            ? { id: source.id, body: source.body ||
                (source.attachment ? attachmentLabel(source.attachment.type, locale) : ''),
                authorId: source.authorId, deleted: !!source.deletedAt }
            : null)) : null;
        const message: Message = { ...data.message, reactions: [], myReaction: null, replyTo };
        setMessages(previous => {
          const existing = previous.find(item => item.id === message.id);
          if (existing) {
            if (existing.replyTo || !message.replyTo) return previous;
            const updated = previous.map(item => item.id === message.id
              ? { ...item, replyTo: message.replyTo } : item);
            saveDmRoom(myId, conversationId, updated);
            return updated;
          }
          const updated = [...previous, message].sort((a,b) => a.createdAt.localeCompare(b.createdAt));
          saveDmRoom(myId, conversationId, updated);
          return updated;
        });
        setMessagesLoading(false);
      }
      invalidateDmInbox();
      void loadThreads().then(next => {
        if (data.kind !== 'message' || isConversationVisible(conversationId)) return;
        const peer = next.find(thread => thread.id === conversationId);
        if (peer && peer.lastAuthorId !== myId) setIncoming({
          id: peer.id, name: peer.peerName,
          preview: peer.lastBody ?? (pt ? 'Nova mensagem' : 'New message'),
        });
      }).catch(() => {});
      // Rich events are already rendered; other mutations still require an
      // authoritative read because the event carries no complete receipt state.
      if (isOpen && (data.kind !== 'message' || !data.message?.id))
        void loadMessages(conversationId).catch(() => {});
      if(activeIdRef.current===conversationId &&
        (data.kind==='update'||data.kind==='conversation'))
        void loadPinned(conversationId).catch(()=>{});
    });
    window.addEventListener('uorqui:friends-updated', onReady);
    return () => { unsubscribe(); window.removeEventListener('uorqui:friends-updated', onReady); };
  }, [loadThreads, loadMessages, loadPinned, isConversationVisible, myId, pt, locale]);
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
      if (forwardTarget) { event.preventDefault(); setForwardTarget(null); return; }
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
      if(message.attachment)invalidateChatMedia('/media/dm/'+id+'/'+message.attachment.id);
      setCancelTarget(null);
      setMessages(previous => {
        const next = previous.filter(item => item.id !== message.id);
        saveDmRoom(myId, id, next);
        return next;
      });
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
  // Preserve a usable quote even when replying to media without text.
  function optimisticReplyReference(source: Message | null): Message['replyTo'] {
    if (!source) return null;
    return { id: source.id, authorId: source.authorId,
      body: source.body || (source.attachment ? attachmentLabel(source.attachment.type, locale) : ''),
      deleted: !!source.deletedAt };
  }
  async function submitPending(pending: PendingMessage) {
    try {
      await enqueueDmMessage(myId, pending, pendingFiles.current.get(pending.clientId));
    } catch {
      setPendingMessages(previous => previous.map(item => item.clientId === pending.clientId
        ? { ...item, pendingStatus: 'failed', statusUpdatedAt: new Date().toISOString() } : item));
      setChatError(pt ? 'Não foi possível salvar o envio no dispositivo.' : 'Could not save the message on this device.');
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
      replyTo:optimisticReplyReference(replySource),
    };
    setPendingMessages(prev=>[...prev,pending]);
    setReplySource(null);
    jumpToLast('smooth');
    void submitPending(pending);
  }
  function sendLocation(latitude:number,longitude:number,caption:string) {
    const conversationId=activeIdRef.current;
    if(!conversationId || busy || !Number.isFinite(latitude) || !Number.isFinite(longitude)
       || Math.abs(latitude)>90 || Math.abs(longitude)>180)return;
    const lat=latitude.toFixed(6),lon=longitude.toFixed(6);
    const link='https://www.google.com/maps?q='+lat+','+lon;
    const body='📍 '+(pt?'Localização compartilhada':'Shared location')+'\n'+link+(caption?'\n'+caption:'');
    const clientId=crypto.randomUUID(),createdAt=new Date().toISOString();
    const pending:PendingMessage={
      id:clientId,clientId,conversationId,authorId:myId,body,
      createdAt,readAt:null,deliveredAt:null,editedAt:null,deletedAt:null,
      forwarded:false,reactions:[],myReaction:null,pendingStatus:'sending',statusUpdatedAt:createdAt,
      replyToId:replySource?.id??null,
      replyTo:optimisticReplyReference(replySource),
    };
    setPendingMessages(prev=>[...prev,pending]);setReplySource(null);
    jumpToLast('smooth');void submitPending(pending);
  }
  async function send(forcedBody?:string) {
    const id = activeId;
    const body = (forcedBody??draft).trim();
    if (!id || !body || busy || body.length > 4000) return;
    setChatError(''); setActionNotice('');
    if (editing && forcedBody===undefined) {
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
    if (editing) cancelEdit();
    const clientId = crypto.randomUUID();
    const sentAt = new Date().toISOString();
    const pending: PendingMessage = {
      id:clientId, clientId,conversationId:id,authorId:myId,body,
      createdAt:sentAt,readAt:null,deliveredAt:null,editedAt:null,deletedAt:null,
      forwarded:false,reactions:[],myReaction:null,pendingStatus:'sending',statusUpdatedAt:sentAt,
      replyToId:replySource?.id??null,
      replyTo:optimisticReplyReference(replySource),
    };
    setPendingMessages(prev => [...prev,pending]);
    if(forcedBody===undefined)setDraft('');
    setReplySource(null);
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
  async function archiveConversation(thread:Conversation){
    if(conversationBusy)return;
    setConversationBusy(true);setConversationMenuOpen(false);setChatError('');
    try{
      await api('/api/v1/dm/conversations/'+encodeURIComponent(thread.id)+'/archive',{
        method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({archived:!thread.archived})
      });
      closeThread();
      await loadThreads();
    }catch{setChatError(pt?'Não foi possível atualizar o arquivo de conversas.':'Could not update archived chats.');}
    finally{setConversationBusy(false);}
  }
  async function deleteConversation(thread:Conversation){
    if(conversationBusy)return;
    setConversationBusy(true);setChatError('');
    try{
      await api('/api/v1/dm/conversations/'+encodeURIComponent(thread.id),{method:'DELETE'});
      clearChatMediaCache();
      await clearDmConversation(myId, thread.id);
      invalidateDmInbox();
      setPendingMessages(previous=>previous.filter(p=>p.conversationId!==thread.id));
      closeThread();setFilter('all');
      await loadThreads();
    }catch{setChatError(pt?'Não foi possível apagar esta conversa.':'Could not delete this conversation.');}
    finally{setConversationBusy(false);setConversationConfirm(null);}
  }
  async function toggleBlockConversation(thread:Conversation){
    if(conversationBusy)return;
    const wasBlocked=blockedHandles.includes(thread.peerHandle);
    setConversationBusy(true);setChatError('');
    try{
      await api(wasBlocked?'/api/v1/blocks/'+encodeURIComponent(thread.peerHandle):'/api/v1/blocks',{
        method:wasBlocked?'DELETE':'POST',
        ...(!wasBlocked?{headers:{'Content-Type':'application/json'},body:JSON.stringify({handle:thread.peerHandle})}:{})
      });
      setBlockedHandles(old=>wasBlocked?old.filter(x=>x!==thread.peerHandle):[...old,thread.peerHandle]);
      window.dispatchEvent(new Event('uorqui:blocks-updated'));
      setConversationMenuOpen(false);setConversationConfirm(null);
      await loadThreads();
    }catch{setChatError(pt?'Não foi possível atualizar o bloqueio.':'Could not change blocking status.');}
    finally{setConversationBusy(false);}
  }

  // Overlay the durable outbox on top of the server inbox rather than editing
  // canonical snapshots. New sends move their conversation to the top instantly,
  // and SSE/poll refreshes cannot erase a pending or failed local preview.
  const previewThreads = useMemo<PreviewConversation[]>(() => {
    const latest = new Map<string, PendingMessage>();
    for (const pending of [...confirmedInboxPreviews.map(item => item.pending), ...pendingMessages]) {
      const previous = latest.get(pending.conversationId);
      if (!previous || pending.createdAt > previous.createdAt ||
        (pending.createdAt === previous.createdAt && pending.clientId > previous.clientId)) {
        latest.set(pending.conversationId, pending);
      }
    }
    const display = threads.map(thread => {
      const pending = latest.get(thread.id);
      if (!pending) return thread;
      const serverActivity = Math.max(Date.parse(thread.lastAt ?? '') || 0, Date.parse(thread.lastReactionAt ?? '') || 0);
      if (serverActivity > (Date.parse(pending.createdAt) || 0)) return thread;
      return {
        ...thread, lastBody: pending.body, lastAttachmentType: pending.attachment?.type ?? null,
        lastReplyToId: pending.replyToId ?? null,
        lastAt: pending.createdAt, lastAuthorId: myId, lastDeleted: false,
        optimisticStatus: pending.pendingStatus,
      };
    });
    return display.sort((a, b) =>
      Math.max(Date.parse(b.lastAt ?? '') || 0, Date.parse(b.lastReactionAt ?? '') || 0) -
      Math.max(Date.parse(a.lastAt ?? '') || 0, Date.parse(a.lastReactionAt ?? '') || 0));
  }, [threads, pendingMessages, confirmedInboxPreviews, myId]);
  const active = threads.find(c => c.id === activeId);
  const query = search.trim().toLocaleLowerCase(locale);
  const visibleThreads = previewThreads.filter(c =>
    (filter === 'archived' ? c.archived : !c.archived && (filter === 'all' || c.unreadCount > 0)) &&
    (c.peerName + ' ' + c.peerHandle).toLocaleLowerCase(locale).includes(query));
  const unreadThreads = threads.filter(c => !c.archived && c.unreadCount > 0).length;
  const archivedThreads = threads.filter(c=>c.archived).length;

  return <div className="relative flex h-full min-h-0 min-w-0 overflow-hidden">
    <section data-uorqui-inbox-list data-uorqui-dm-list data-uorqui-workspace-surface ref={listRef} aria-label={pt ? 'Lista de conversas' : 'Conversation list'} className={cn(
      'h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-r border-border md:flex md:w-[340px] md:shrink-0 xl:w-[380px]',
      mobileOpened ? 'hidden' : 'flex'
    )}>
      <div className="shrink-0 border-b border-border px-4 pb-3 pt-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0"><h2 className="text-lg font-semibold tracking-tight">{pt ? 'Mensagens' : 'Messages'}</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{pt ? 'Mensagens individuais' : 'Direct messages'}</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={()=>onOpenContacts?.()}
            aria-label={pt?'Abrir contatos':'Open contacts'} disabled={!onOpenContacts}
            className="min-h-9 shrink-0 gap-2 rounded-md px-3 text-xs font-medium">
            <ContactRound aria-hidden="true" className="size-4"/>{pt?'Contatos':'Contacts'}
          </Button>
        </div>
        <div className="relative">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
          <Input value={search} onChange={e => setSearch(e.target.value)}
            aria-label={pt ? 'Buscar contatos ou conversas' : 'Search contacts or conversations'}
            placeholder={pt ? 'Buscar conversa ou @usuário' : 'Find a chat or @username'}
            className="h-10 rounded-md bg-card pl-9 pr-10 text-base md:text-sm"/>
          {search && <button type="button" onClick={() => setSearch('')} aria-label={pt ? 'Limpar pesquisa' : 'Clear search'}
            className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-accent"><X className="size-4"/></button>}
        </div>
        <div className="uorqui-inbox-filters mt-3 flex gap-1" role="group" aria-label={pt ? 'Filtrar conversas' : 'Filter conversations'}>
          {(['all', 'unread', 'archived'] as const).map(value => <button type="button" key={value} onClick={() => setFilter(value)}
            aria-pressed={filter === value} className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium',
              filter === value ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary')}>
            {value === 'all' ? (pt ? 'Todas' : 'All') : value === 'unread' ? (pt ? 'Não lidas' : 'Unread') : (pt ? 'Arquivadas' : 'Archived')}
            {value === 'unread' && unreadThreads > 0 && <span className="rounded bg-current/10 px-1 text-[10px]">{unreadThreads}</span>}
             {value === 'archived' && archivedThreads > 0 && <span className="rounded bg-current/10 px-1 text-[10px]">{archivedThreads}</span>}
          </button>)}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1">
        <>
        {error && <div role="alert" className="m-2 rounded-lg border border-destructive/30 p-3 text-xs text-destructive">{error}
          <Button className="ml-2" size="sm" variant="outline" onClick={() => void loadThreads().catch(() => {})}>{pt ? 'Tentar novamente' : 'Retry'}</Button>
        </div>}
        {loading && <WorkspaceContentLoading label={pt?'Carregando conversas':'Loading chats'}
          rows={3} className="p-3"/>}
        {query.length >= 2 && <>
          <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{pt ? 'Pessoas' : 'People'} {searching ? '…' : ''}</p>
          {people.map(person => <button type="button" key={person.handle} disabled={busy} onClick={() => void startPerson(person.handle)}
            className="flex min-h-16 w-full touch-manipulation items-center gap-3 rounded-xl px-3 py-2 text-left transition-[background-color,transform,box-shadow] duration-150 ease-out md:hover:bg-accent max-md:active:scale-[0.985] max-md:active:bg-primary/15 max-md:active:shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none">
            <UserAvatar name={compactUserName(person.displayName)} image={person.avatarUrl} size="sm"/>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{compactUserName(person.displayName)}</span>
              <span className="block truncate text-xs text-muted-foreground">@{person.handle}</span></span>
            <UserPlus className="size-4 shrink-0 text-muted-foreground"/>
          </button>)}
        </>}
        {visibleThreads.map((thread,index) => <button data-uorqui-dm-row type="button" key={thread.id} onClick={() => openThread(thread.id)}
          className={cn('relative flex min-h-[60px] w-full touch-manipulation items-center gap-3 rounded-md px-3 py-2 text-left transition-[background-color,transform,box-shadow] duration-150 ease-out md:hover:bg-secondary/70 max-md:active:scale-[0.985] max-md:active:bg-primary/15 max-md:active:shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
            index<visibleThreads.length-1 && "after:pointer-events-none after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-border/50",
            activeId === thread.id && mobileOpened && 'bg-secondary')}
          aria-current={activeId === thread.id && mobileOpened ? 'true' : undefined}>
          <UserAvatar name={compactUserName(thread.peerName)} image={thread.peerAvatarUrl} size="sm"/>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2"><span className={cn('truncate text-sm font-semibold', thread.unreadCount > 0 && 'font-bold')}>{compactUserName(thread.peerName)}</span>
              <time className="shrink-0 text-[10px] text-muted-foreground">{formatMessageTimestamp(thread.lastReactionAt && (!thread.lastAt || thread.lastReactionAt > thread.lastAt) ? thread.lastReactionAt : thread.lastAt, locale, todayKey)}</time></span>
            <span className="mt-1 flex items-center justify-between gap-2">
              <span className={cn('min-w-0 flex-1 truncate text-xs text-muted-foreground', thread.unreadCount > 0 && 'font-medium text-foreground/75')}>
                {thread.optimisticStatus === 'failed' && <span className="font-medium text-destructive">{pt ? 'Falha no envio · ' : 'Failed to send · '}</span>}
                {thread.lastReactionEmoji && thread.lastReactionAt && (!thread.lastAt || thread.lastReactionAt > thread.lastAt)
                  ? (thread.lastReactionAuthorId === myId
                      ? (pt ? 'Você reagiu ' + thread.lastReactionEmoji + ' à mensagem' : 'You reacted ' + thread.lastReactionEmoji + ' to a message')
                      : (pt ? compactUserName(thread.peerName) + ' reagiu ' + thread.lastReactionEmoji + ' à sua mensagem' : compactUserName(thread.peerName) + ' reacted ' + thread.lastReactionEmoji + ' to your message'))
                  : thread.lastDeleted ? (pt ? 'Mensagem excluída' : 'Deleted message')
                  : (thread.lastBody || thread.lastAttachmentType)
                    ? (thread.lastReplyToId
                        ? (thread.lastAuthorId === myId
                          ? (pt ? 'Você respondeu: ' : 'You replied: ')
                          : (pt ? compactUserName(thread.peerName) + ' respondeu: ' : compactUserName(thread.peerName) + ' replied: '))
                        : (thread.lastAuthorId === myId ? (pt ? 'Você: ' : 'You: ') : ''))
                      + (isCommunityGifUrl(thread.lastBody)?'GIF':(thread.lastBody || attachmentLabel(thread.lastAttachmentType,locale)))
                    : '@' + thread.peerHandle}
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
          <h3 className="mt-3 font-semibold">{filter === 'unread' ? (pt ? 'Tudo em dia' : 'All caught up') : filter === 'archived' ? (pt?'Nenhuma conversa arquivada':'No archived chats') : (pt ? 'Comece uma conversa' : 'Start a conversation')}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{pt ? 'Busque uma pessoa pelo nome ou @usuário.' : 'Search people by name or @username.'}</p>
        </div>}
        </>
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
            <UserAvatar name={compactUserName(active.peerName)} image={active.peerAvatarUrl} size="sm"/>
            <span className="min-w-0"><span className="block truncate text-sm font-semibold">{compactUserName(active.peerName)}</span>
              <span className="block truncate text-xs text-muted-foreground">@{active.peerHandle}</span></span>
          </a>
          <Button type="button" variant="ghost" size="icon"
            title={pt?'Mídias e arquivos':'Media and files'}
            aria-label={pt?'Ver todas as mídias e arquivos da conversa':'View all media and files from this conversation'}
            onClick={()=>setGalleryOpen(true)}><Images className="size-5"/></Button>
          <div className="relative shrink-0" ref={conversationMenuRef}>
            <Button type="button" variant="ghost" size="icon" aria-haspopup="menu"
              aria-expanded={conversationMenuOpen} aria-label={pt?'Opções da conversa':'Conversation options'}
              onClick={()=>setConversationMenuOpen(old=>!old)} disabled={conversationBusy}>
              {conversationBusy?<Spinner className="size-4"/>:<MoreHorizontal className="size-6"/>}
            </Button>
            {conversationMenuOpen&&<div role="menu" aria-label={pt?'Opções da conversa':'Conversation options'}
              className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl">
              <button type="button" role="menuitem" onClick={()=>{setGalleryOpen(true);setConversationMenuOpen(false);}}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-accent">
                <Images className="size-4"/>{pt?'Mídias e arquivos':'Media and files'}
              </button>
              <button type="button" role="menuitem" onClick={()=>void archiveConversation(active)}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-accent">
                {active.archived?<ArchiveRestore className="size-4"/>:<Archive className="size-4"/>}
                {active.archived?(pt?'Desarquivar':'Unarchive'):(pt?'Arquivar conversa':'Archive conversation')}
              </button>
              <button type="button" role="menuitem" onClick={()=>{setConversationMenuOpen(false);setConversationConfirm('delete');}}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-destructive hover:bg-accent">
                <Trash2 className="size-4"/>{pt?'Apagar conversa':'Delete conversation'}
              </button>
              <div className="my-1 h-px bg-border"/>
              <button type="button" role="menuitem"
                onClick={()=>{setConversationMenuOpen(false);if(blockedHandles.includes(active.peerHandle))void toggleBlockConversation(active);else setConversationConfirm('block');}}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-accent">
                {blockedHandles.includes(active.peerHandle)?<ShieldCheck className="size-4"/>:<ShieldBan className="size-4"/>}
                {blockedHandles.includes(active.peerHandle)?(pt?'Desbloquear usuário':'Unblock user'):(pt?'Bloquear usuário':'Block user')}
              </button>
            </div>}
          </div>
        </header>
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {pinnedMessage&&<div role="note" aria-label={pt?'Mensagem fixada':'Pinned message'}
            className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border bg-secondary/50 px-3 py-2 sm:px-5">
            <Pin className="size-4 shrink-0 text-foreground"/>
            <button type="button" className="min-w-0 flex-1 text-left hover:opacity-80"
              onClick={()=>void jumpToRepliedMessage(pinnedMessage.id)}>
              <span className="block text-[11px] font-semibold">{pt?'Mensagem fixada':'Pinned message'}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {pinnedMessage.body||pinnedMessage.attachment?.name||(pt?'Mídia ou arquivo':'Media or file')}
              </span>
            </button>
            <Button type="button" variant="ghost" size="icon" disabled={pinBusy}
              title={pt?'Desafixar mensagem':'Unpin message'} aria-label={pt?'Desafixar mensagem':'Unpin message'}
              onClick={()=>void togglePinned(null)}><PinOff className="size-4"/></Button>
          </div>}
          {galleryOpen&&<ConversationAttachmentsPanel conversationId={active.id} locale={locale}
            peerName={compactUserName(active.peerName)} onClose={()=>setGalleryOpen(false)}
            onJump={id=>{setGalleryOpen(false);void jumpToRepliedMessage(id);}}/>}
          <div ref={scrollBox} onScroll={onMessagesScroll}
            data-testid="messages-scroll" className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-background px-3 py-4 sm:px-6">
            <div ref={messageContentRef} key={activeId} className="uorqui-kit-content-enter flex w-full min-w-0 flex-col gap-2.5">
              {(historyFiltered?historyLoading:messagesLoading) && <WorkspaceContentLoading label={pt?'Carregando mensagens':'Loading messages'}
                rows={4} className="w-full py-4"/>}
              {!historyFiltered&&!messagesLoading&&!renderedMessages.length&&
                <p className="my-12 text-center text-sm text-muted-foreground">{pt?'Envie a primeira mensagem.':'Send the first message.'}</p>}
              {historyFiltered&&!historyLoading&&!filteredHistory.length&&!historyError&&
                <div className="my-12 space-y-3 text-center">
                  <p className="text-sm text-muted-foreground">{pt?'Nenhuma mensagem neste período.':'No messages in this period.'}</p>
                  <Button size="sm" variant="outline" onClick={()=>setHistoryPeriod('all')}>
                    {pt?'Ver todas as mensagens':'Show all messages'}
                  </Button>
                </div>}
              {historyError&&<p role="alert" className="py-3 text-center text-xs text-destructive">{historyError}</p>}
              {dayGroups.map(group=><Fragment key={group.dayKey}>
                <div role="group" data-uorqui-dm-date-divider aria-label={channelHistoryDayLabel(group.dayKey,todayKey,locale)}
                  className="flex items-center gap-3 py-2">
                  <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-border"/>
                  <ChannelDateFilter dayKey={group.dayKey} todayKey={todayKey} locale={locale}
                    period={historyPeriod} customRange={customHistoryRange}
                    onPeriodChange={setHistoryPeriod} onCustomRangeChange={setCustomHistoryRange}/>
                  <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-border"/>
                </div>
                {group.messages.map(message => {
                const status = !historyFiltered?blockReceipts.get(message.id):null;
                return <div key={message.id} className="flex min-w-0 flex-col gap-1.5">
                  <DirectMessageBubble message={message} todayKey={todayKey}
                    onOpenMedia={setMediaViewerId}
                    mine={message.authorId === myId} locale={locale} myId={myId} peerName={compactUserName(active.peerName)} onReply={respond}
                    onJumpToReply={id => void jumpToRepliedMessage(id)} highlighted={highlightId === message.id}
                    isPinned={pinnedMessage?.id===message.id}
                    onPin={pinBusy?undefined:target=>void togglePinned(pinnedMessage?.id===target.id?null:target)}
                    disabled={!active.canMessage || actionBusy || busy || Object.prototype.hasOwnProperty.call(reactionOverrides, message.id)} onEdit={beginEdit} onCancel={setCancelTarget}
                    onForward={message => { setActionNotice(''); setForwardTarget(message); }}
                     onReport={message=>setReportMessageId(message.id)}
                    onReact={(message, emoji) => void react(message, emoji)}
                    onRetry={message => {
                      const pending = pendingMessages.find(p => p.clientId === message.clientId);
                      if (pending) void retryDmMessage(myId, pending.clientId).catch(() => submitPending(pending));
                    }}/>
                  {status && <div role="note" className="flex justify-center py-0.5">
                    <time dateTime={status.updatedAt} className="inline-flex rounded-md border border-border/50 bg-muted/60 px-3 py-1 text-center text-[11px] text-muted-foreground">
                      {status.label} {pt ? 'às' : 'at'} {formatMessageTimestamp(status.updatedAt, locale, todayKey)}
                    </time>
                  </div>}
                </div>;
              })}</Fragment>)}
              {historyFiltered&&historyHasMore&&<div className="flex justify-center py-3">
                <Button variant="outline" size="sm" disabled={historyMoreLoading}
                  onClick={()=>void loadMoreFilteredHistory()}>
                  {historyMoreLoading?(pt?'Carregando…':'Loading…'):(pt?'Carregar mensagens anteriores':'Load earlier messages')}
                </Button>
              </div>}
            </div>
          </div>
          {!historyFiltered&&!atBottom && <div className="pointer-events-none absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">
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
          {replySource && !editing && <ReplyComposerPreview
            author={replySource.authorId === myId ? (pt ? 'Você' : 'You') : compactUserName(active.peerName)}
            body={replySource.body || replySource.attachment?.name} locale={locale}
            onCancel={() => setReplySource(null)}/>}
          {active.canMessage && gifPickerOpen && <CommunityMediaPicker tab="gif" pt={pt}
            onClose={()=>setGifPickerOpen(false)} onEmoji={()=>{}}
            onGif={url=>{setGifPickerOpen(false);void send(url);}}/>}
          {active.canMessage ? <LiveMessageComposer value={draft} onChange={onDraftChange} onSubmit={() => void send()}
            onAttach={sendAttachment} onShareLocation={sendLocation} sending={busy} locale={locale} textareaRef={textareaRef} editing={!!editing}
             onGif={()=>setGifPickerOpen(old=>!old)} gifOpen={gifPickerOpen}/> :
            <div role="status" className="rounded-xl border border-border bg-secondary/60 px-4 py-3 text-center text-sm text-muted-foreground">
              {pt ? 'Mensagens indisponíveis: perfil privado sem contato aceito ou conta bloqueada.' : 'Messaging unavailable: private profile without an accepted contact or blocked account.'}
              <div className="mt-2"><button type="button" className="text-primary underline" onClick={() => { closeThread(); onOpenContacts?.(); }}>
                {pt ? 'Ver solicitações de contato' : 'View contact requests'}
              </button></div>
            </div>}
        </div>
        {conversationConfirm&&<div className="absolute inset-0 z-[80] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="conversation-action-title"
            className="w-full max-w-sm rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl">
            <h3 id="conversation-action-title" className="text-base font-semibold">
              {conversationConfirm==='delete'?(pt?'Apagar esta conversa?':'Delete this conversation?'):(pt?'Bloquear este usuário?':'Block this user?')}
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {conversationConfirm==='delete'
                ?(pt?'A conversa e suas mensagens antigas desaparecerão somente para você. A outra pessoa mantém o histórico. Mensagens novas poderão reabrir a conversa.':'This conversation and past messages will be hidden only for you. The other person keeps their history. New messages can reopen it.')
                :(pt?'Vocês não poderão trocar mensagens e o contato será removido. Você poderá desbloquear depois no perfil.':'You will no longer be able to message each other and the contact will be removed. You can unblock later from your profile.')}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" disabled={conversationBusy} onClick={()=>setConversationConfirm(null)}>{pt?'Cancelar':'Cancel'}</Button>
              <Button variant="destructive" disabled={conversationBusy} loading={conversationBusy}
                onClick={()=>void (conversationConfirm==='delete'?deleteConversation(active):toggleBlockConversation(active))}>
                {conversationConfirm==='delete'?(pt?'Apagar conversa':'Delete chat'):(pt?'Bloquear':'Block')}
              </Button>
            </div>
          </section>
        </div>}
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
        <InternalShareDialog source={forwardTarget?{
          kind:'message',messageId:forwardTarget.id,conversationId:forwardTarget.conversationId,
          body:forwardTarget.body,attachment:forwardTarget.attachment
        }:null} onClose={()=>setForwardTarget(null)}
          onSent={name=>{setActionNotice(pt?'Compartilhado com '+name:'Shared with '+name);void loadThreads().catch(()=>{});}}/>
      </> : <div className="flex h-full flex-col items-center justify-center gap-3 px-5 text-center">
        <MessageCircle className="size-10 text-primary"/>
        <h3 className="font-semibold">{pt ? 'Selecione uma conversa' : 'Select a conversation'}</h3>
        <p className="max-w-xs text-sm text-muted-foreground">{pt ? 'Busque uma pessoa ou abra uma conversa existente.' : 'Find someone or open an existing conversation.'}</p>
      </div>}
    </section>

    <ContentReportDialog target={reportMessageId?{targetKind:'direct_message',targetId:reportMessageId}:null}
      locale={locale} onClose={()=>setReportMessageId(null)}/>
    <ChatMediaViewer items={mediaItems} selectedId={mediaViewerId} onSelect={setMediaViewerId}
      onClose={()=>setMediaViewerId(null)} onSendEdited={file=>sendAttachment(file,'')}
      onShareMedia={message=>{setMediaViewerId(null);setForwardTarget(message);setActionNotice('');}}
      locale={locale}/>
    {incoming && <aside role="status" aria-live="polite"
      className="absolute left-3 right-3 top-3 z-40 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-border bg-popover px-3 py-2.5 text-popover-foreground shadow-xl">
      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={() => { openThread(incoming.id); setIncoming(null); }}>
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/15 font-bold text-primary">U</span>
        <span className="min-w-0"><strong className="block truncate text-xs">{compactUserName(incoming.name)}</strong>
          <small className="block truncate text-xs text-muted-foreground">{incoming.preview}</small></span>
      </button>
      <button type="button" onClick={() => setIncoming(null)}
        aria-label={pt ? 'Dispensar aviso' : 'Dismiss notification'}
        className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-accent"><X className="size-4"/></button>
    </aside>}
  </div>;
}
