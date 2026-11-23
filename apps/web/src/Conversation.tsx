import { ArrowDown, LoaderCircle, MessageSquare, Pencil, Send, Trash2, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, api, cachedQuery, errorText, type Channel, type Message, type MessagePage, type User } from './api'
import { MessageSkeleton } from './components/ui/skeleton'
import { useOutbox } from './outbox'
import { ActionForm } from './forms'
import { Button, Modal } from './components/ui/controls'
import type { Copy, Locale } from './copy'

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]?.toUpperCase()).join('')
}

type MessageAction = (message: Message, action: 'edit' | 'cancel', body?: string) => Promise<void>

function MessageItem({ message, locale, copy, user, onThread, onAction, onRetry }: {
  message: Message; locale: Locale; copy: Copy; user?: User; onThread?: (message: Message) => void
  onAction?: MessageAction; onRetry?: (message: Message) => Promise<void>
}) {
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
      {message.delivery && <small role="status">
        {message.delivery === 'sending' ? <><LoaderCircle className="action-spinner inline" size={13} /> {copy.sending}</> : copy.failedMessage}
      </small>}
      <div className="message-actions">
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
    {editing && onAction && <Modal title={copy.editMessage} closeLabel={copy.close} onClose={() => setEditing(false)}>
      <ActionForm copy={copy} submit={copy.save} onSubmit={async (data) => {
        await onAction(message, 'edit', String(data.get('body')))
        setEditing(false)
      }}>
        <label>{copy.editText}<textarea name="body" defaultValue={message.body} required maxLength={4000} rows={3} /></label>
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
  const received = pages.reduce((all, page) => mergeMessages(all, page.messages), first?.messages ?? [])
  const inaccessible = loadError instanceof ApiError && ['CHANNEL_NOT_FOUND', 'FORBIDDEN'].includes(loadError.code)
  const records = inaccessible ? [] : [...received, ...outgoing.filter((message) =>
    !received.some((saved) => saved.id === message.id || (message.clientId && saved.clientId === message.clientId)))]
  const hasMore = (pages.at(-1) ?? first)?.more

  useEffect(() => {
    const controller = new AbortController()
    let timeout: number
    let loading = false
    async function load() {
      if (loading || controller.signal.aborted) return
      window.clearTimeout(timeout)
      if (document.hidden) return
      loading = true
      try {
        const page = await api<MessagePage>(`${endpoint}?${threadQuery}`, { signal: controller.signal })
        if (controller.signal.aborted) return
        setFirst((current) => current
          ? { messages: mergeMessages(current.messages, page.messages), more: current.more }
          : page)
        setOutgoing((current) => current.filter((item) =>
          !page.messages.some((saved) => saved.id === item.id || (item.clientId && saved.clientId === item.clientId))))
        for (const message of page.messages) onUpdated?.(message)
        setLoadError(undefined)
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error)
      } finally {
        loading = false
        if (!controller.signal.aborted) setRetrying(false)
        if (!controller.signal.aborted) timeout = window.setTimeout(load, 10000)
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

  async function loadOlder() {
    const oldest = records[0]
    if (!oldest || paging) return
    setPaging(true)
    try {
      const page = await api<MessagePage>(`${endpoint}?before=${oldest.id}${threadQuery ? `&${threadQuery}` : ''}`)
      if (scroll.current) prepend.current = { height: scroll.current.scrollHeight, top: scroll.current.scrollTop }
      setPages((current) => [...current, page])
    } catch (error) {
      setLoadError(error)
    } finally {
      setPaging(false)
    }
  }

  async function transmit(message: Message) {
    setBusy(true)
    setSendError(undefined)
    setOutgoing((current) => current.map((item) => item.clientId === message.clientId ? { ...item, delivery: 'sending' } : item))
    try {
      const result = await api<{ id: number }>(endpoint, { data: {
        body: message.body, clientId: message.clientId, ...(thread ? { thread: thread.id } : {}),
      } })
      setOutgoing((current) => current.map((item) => item.clientId === message.clientId
        ? { ...item, id: result.id, delivery: undefined } : item))
      setRefresh((current) => current + 1)
    } catch (error) {
      setSendError(error)
      setOutgoing((current) => current.map((item) => item.clientId === message.clientId ? { ...item, delivery: 'failed' } : item))
    } finally {
      setBusy(false)
      textarea.current?.focus()
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !draft.trim()) return
    const message: Message = {
      id: -Date.now(), clientId: crypto.randomUUID(), body: draft.trim(), author: user?.name ?? '',
      authorId: user?.id, createdAt: new Date().toISOString(), replies: 0, delivery: 'sending',
    }
    setOutgoing((current) => [...current, message])
    setDraft('')
    follow.current = true
    setAtBottom(true)
    await transmit(message)
  }

  async function changeMessage(message: Message, action: 'edit' | 'cancel', body?: string) {
    await api(`${endpoint}/${message.id}/${action}`, { data: action === 'edit' ? { body } : {} })
    const updated = action === 'edit'
      ? { ...message, body: body!.trim(), editedAt: new Date().toISOString() }
      : { ...message, body: '', cancelledAt: new Date().toISOString() }
    const replace = (page: MessagePage) => ({ ...page, messages: page.messages.map((item) => item.id === message.id ? updated : item) })
    setFirst((current) => current ? replace(current) : current)
    setPages((current) => current.map(replace))
    setOutgoing((current) => current.map((item) => item.id === message.id ? updated : item))
    onUpdated?.(updated)
  }

  useLayoutEffect(() => {
    const field = textarea.current
    if (!field) return
    field.style.height = 'auto'
    field.style.height = `${Math.min(field.scrollHeight, 160)}px`
  }, [draft])

  const placeholder = thread ? copy.replyMessage : copy.message(channel.name)
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
        return <div key={message.id}>
          {showDay && <div className="date-line"><span>{date}</span></div>}
          <MessageItem message={message} locale={locale} copy={copy} user={user} onThread={onThread} onAction={changeMessage} onRetry={transmit} />
        </div>
      })}
    </div>
    {loadError !== undefined && <div className="notice error">
      <span role="alert">{errorText(copy, loadError)}</span>
      <Button variant="ghost" loading={retrying} onClick={() => { setRetrying(true); setRefresh((current) => current + 1) }}>{copy.retry}</Button>
    </div>}
    <form className="composer" onSubmit={send}>
      {!atBottom && <Button variant="outline" className="latest" onClick={() => {
        if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
      }}><ArrowDown size={15} />{copy.moveLatest}</Button>}
      <div className="compose-box">
        <textarea ref={textarea} value={draft} rows={1} maxLength={4000} placeholder={placeholder} aria-label={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }} />
        <Button type="submit" disabled={!draft.trim() || inaccessible} loading={busy} aria-label={copy.send}><Send size={17} /></Button>
      </div>
      {sendError !== undefined && <p role="alert" className="error">{errorText(copy, sendError)}</p>}
    </form>
  </>
}

export function Conversation({ channel, copy, locale, user }: { channel: Channel; copy: Copy; locale: Locale; user?: User }) {
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
