import { ChevronLeft, CirclePlus, Globe, Hash, Layers, LockKeyhole, LogOut, Menu, Moon, Plus, Sun, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ApiError, api, errorText, type Channel, type Team, type User } from './api'
import { Button, Modal } from './components/ui/controls'
import { Conversation, initials } from './Conversation'
import { translations, type Copy, type Locale } from './copy'
import { ActionForm, ChannelForm, InviteForm, SignIn, TeamForm } from './forms'

function TeamView({ team, copy, locale, preferredChannel }: { team: Team; copy: Copy; locale: Locale; preferredChannel?: string | null }) {
  const [channels, setChannels] = useState<Channel[]>()
  const [selected, setSelected] = useState(preferredChannel)
  const [dialog, setDialog] = useState<'create' | 'invite' | 'guest'>()
  const [mobileOpen, setMobileOpen] = useState(!preferredChannel)
  const [error, setError] = useState<unknown>()
  const [refresh, setRefresh] = useState(0)
  const channel = channels?.find((item) => item.id === selected) ?? channels?.[0]
  const owner = team.role === 'owner'

  useEffect(() => {
    const controller = new AbortController()
    let timeout: number
    async function load() {
      try {
        const result = await api<Channel[]>(`/teams/${team.id}/channels`, { signal: controller.signal })
        if (!controller.signal.aborted) {
          setChannels(result)
          setError(undefined)
        }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure)
      } finally {
        if (!controller.signal.aborted) timeout = window.setTimeout(load, 12000)
      }
    }
    void load()
    return () => { controller.abort(); window.clearTimeout(timeout) }
  }, [team.id, refresh])

  return <div className={mobileOpen ? 'workspace mobile-channels' : 'workspace'}>
    <aside className="sidebar" aria-label={copy.channels}>
      <div className="sidebar-heading">
        <div className="team-mark"><Layers size={18} /></div>
        <h2>{team.name}</h2>
        {owner && <Button variant="ghost" aria-label={copy.inviteTitle} title={copy.inviteTitle} onClick={() => setDialog('invite')}><UserPlus size={17} /></Button>}
      </div>
      {(['team', 'private'] as const).map((visibility) => {
        const list = channels?.filter((item) => item.visibility === visibility) ?? []
        if (visibility === 'private' && !list.length) return null
        if (visibility === 'team' && !team.role) return null
        return <section className="channel-group" key={visibility}>
          <div className="group-heading">
            <h3>{visibility === 'team' ? copy.channels : copy.privateChannels}</h3>
            {owner && visibility === 'team' && <Button variant="ghost" aria-label={copy.newChannel} title={copy.newChannel} onClick={() => setDialog('create')}><Plus size={16} /></Button>}
          </div>
          {list.map((item) => {
            const Icon = item.visibility === 'private' ? LockKeyhole : Hash
            return <button key={item.id} className="channel-link" aria-current={channel?.id === item.id ? 'true' : undefined}
              onClick={() => { setSelected(item.id); setMobileOpen(false) }}>
              <Icon size={17} aria-hidden="true" /><span>{item.name}</span>
            </button>
          })}
        </section>
      })}
      {error !== undefined && <div className="sidebar-notice">
        <p className="error" role="alert">{errorText(copy, error)}</p>
        <Button variant="ghost" onClick={() => setRefresh((current) => current + 1)}>{copy.retry}</Button>
      </div>}
    </aside>
    <main className="content">
      {channel ? <>
        <header className="channel-header">
          <Button variant="ghost" className="mobile-back" onClick={() => setMobileOpen(true)} aria-label={copy.back}><ChevronLeft size={20} /></Button>
          <div className="channel-symbol" title={channel.visibility === 'private' ? copy.privateOnly : copy.teamOnly}>
            {channel.visibility === 'private' ? <LockKeyhole size={20} /> : <Hash size={22} />}
          </div>
          <div className="channel-title">
            <h1>{channel.name}</h1>
            {channel.description && <p>{channel.description}</p>}
          </div>
          {owner && channel.visibility === 'private' &&
            <Button variant="outline" onClick={() => setDialog('guest')}><UserPlus size={17} />{copy.invite}</Button>}
        </header>
        <Conversation key={channel.id} channel={channel} copy={copy} locale={locale} />
      </> : <div className="center-state">
        <Button variant="ghost" className="mobile-back" onClick={() => setMobileOpen(true)}><Menu size={16} />{copy.channels}</Button>
        <p role="status">{channels ? copy.chooseChannel : copy.loading}</p>
      </div>}
    </main>
    {dialog === 'create' && <ChannelForm copy={copy} teamId={team.id} close={() => setDialog(undefined)} created={(created) => {
      setChannels((current) => [...(current ?? []).filter((item) => item.id !== created.id), created])
      setSelected(created.id)
      setMobileOpen(false)
      setDialog(undefined)
      setRefresh((current) => current + 1)
    }} />}
    {dialog === 'invite' && <InviteForm copy={copy} teamId={team.id} close={() => setDialog(undefined)} />}
    {dialog === 'guest' && channel && <InviteForm copy={copy} teamId={team.id} channel={channel} close={() => setDialog(undefined)} />}
  </div>
}

function Workspace({ user, copy, locale, token, clearInvite }: {
  user: User; copy: Copy; locale: Locale; token: string | null; clearInvite: () => void
}) {
  const [teams, setTeams] = useState<Team[]>()
  const [selection, setSelection] = useState<{ teamId: string; channelId?: string | null }>()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<unknown>()
  const [attempt, setAttempt] = useState(0)
  const team = teams?.find((item) => item.id === selection?.teamId) ?? teams?.[0]

  useEffect(() => {
    const controller = new AbortController()
    api<Team[]>('/teams', { signal: controller.signal }).then(setTeams).catch((failure) => {
      if (!controller.signal.aborted) setError(failure)
    })
    return () => controller.abort()
  }, [attempt])

  return <>
    <div className="workspace-shell">
    <nav className="team-rail" aria-label={copy.teams}>
      <div className="team-list">
        {teams?.map((item) => <button
          key={item.id} className="team-button" title={item.name} aria-label={item.name}
          aria-current={team?.id === item.id ? 'true' : undefined}
          onClick={() => setSelection({ teamId: item.id })}>
          <span aria-hidden="true">{initials(item.name)}</span>
        </button>)}
        <button className="team-button team-add" title={copy.newTeam} aria-label={copy.newTeam}
          onClick={() => setCreating(true)}><Plus size={22} aria-hidden="true" /></button>
      </div>
    </nav>
    {team ? <TeamView key={`${team.id}:${selection?.channelId ?? ''}`} team={team} copy={copy} locale={locale} preferredChannel={selection?.channelId} />
      : <main className="center-state">
        {error !== undefined ? <>
          <p className="error" role="alert">{errorText(copy, error)}</p>
          <Button variant="outline" onClick={() => { setError(undefined); setAttempt((current) => current + 1) }}>{copy.retry}</Button>
        </> : teams ? <>
          <div className="empty-icon"><Layers size={27} /></div>
          <h1>{copy.emptyTeams}</h1>
          <p>{copy.startTeam}</p>
          <Button onClick={() => setCreating(true)}><CirclePlus size={17} />{copy.newTeam}</Button>
        </> : <p role="status">{copy.loading}</p>}
      </main>}
    </div>
    {creating && <TeamForm copy={copy} close={() => setCreating(false)} created={(created) => {
      setTeams((current) => [...(current ?? []), created])
      setSelection({ teamId: created.id })
      setCreating(false)
    }} />}
    {token && <Modal title={copy.gotInvite} closeLabel={copy.cancel} onClose={clearInvite}>
      <p className="muted">{copy.acceptHelp} <strong>{user.email}</strong></p>
      <ActionForm copy={copy} submit={copy.accept} onSubmit={async () => {
        const result = await api<{ teamId: string; channelId?: string | null }>('/invitations/accept', { data: { token } })
        const updated = await api<Team[]>('/teams')
        setTeams(updated)
        setSelection(result)
        clearInvite()
      }} />
    </Modal>}
  </>
}

const invitationFromUrl = () => new URLSearchParams(location.hash.slice(1)).get('invite')

export function App() {
  const [locale, setLocale] = useState<Locale>(() => localStorage.getItem('uorqui-workplace-locale') === 'en' ? 'en' : 'pt-BR')
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('uorqui-workplace-theme')
    return saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [user, setUser] = useState<User | null>()
  const [error, setError] = useState<unknown>()
  const [token, setToken] = useState(invitationFromUrl)
  const copy = translations[locale]

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('uorqui-workplace-locale', locale)
    localStorage.setItem('uorqui-workplace-theme', dark ? 'dark' : 'light')
  }, [dark, locale])

  async function loadSession(signal?: AbortSignal) {
    try {
      setUser(await api<User>('/session', { signal }))
    } catch (failure) {
      if (signal?.aborted) return
      if (failure instanceof ApiError && failure.code === 'SIGN_IN_REQUIRED') setUser(null)
      else throw failure
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    const onExpiry = () => setUser(null)
    const onHashChange = () => setToken(invitationFromUrl())
    window.addEventListener('session-expired', onExpiry)
    window.addEventListener('hashchange', onHashChange)
    loadSession(controller.signal).catch(setError)
    return () => {
      controller.abort()
      window.removeEventListener('session-expired', onExpiry)
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [])

  function clearInvite() {
    history.replaceState(null, '', location.pathname + location.search)
    setToken(null)
  }

  return <div className="app">
    <header className="topbar">
      <div className="brand"><div className="brand-mark" aria-hidden="true"><Layers size={18} /></div><strong>Uorqui</strong>
        <span>{copy.product}</span>
      </div>
      <div className="top-actions">
        <label className="language" title={copy.language}>
          <Globe size={16} aria-hidden="true" />
          <select aria-label={copy.language} value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
            <option value="pt-BR">PT</option><option value="en">EN</option>
          </select>
        </label>
        <Button variant="ghost" aria-label={dark ? copy.themeLight : copy.themeDark} title={dark ? copy.themeLight : copy.themeDark}
          onClick={() => setDark(!dark)}>{dark ? <Sun size={18} /> : <Moon size={17} />}</Button>
        {user && <>
          <span className="avatar profile" title={user.name}>{initials(user.name)}</span>
          <Button variant="ghost" aria-label={copy.signOut} title={copy.signOut} onClick={async () => {
            try {
              await api('/auth/sign-out', { data: {} })
              setError(undefined)
              setUser(null)
            } catch (failure) { setError(failure) }
          }}><LogOut size={17} /></Button>
        </>}
      </div>
    </header>
    {error !== undefined && <div className="notice error">
      <span role="alert">{errorText(copy, error)}</span>
      <Button variant="ghost" onClick={() => { setError(undefined); loadSession().catch(setError) }}>{copy.retry}</Button>
    </div>}
    {user === undefined ? <main className="center-state">{error === undefined && <p role="status">{copy.loading}</p>}</main>
      : user ? <Workspace key={user.id} user={user} copy={copy} locale={locale} token={token} clearInvite={clearInvite} />
        : <SignIn key={token ?? ''} copy={copy} token={token} onSuccess={() => loadSession()} />}
  </div>
}
