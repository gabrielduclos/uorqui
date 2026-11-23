import { ChevronLeft, CirclePlus, Globe, Hash, Layers, LockKeyhole, LogOut, MessageSquare, Moon, Settings, Plus, Send, Sun, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ApiError, api, cachedQuery, errorText, type Channel, type DirectChannel, type Team, type User } from './api'
import { Button, Modal } from './components/ui/controls'
import { Skeleton, MessageSkeleton } from './components/ui/skeleton'
import { Conversation, initials } from './Conversation'
import { translations, type Copy, type Locale } from './copy'
import { DirectView, ProfileSettings, PublicProfileView, TeamSettings } from './workplace-views'
import { ActionForm, ChannelForm, InviteForm, SignIn, TeamForm } from './forms'

function TeamView({ team, user, copy, locale, preferredChannel }: { team?: Team; user?: User; copy: Copy; locale: Locale; preferredChannel?: string | null }) {
  const [channels, setChannels] = useState<Channel[] | undefined>(() => team ? cachedQuery<Channel[]>(`/teams/${team.id}/channels`) : undefined)
  const [selected, setSelected] = useState(preferredChannel)
  const [dialog, setDialog] = useState<'create' | 'invite' | 'guest' | 'manage'>()
  const [mobileOpen, setMobileOpen] = useState(!preferredChannel)
  const [error, setError] = useState<unknown>()
  const [refresh, setRefresh] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const channel = channels?.find((item) => item.id === selected) ?? channels?.[0]
  const owner = team?.role === 'owner'

  useEffect(() => {
    if (!team) return
    const controller = new AbortController()
    const teamId = team.id
    let timeout: number
    let loading = false
    async function load() {
      if (loading || controller.signal.aborted) return
      window.clearTimeout(timeout)
      if (document.hidden) return
      loading = true
      try {
        const result = await api<Channel[]>(`/teams/${teamId}/channels`, { signal: controller.signal })
        if (!controller.signal.aborted) {
          setChannels(result)
          setError(undefined)
        }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure)
      } finally {
        loading = false
        if (!controller.signal.aborted) setRetrying(false)
        if (!controller.signal.aborted) timeout = window.setTimeout(load, 60000)
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
  }, [team?.id, refresh])

  return <div className={mobileOpen ? 'workspace mobile-channels' : 'workspace'}>
    <aside className="sidebar" aria-label={copy.channels}>
      <div className="sidebar-heading">
        <div className="team-mark"><Layers size={18} /></div>
        <h2>{team ? team.name : <Skeleton className="skeleton-name" />}</h2>
        {owner && <Button variant="ghost" aria-label={copy.manageTeam} title={copy.manageTeam} onClick={() => setDialog('manage')}><Settings size={17} /></Button>}
        {owner && <Button variant="ghost" aria-label={copy.inviteTitle} title={copy.inviteTitle} onClick={() => setDialog('invite')}><UserPlus size={17} /></Button>}
      </div>
      {!channels && <div className="channel-placeholder" role="status" aria-label={copy.loading} aria-busy="true">
        <h3>{copy.channels}</h3>
        {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="skeleton-channel" />)}
      </div>}
      {(['team', 'private'] as const).map((visibility) => {
        const list = channels?.filter((item) => item.visibility === visibility) ?? []
        if (visibility === 'private' && !list.length) return null
        if (!channels || (visibility === 'team' && !team?.role)) return null
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
        <Button variant="ghost" loading={retrying} onClick={() => { setRetrying(true); setRefresh((current) => current + 1) }}>{copy.retry}</Button>
      </div>}
    </aside>
    <main className="content">
      <header className="channel-header">
        <Button variant="ghost" className="mobile-back" onClick={() => setMobileOpen(true)} aria-label={copy.back}><ChevronLeft size={20} /></Button>
        <div className="channel-symbol" title={channel?.visibility === 'private' ? copy.privateOnly : copy.teamOnly}>
          {channel?.visibility === 'private' ? <LockKeyhole size={20} /> : <Hash size={22} />}
        </div>
        <div className="channel-title">
          <h1>{channel ? channel.name : channels ? copy.chooseChannel : <Skeleton className="skeleton-title" />}</h1>
          {channel?.description && <p>{channel.description}</p>}
        </div>
        {owner && channel?.visibility === 'private' &&
          <Button variant="outline" onClick={() => setDialog('guest')}><UserPlus size={17} />{copy.invite}</Button>}
      </header>
      {channel ? <Conversation key={channel.id} channel={channel} user={user} copy={copy} locale={locale} />
        : !channels ? <div className="room">
          <div className="message-scroll"><MessageSkeleton copy={copy} /></div>
          <div className="composer"><div className="compose-box"><Skeleton className="skeleton-composer" /><Button disabled aria-label={copy.send}><Send size={17} /></Button></div></div>
        </div> : <div className="center-state"><p>{copy.chooseChannel}</p></div>}
    </main>
    {dialog === 'manage' && team && user && <TeamSettings team={team} user={user} copy={copy} close={() => setDialog(undefined)} />}
    {dialog === 'create' && team && <ChannelForm copy={copy} teamId={team.id} close={() => setDialog(undefined)} created={(created) => {
      setChannels((current) => [...(current ?? []).filter((item) => item.id !== created.id), created])
      setSelected(created.id)
      setMobileOpen(false)
      setDialog(undefined)
      setRefresh((current) => current + 1)
    }} />}
    {dialog === 'invite' && team && <InviteForm copy={copy} teamId={team.id} close={() => setDialog(undefined)} />}
    {dialog === 'guest' && team && channel && <InviteForm copy={copy} teamId={team.id} channel={channel} close={() => setDialog(undefined)} />}
  </div>
}

function Workspace({ user, copy, locale, token, clearInvite }: {
  user?: User; copy: Copy; locale: Locale; token: string | null; clearInvite: () => void
}) {
  const [teams, setTeams] = useState<Team[] | undefined>(() => user ? cachedQuery<Team[]>('/teams') : undefined)
  const [selection, setSelection] = useState<{ teamId: string; channelId?: string | null }>()
  const [creating, setCreating] = useState(false)
  const [direct, setDirect] = useState(false)
  const [requestedDirect, setRequestedDirect] = useState<DirectChannel>()
  const [error, setError] = useState<unknown>()
  const [attempt, setAttempt] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const team = teams?.find((item) => item.id === selection?.teamId) ?? teams?.[0]

  useEffect(() => {
    const controller = new AbortController()
    if (!user) return
    const load = () => {
      if (document.hidden) return
      api<Team[]>('/teams', { signal: controller.signal }).then((result) => {
        if (!controller.signal.aborted) { setTeams(result); setError(undefined) }
      }).catch((failure) => {
        if (!controller.signal.aborted) setError(failure)
      }).finally(() => { if (!controller.signal.aborted) setRetrying(false) })
    }
    document.addEventListener('visibilitychange', load)
    window.addEventListener('focus', load)
    window.addEventListener('cache-updated', load)
    load()
    return () => {
      controller.abort()
      document.removeEventListener('visibilitychange', load)
      window.removeEventListener('focus', load)
      window.removeEventListener('cache-updated', load)
    }
  }, [attempt, user?.id])

  useEffect(() => {
    const start = (event: Event) => {
      setRequestedDirect((event as CustomEvent<DirectChannel>).detail)
      setDirect(true)
    }
    window.addEventListener('open-direct', start)
    return () => window.removeEventListener('open-direct', start)
  }, [])

  return <>
    <div className="workspace-shell">
    <nav className="team-rail" aria-label={copy.teams}>
      <div className="team-list">
        <button className="team-button" aria-label={copy.direct} title={copy.direct} aria-current={direct ? 'true' : undefined}
          onClick={() => { setRequestedDirect(undefined); setDirect(true) }}><MessageSquare size={22} /></button>
        {!teams && error === undefined && <div role="status" aria-label={copy.loading} aria-busy="true">
          {[0, 1, 2].map((item) => <Skeleton key={item} className="skeleton-team" />)}
        </div>}
        {teams?.map((item) => <button
          key={item.id} className="team-button" title={item.name} aria-label={item.name}
          aria-current={!direct && team?.id === item.id ? 'true' : undefined}
          onClick={() => { setDirect(false); setSelection({ teamId: item.id }) }}>
          <span aria-hidden="true">{initials(item.name)}</span>
        </button>)}
        <button className="team-button team-add" title={copy.newTeam} aria-label={copy.newTeam}
          onClick={() => setCreating(true)}><Plus size={22} aria-hidden="true" /></button>
      </div>
    </nav>
    {direct && user ? <DirectView key={requestedDirect?.id ?? 'direct'} user={user} copy={copy} locale={locale} requested={requestedDirect} />
      : team || (teams === undefined && error === undefined) ? <TeamView key={`${team?.id ?? 'loading'}:${selection?.channelId ?? ''}`} team={team} user={user} copy={copy} locale={locale} preferredChannel={selection?.channelId} />
      : <main className="center-state">
        {error !== undefined ? <>
          <p className="error" role="alert">{errorText(copy, error)}</p>
          <Button variant="outline" loading={retrying} onClick={() => { setRetrying(true); setAttempt((current) => current + 1) }}>{copy.retry}</Button>
        </> : teams ? <>
          <div className="empty-icon"><Layers size={27} /></div>
          <h1>{copy.emptyTeams}</h1>
          <p>{copy.startTeam}</p>
          <Button onClick={() => setCreating(true)}><CirclePlus size={17} />{copy.newTeam}</Button>
        </> : <MessageSkeleton copy={copy} />}
      </main>}
    </div>
    {creating && <TeamForm copy={copy} close={() => setCreating(false)} created={(created) => {
      setTeams((current) => [...(current ?? []), created])
      setDirect(false)
      setSelection({ teamId: created.id })
      setCreating(false)
    }} />}
    {token && user && <Modal title={copy.gotInvite} closeLabel={copy.cancel} onClose={clearInvite}>
      <p className="muted">{copy.acceptHelp} <strong>{user.email}</strong></p>
      <ActionForm copy={copy} submit={copy.accept} onSubmit={async () => {
        const result = await api<{ teamId: string; channelId?: string | null }>('/invitations/accept', { data: { token } })
        const updated = await api<Team[]>('/teams')
        setTeams(updated)
        setDirect(false)
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
  const [profileHandle, setProfileHandle] = useState(() => new URLSearchParams(location.hash.slice(1)).get('profile'))
  const [person, setPerson] = useState<string>()
  const [editingProfile, setEditingProfile] = useState(false)
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
    const onHashChange = () => {
      setToken(invitationFromUrl())
      setProfileHandle(new URLSearchParams(location.hash.slice(1)).get('profile'))
    }
    const onPerson = (event: Event) => setPerson((event as CustomEvent<string>).detail)
    window.addEventListener('show-person', onPerson)
    window.addEventListener('session-expired', onExpiry)
    window.addEventListener('hashchange', onHashChange)
    loadSession(controller.signal).catch(setError)
    return () => {
      controller.abort()
      window.removeEventListener('session-expired', onExpiry)
      window.removeEventListener('hashchange', onHashChange)
      window.removeEventListener('show-person', onPerson)
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
        {user === undefined && <Skeleton className="skeleton-avatar" />}
        {user && <>
          <Button variant="ghost" aria-label={copy.myProfile} title={copy.myProfile} onClick={() => setEditingProfile(true)}><span className="avatar profile">{initials(user.name)}</span></Button>
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
      <Button variant="ghost" onClick={async () => {
        try { await loadSession(); setError(undefined) } catch (failure) { setError(failure) }
      }}>{copy.retry}</Button>
    </div>}
    {user === null ? <SignIn key={token ?? ''} copy={copy} token={token} onSuccess={() => loadSession()} />
      : <Workspace key={user?.id ?? 'session-loading'} user={user} copy={copy} locale={locale} token={token} clearInvite={clearInvite} />}
    {editingProfile && user && <ProfileSettings key={`profile-settings-${user.id}`} copy={copy} user={user} close={() => setEditingProfile(false)} saved={() => loadSession()} />}
    {(profileHandle || (person && user)) && <PublicProfileView key={`public-profile-${profileHandle ?? person}`} handle={profileHandle ?? undefined}
      userId={person} copy={copy} user={user} close={() => {
        setPerson(undefined)
        if (profileHandle) {
          const parameters = new URLSearchParams(location.hash.slice(1))
          parameters.delete('profile')
          history.replaceState(null, '', location.pathname + location.search + (parameters.size ? '#' + parameters : ''))
          setProfileHandle(null)
        }
      }} />}
  </div>
}
