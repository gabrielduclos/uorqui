import { ArrowDown, LoaderCircle, MessageSquare, Pencil, SmilePlus, Trash2, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ApiError, api, cachedQuery, refreshChannel, errorText, type Channel, type Message, type MessagePage, type User } from './api'
import { MessageSkeleton } from './components/ui/skeleton'
import { LiveMessageComposer } from './LiveMessageComposer'
import { ChatAudioPlayer } from './ChatAudioPlayer'
import { isRealtimeConnected, useRealtime } from './realtime'
import { useOutbox } from './outbox'
import { ActionForm } from './forms'
import { Button, Modal } from './components/ui/controls'
import type { Copy, Locale } from './copy'
import { useUnread } from './unread'

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]?.toUpperCase()).join('')
}

type MessageAction = (message: Message, action: 'edit' | 'cancel' | 'reaction', body?: string) => Promise<void>

function MessageItem({ message, locale, copy, user, onThread, onAction, onRetry }: {
  message: Message; locale: Locale; copy: Copy; user?: User; onThread?: (message: Message) => void
  onAction?: MessageAction; onRetry?: (message: Message) => Promise<void>
}) {
  const [reacting, setReacting] = useState(false)
  const [reactionError, setReactionError] = useState<unknown>()
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const time = new Date(message.createdAt)
  const own = user?.id === message.authorId
  return <article className="message" aria-busy={message.delivery === 'sending'}>
    <span className="avatar" aria-hidden="true">{initials(message.author)}</span>
    <div className="message-body">
      <div className="message-meta"><strong>{message.authorId ? <button className="author-link" onClick={() =>
          window.dispatchEvent(new CustomEvent('show-person', { detail: message.authorId }))}>{message.author}</button> : message.author}</strong>
        <time dateTime={message.createdAt} title={time.toLocaleString(locale)}>{time.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</time>
        {message.editedAt && !message.cancelledAt && <small>{copy.edited}</small>}
      </div>
      <p className={message.cancelledAt ? 'muted' : undefined}>{message.cancelledAt ? copy.cancelledMessage : message.body}</p>
      {!message.cancelledAt && <>
        {message.attachments?.map((file) => {
          const src = file.url ?? `/api/files/${file.id}`
          return <div className="message-attachment" key={file.id}>
            {file.mime.startsWith('image/') ? <a href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt={file.name} loading="lazy" /></a>
              : file.mime.startsWith('video/') ? <video controls playsInline preload="metadata" src={src} aria-label={file.name} />
              : file.mime.startsWith('audio/') ? <ChatAudioPlayer src={src} locale={locale} /> : null}
            {!file.mime.startsWith('audio/') && <a className="file-link" href={file.url ?? `/api/files/${file.id}?download=1`} download={file.name}>{file.name} · {file.size < 1024 ? `${file.size} B` : `${(file.size / 1024).toFixed(0)} KB`} · {copy.download}</a>}
          </div>
        })}
        {message.location && <a className="file-link" target="_blank" rel="noopener noreferrer" href={`https://www.openstreetmap.org/?mlat=${message.location.latitude}&mlon=${message.location.longitude}#map=16/${message.location.latitude}/${message.location.longitude}`}>{copy.location} · {message.location.latitude.toFixed(5)}, {message.location.longitude.toFixed(5)}</a>}
      </>}
      {message.delivery && <small role="status">
        {message.delivery === 'sending' ? <><LoaderCircle className="action-spinner inline" size={13} /> {copy.sending}</> : copy.failedMessage}
      </small>}
      {!message.cancelledAt && !message.delivery && onAction && <div className="message-reactions">
        {message.reactions?.map((reaction) => <Button key={reaction.emoji} variant="outline" aria-pressed={!!user && reaction.users.includes(user.id)}
          aria-label={`${reaction.emoji}: ${reaction.count}`} onClick={async () => {
            setReactionError(undefined)
            try { await onAction(message, 'reaction', reaction.emoji) } catch (error) { setReactionError(error) }
          }}>{reaction.emoji} {reaction.count}</Button>)}
      </div>}
      {reactionError !== undefined && <p className="error" role="alert">{errorText(copy, reactionError)}</p>}
      <div className="message-actions">
        {!message.cancelledAt && !message.delivery && onAction && <Button variant="ghost" aria-label={copy.react} onClick={() => setReacting(true)}><SmilePlus size={14} /></Button>}

        {message.delivery === 'failed' && onRetry && <Button variant="ghost" onClick={() => onRetry(message)}>{copy.retry}</Button>}
        {onThread && !message.delivery && <Button variant="ghost" className="reply-link" onClick={() => onThread(message)}>
          <MessageSquare size={14} />{message.replies ? copy.replyCount(message.replies) : copy.reply}
        </Button>}
        {own && !message.delivery && !message.cancelledAt && onAction && <>
          <Button variant="ghost" aria-label={copy.editMessage} onClick={() => setEditing(true)}><Pencil size={14} /></Button>
          <Button variant="ghost" aria-label={copy.cancelMessage} onClick={() => setConfirming(true)}><Trash2 size={14} /></Button>
        </>}
      </div>
    </div>
    {reacting && onAction && <Modal title={copy.react} closeLabel={copy.close} onClose={() => setReacting(false)}>
      <div className="reaction-picker">{['👍', '❤️', '😂', '😮', '😢', '🎉'].map((emoji) => <Button key={emoji} variant="outline"
        aria-label={emoji} aria-pressed={message.reactions?.some((item) => item.emoji === emoji && !!user && item.users.includes(user.id)) ?? false}
        onClick={async () => { setReactionError(undefined); try { await onAction(message, 'reaction', emoji); setReacting(false) } catch (error) { setReactionError(error) } }}>{emoji}</Button>)}</div>
      {reactionError !== undefined && <p className="error" role="alert">{errorText(copy, reactionError)}</p>}
    </Modal>}
    {editing && onAction && <Modal title={copy.editMessage} closeLabel={copy.close} onClose={() => setEditing(false)}>
      <ActionForm copy={copy} submit={copy.save} onSubmit={async (data) => {
        await onAction(message, 'edit', String(data.get('body')))
        setEditing(false)
      }}>
        <label>{copy.editText}<textarea name="body" aria-label={copy.editText} defaultValue={message.body} required maxLength={4000} rows={3} /></label>
      </ActionForm>
    </Modal>}
    {confirming && onAction && <Modal title={copy.cancelMessage} closeLabel={copy.close} onClose={() => setConfirming(false)}>
      <ActionForm copy={copy} submit={copy.cancelMessage} onSubmit={async () => {
        await onAction(message, 'cancel')
        setConfirming(false)
      }} />
    </Modal>}
  </article>
}

function mergeMessages(current: Message[], incoming: Message[]) {
  const unique = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) unique.set(message.id, message)
  return [...unique.values()].sort((left, right) => left.id - right.id)
}

function MessageList({ channel, thread, copy, locale, user, onThread, onUpdated }: {
  channel: Channel; thread?: Message; copy: Copy; locale: Locale; user?: User; onUpdated?: (message: Message) => void; onThread?: (message: Message) => void
}) {
  const threadQuery = thread ? `thread=${thread.id}` : ''
  const endpoint = `/channels/${channel.id}/messages`
  const [outgoing, setOutgoing] = useOutbox(user?.id, channel.id, thread?.id)
  const [pages, setPages] = useState<MessagePage[]>([])
  const [first, setFirst] = useState<MessagePage | undefined>(() => cachedQuery<MessagePage>(`${endpoint}?${threadQuery}`))
  const [loadError, setLoadError] = useState<unknown>()
  const [sendError, setSendError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [paging, setPaging] = useState(false)
  const [draft, setDraft] = useState('')
  const [refresh, setRefresh] = useState(0)
  const scroll = useRef<HTMLDivElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const follow = useRef(true)
  const prepend = useRef<{ height: number; top: number } | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const unread = useUnread().find((item) => item.channelId === channel.id)
  const reading = useRef(false)
  const acknowledged = useRef(0)
  const [readAttempt, setReadAttempt] = useState(0)
  const pendingCount = useRef(0)
  const transmitting = useRef(new Set<string>())
  const historyCursors = useRef<number[]>([])
  const received = pages.reduce((all, page) => mergeMessages(all, page.messages), first?.messages ?? [])
  const inaccessible = loadError instanceof ApiError && ['CHANNEL_NOT_FOUND', 'FORBIDDEN'].includes(loadError.code)
  const records = inaccessible ? [] : [...received, ...outgoing.filter((message) =>
    !received.some((saved) => saved.id === message.id || (message.clientId && saved.clientId === message.clientId)))]
  const hasMore = (pages.at(-1) ?? first)?.more

  useEffect(() => {
    const controller = new AbortController()
    let timeout: number
    let loading = false
    let reloadRequested = false
    function schedule() {
      timeout = window.setTimeout(() => { if (isRealtimeConnected(channel.id)) schedule(); else void load() }, 30000)
    }
    async function load() {
      if (controller.signal.aborted) return
      if (loading) { reloadRequested = true; return }
      window.clearTimeout(timeout)
      if (document.hidden) return
      loading = true
      try {
        const page = await api<MessagePage>(`${endpoint}?${threadQuery}`, { signal: controller.signal })
        if (controller.signal.aborted) return
        setFirst((current) => current
          ? { ...page, messages: mergeMessages(current.messages, page.messages), more: current.more }
          : page)
        for (const message of page.messages) onUpdated?.(message)
        if (historyCursors.current.length) {
          const history = await Promise.all(historyCursors.current.map((before) => api<MessagePage>(`${endpoint}?before=${before}${threadQuery ? `&${threadQuery}` : ''}`, { signal: controller.signal })))
          if (!controller.signal.aborted) setPages(history)
        }
        setLoadError(undefined)
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error)
      } finally {
        loading = false
        if (!controller.signal.aborted) setRetrying(false)
        if (!controller.signal.aborted) {
          if (reloadRequested) { reloadRequested = false; void load() } else schedule()
        }
      }
    }
    const resume = () => { if (!document.hidden) void load() }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('focus', resume)
    window.addEventListener('cache-updated', resume)
    void load()
    return () => {
      controller.abort()
      window.clearTimeout(timeout)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('focus', resume)
      window.removeEventListener('cache-updated', resume)
    }
  }, [endpoint, threadQuery, refresh])

  // Reconcile after committing the received page so an open action dialog keeps its message mounted.
  useEffect(() => {
    if (!first) return
    setOutgoing((current) => current.filter((item) =>
      !first.messages.some((saved) => saved.id === item.id || (item.clientId && saved.clientId === item.clientId))))
  }, [first, setOutgoing])

  useLayoutEffect(() => {
    const list = scroll.current
    if (!list) return
    if (prepend.current) {
      list.scrollTop = prepend.current.top + list.scrollHeight - prepend.current.height
      prepend.current = null
    } else if (follow.current) {
      list.scrollTop = list.scrollHeight
    }
  }, [records.length, first !== undefined])

  useEffect(() => {
    let retryRead: number | undefined
    const mark = () => {
      const cursor = first?.readCursor ?? 0
      if (thread || !unread?.count || cursor < unread.latestId || cursor <= acknowledged.current || reading.current
        || !follow.current || document.hidden || !document.hasFocus() || !scroll.current?.getClientRects().length) return
      reading.current = true
      void api(`/channels/${channel.id}/read`, { data: { lastMessageId: cursor } })
        .then(() => { acknowledged.current = cursor; setReadAttempt((value) => value + 1) })
        .catch(() => { retryRead = window.setTimeout(() => setReadAttempt((value) => value + 1), 5000) })
        .finally(() => { reading.current = false })
    }
    mark()
    window.addEventListener('focus', mark)
    document.addEventListener('visibilitychange', mark)
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) mark() })
    if (scroll.current) observer.observe(scroll.current)
    return () => { clearTimeout(retryRead); observer.disconnect(); window.removeEventListener('focus', mark); document.removeEventListener('visibilitychange', mark) }
  }, [channel.id, first?.readCursor, unread?.latestId, unread?.count, atBottom, thread, readAttempt])

  async function loadOlder() {
    const oldest = records[0]
    if (!oldest || paging) return
    setPaging(true)
    try {
      const page = await api<MessagePage>(`${endpoint}?before=${oldest.id}${threadQuery ? `&${threadQuery}` : ''}`)
      if (scroll.current) prepend.current = { height: scroll.current.scrollHeight, top: scroll.current.scrollTop }
      historyCursors.current.push(oldest.id)
      setPages((current) => [...current, page])
    } catch (error) {
      setLoadError(error)
    } finally {
      setPaging(false)
    }
  }

  async function transmit(message: Message) {
    if (!message.clientId || transmitting.current.has(message.clientId)) return
    transmitting.current.add(message.clientId)
    pendingCount.current++; setBusy(true)
    setSendError(undefined)
    setOutgoing((current) => current.map((item) => item.clientId === message.clientId ? { ...item, delivery: 'sending' } : item))
    try {
      const attachmentIds: string[] = []
      if (message.pendingFile) {
        const file = message.pendingFile
        const prepared = await api<{ id: string; ready: boolean }>(`/channels/${channel.id}/uploads`, { data: {
          id: message.clientId, name: file.name, size: file.size, mime: file.type.split(';')[0] || 'application/octet-stream',
        } })
        if (!prepared.ready) {
          const uploaded = await fetch(`/api/files/${prepared.id}`, { method: 'PUT', body: file })
          if (!uploaded.ok) { const error = await uploaded.json().catch(() => null) as { code?: string } | null; throw new ApiError(error?.code ?? 'FILES_UNAVAILABLE') }
        }
        attachmentIds.push(prepared.id)
      }
      const result = await api<{ id: number }>(endpoint, { data: {
        body: message.body, clientId: message.clientId, attachmentIds, ...(message.location ? { location: message.location } : {}), ...(thread ? { thread: thread.id } : {}),
      } })
      setOutgoing((current) => current.map((item) => item.clientId === message.clientId
        ? { ...item, id: result.id, delivery: undefined, pendingFile: undefined } : item))
      setRefresh((current) => current + 1)
    } catch (error) {
      setSendError(error)
      setOutgoing((current) => current.map((item) => item.clientId === message.clientId ? { ...item, delivery: 'failed' } : item))
    } finally {
      transmitting.current.delete(message.clientId!)
      pendingCount.current--; setBusy(pendingCount.current > 0)
      textarea.current?.focus()
    }
  }

  async function send(body = draft.trim(), file?: File, location?: Message['location']) {
    if (inaccessible || (!body && !file && !location)) return
    const clientId = crypto.randomUUID()
    const message: Message = {
      id: -Date.now() - Math.random(), clientId, body, author: user?.name ?? '',
      authorId: user?.id, createdAt: new Date().toISOString(), replies: 0, delivery: 'sending',
      ...(file ? { pendingFile: file, attachments: [{ id: clientId, name: file.name, size: file.size,
        mime: file.type.split(';')[0] || 'application/octet-stream', url: URL.createObjectURL(file) }] } : {}),
      ...(location ? { location } : {}),
    }
    setOutgoing((current) => [...current, message])
    setDraft('')
    follow.current = true
    setAtBottom(true)
    await transmit(message)
  }

  async function changeMessage(message: Message, action: 'edit' | 'cancel' | 'reaction', body?: string) {
    if (action === 'reaction') {
      await api(`${endpoint}/${message.id}/reaction`, { data: { emoji: body, active: !message.reactions?.some((item) => item.emoji === body && !!user && item.users.includes(user.id)) } })
      refreshChannel(channel.id)
      return
    }
    await api(`${endpoint}/${message.id}/${action}`, { data: action === 'edit' ? { body } : {} })
    const updated = action === 'edit'
      ? { ...message, body: body!.trim(), editedAt: new Date().toISOString() }
      : { ...message, body: '', location: null, attachments: [], cancelledAt: new Date().toISOString() }
    const replace = (page: MessagePage) => ({ ...page, messages: page.messages.map((item) => item.id === message.id ? updated : item) })
    setFirst((current) => current ? replace(current) : current)
    setPages((current) => current.map(replace))
    setOutgoing((current) => current.map((item) => item.id === message.id ? updated : item))
    onUpdated?.(updated)
  }


  let lastDay: string | undefined
  return <>
    <div className="message-scroll" ref={scroll} onScroll={(event) => {
      const list = event.currentTarget
      follow.current = list.scrollHeight - list.scrollTop - list.clientHeight < 48
      setAtBottom(follow.current)
    }}>
      {thread && !inaccessible && <div className="thread-root"><MessageItem message={thread} copy={copy} locale={locale} user={user} onAction={changeMessage} /></div>}
      {hasMore && <div className="load-more"><Button variant="outline" onClick={loadOlder} loading={paging}>
        {copy.older}
      </Button></div>}
      {!first && !records.length && loadError === undefined && <MessageSkeleton copy={copy} />}
      {first && !records.length && <p className="empty-messages">{thread ? copy.emptyThread : copy.emptyChannel}</p>}
      {records.map((message) => {
        const date = new Date(message.createdAt).toLocaleDateString(locale, { dateStyle: 'long' })
        const showDay = date !== lastDay
        lastDay = date
        return <div key={message.clientId ? `${message.authorId}:${message.clientId}` : message.id}>
          {showDay && <div className="date-line"><span>{date}</span></div>}
          <MessageItem message={message} locale={locale} copy={copy} user={user} onThread={onThread} onAction={changeMessage} onRetry={transmit} />
        </div>
      })}
    </div>
    {loadError !== undefined && <div className="notice error">
      <span role="alert">{errorText(copy, loadError)}</span>
      <Button variant="ghost" loading={retrying} onClick={() => { setRetrying(true); setRefresh((current) => current + 1) }}>{copy.retry}</Button>
    </div>}
    <div className="composer">
      {!atBottom && <Button variant="outline" className="latest" onClick={() => {
        if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
      }}><ArrowDown size={15} />{copy.moveLatest}</Button>}
      <LiveMessageComposer value={draft} onChange={setDraft} textareaRef={textarea} sending={busy} disabled={inaccessible}
        locale={locale} allowOffice onSubmit={() => { if (!busy) void send() }}
        onAttach={(file, caption) => { void send(caption, file) }}
        onShareLocation={(latitude, longitude, caption) => { void send(caption, undefined, { latitude, longitude }) }} />
      {sendError !== undefined && <p role="alert" className="error">{errorText(copy, sendError)}</p>}
    </div>
  </>
}

export function Conversation({ channel, copy, locale, user }: { channel: Channel; copy: Copy; locale: Locale; user?: User }) {
  useRealtime(channel.id)
  const [thread, setThread] = useState<Message>()
  return <div className={thread ? 'conversation with-thread' : 'conversation'}>
    <section className="room" aria-label={copy.discussion}>
      <MessageList channel={channel} copy={copy} locale={locale} user={user} onUpdated={(message) => setThread((current) => current?.id === message.id ? message : current)} onThread={setThread} />
    </section>
    {thread && <section className="thread" aria-label={copy.thread}>
      <header><strong>{copy.thread}</strong><Button variant="ghost" aria-label={copy.close} onClick={() => setThread(undefined)}><X size={18} /></Button></header>
      <MessageList key={thread.id} channel={channel} thread={thread} copy={copy} locale={locale} user={user} onUpdated={(message) => setThread((current) => current?.id === message.id ? message : current)} />
    </section>}
  </div>
}
