import { ArrowDown, MessageSquare, Send, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { api, cachedQuery, errorText, type Channel, type Message, type MessagePage } from './api'
import { MessageSkeleton } from './components/ui/skeleton'
import { Button } from './components/ui/controls'
import type { Copy, Locale } from './copy'

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]?.toUpperCase()).join('')
}

function MessageItem({ message, locale, copy, onThread }: {
  message: Message; locale: Locale; copy: Copy; onThread?: (message: Message) => void
}) {
  const time = new Date(message.createdAt)
  return <article className="message">
    <span className="avatar" aria-hidden="true">{initials(message.author)}</span>
    <div className="message-body">
      <div className="message-meta"><strong>{message.author}</strong>
        <time dateTime={message.createdAt} title={time.toLocaleString(locale)}>{time.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</time>
      </div>
      <p>{message.body}</p>
      {onThread && <Button variant="ghost" className="reply-link" onClick={() => onThread(message)}>
        <MessageSquare size={14} />{message.replies ? copy.replyCount(message.replies) : copy.reply}
      </Button>}
    </div>
  </article>
}

function mergeMessages(current: Message[], incoming: Message[]) {
  const unique = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) unique.set(message.id, message)
  return [...unique.values()].sort((left, right) => left.id - right.id)
}

function MessageList({ channel, thread, copy, locale, onThread }: {
  channel: Channel; thread?: Message; copy: Copy; locale: Locale; onThread?: (message: Message) => void
}) {
  const threadQuery = thread ? `thread=${thread.id}` : ''
  const endpoint = `/channels/${channel.id}/messages`
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
  const records = pages.reduce((all, page) => mergeMessages(all, page.messages), first?.messages ?? [])
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

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !draft.trim()) return
    setBusy(true)
    setSendError(undefined)
    try {
      await api(endpoint, { data: { body: draft, ...(thread ? { thread: thread.id } : {}) } })
      setDraft('')
      follow.current = true
      setAtBottom(true)
      setRefresh((current) => current + 1)
    } catch (error) {
      setSendError(error)
    } finally {
      setBusy(false)
      textarea.current?.focus()
    }
  }

  const placeholder = thread ? copy.replyMessage : copy.message(channel.name)
  let lastDay: string | undefined
  return <>
    <div className="message-scroll" ref={scroll} onScroll={(event) => {
      const list = event.currentTarget
      follow.current = list.scrollHeight - list.scrollTop - list.clientHeight < 48
      setAtBottom(follow.current)
    }}>
      {thread && <div className="thread-root"><MessageItem message={thread} copy={copy} locale={locale} /></div>}
      {hasMore && <div className="load-more"><Button variant="outline" onClick={loadOlder} loading={paging}>
        {copy.older}
      </Button></div>}
      {!first && loadError === undefined && <MessageSkeleton copy={copy} />}
      {first && !records.length && <p className="empty-messages">{thread ? copy.emptyThread : copy.emptyChannel}</p>}
      {records.map((message) => {
        const date = new Date(message.createdAt).toLocaleDateString(locale, { dateStyle: 'long' })
        const showDay = date !== lastDay
        lastDay = date
        return <div key={message.id}>
          {showDay && <div className="date-line"><span>{date}</span></div>}
          <MessageItem message={message} locale={locale} copy={copy} onThread={onThread} />
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
        <textarea ref={textarea} value={draft} rows={2} maxLength={4000} placeholder={placeholder} aria-label={placeholder}
          onChange={(event) => setDraft(event.target.value)} readOnly={busy}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }} />
        <Button type="submit" disabled={!draft.trim()} loading={busy} aria-label={copy.send}><Send size={17} /></Button>
      </div>
      {sendError !== undefined && <p role="alert" className="error">{errorText(copy, sendError)}</p>}
    </form>
  </>
}

export function Conversation({ channel, copy, locale }: { channel: Channel; copy: Copy; locale: Locale }) {
  const [thread, setThread] = useState<Message>()
  return <div className={thread ? 'conversation with-thread' : 'conversation'}>
    <section className="room" aria-label={copy.discussion}>
      <MessageList channel={channel} copy={copy} locale={locale} onThread={setThread} />
    </section>
    {thread && <section className="thread" aria-label={copy.thread}>
      <header><strong>{copy.thread}</strong><Button variant="ghost" aria-label={copy.close} onClick={() => setThread(undefined)}><X size={18} /></Button></header>
      <MessageList key={thread.id} channel={channel} thread={thread} copy={copy} locale={locale} />
    </section>}
  </div>
}
