import { ChevronLeft, MessageSquare, Plus, Trash2, UserRound } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { SettingsTabs } from './components/ui/settings-tabs'
import { api, errorText, type DirectChannel, type Member, type PublicProfile, type Team, type User } from './api'
import { Button, Modal } from './components/ui/controls'
import { Skeleton } from './components/ui/skeleton'
import { Avatar, PhotoSettings } from './Avatar'
import { Conversation } from './Conversation'
import type { Copy, Locale } from './copy'
import { ActionForm } from './forms'
import { useResource } from './use-resource'
import { UnreadBadge, useUnread } from './unread'
import { AccountSecurity } from './account-security'

export function showPerson(userId: string) {
  window.dispatchEvent(new CustomEvent('show-person', { detail: userId }))
}

export function openDirect(channel: DirectChannel) {
  window.dispatchEvent(new CustomEvent('open-direct', { detail: channel }))
}

function ResourceFeedback({ copy, resource }: { copy: Copy; resource: ReturnType<typeof useResource> }) {
  return resource.error !== undefined ? <div className="notice error">
    <span role="alert">{errorText(copy, resource.error)}</span>
    <Button variant="ghost" loading={resource.retrying} onClick={resource.retry}>{copy.retry}</Button>
  </div> : resource.data === undefined ? <div role="status" aria-label={copy.loading} aria-busy="true" className="fields">
    <Skeleton className="skeleton-channel" /><Skeleton className="skeleton-channel" />
  </div> : null
}

export function TeamSettings({ team, user, copy, close }: { team: Team; user: User; copy: Copy; close: () => void }) {
  const resource = useResource<Member[]>(`/teams/${team.id}/members`)
  const [removing, setRemoving] = useState<Member>()
  const [deleting, setDeleting] = useState(false)
  return <Modal title={copy.manageTeam} closeLabel={copy.close} onClose={close}>
    <SettingsTabs label={copy.manageTeam} tabs={[{ id: 'general', label: copy.general, content: <><PhotoSettings name={team.name} src={team.image} teamId={team.id} copy={copy} saved={async () => { resource.retry() }} /><ActionForm copy={copy} submit={copy.save} onSubmit={async (data) => {
      await api(`/teams/${team.id}/update`, { data: { name: data.get('name') } })
    }}><label>{copy.teamName}<input name="name" defaultValue={team.name} required minLength={2} maxLength={80} /></label></ActionForm></> },
    { id: 'members', label: copy.members, content: <>
    {removing ? <>
      <p>{removing.name}</p><p className="muted">{copy.removeHelp}</p>
      <ActionForm copy={copy} submit={copy.removeMember} onSubmit={async () => {
        await api(`/teams/${team.id}/remove-member`, { data: { userId: removing.id } })
        setRemoving(undefined)
      }} />
      <Button variant="ghost" onClick={() => setRemoving(undefined)}>{copy.cancel}</Button>
    </> : <>
      <ResourceFeedback copy={copy} resource={resource} />
      <div className="member-list">
        {resource.data?.map((member) => <div className="member-row" key={member.id}>
          <Button variant="ghost" className="member-person" onClick={() => showPerson(member.id)}><Avatar name={member.name} src={member.image} />{member.name}</Button>
          <small>{copy[member.role]}</small>
          {member.id !== user.id && <Button variant="ghost" aria-label={`${copy.removeMember} ${member.name}`} onClick={() => setRemoving(member)}><Trash2 size={15} /></Button>}
        </div>)}
      </div>
    </>}
    </> }, { id: 'advanced', label: copy.advanced, content: <>
    {deleting ? <>
      <p className="muted">{copy.deleteHelp}</p>
      <ActionForm copy={copy} submit={copy.deleteTeam} onSubmit={async (data) => {
        await api(`/teams/${team.id}/delete`, { data: { name: data.get('name') } })
        close()
      }}>
        <label>{copy.confirmTeamName}<input name="name" placeholder={team.name} required autoComplete="off" /></label>
      </ActionForm>
      <Button variant="ghost" onClick={() => setDeleting(false)}>{copy.cancel}</Button>
    </> : <Button variant="outline" onClick={() => setDeleting(true)}><Trash2 size={16} />{copy.deleteTeam}</Button>}
    </> }]} />
  </Modal>
}

export function ProfileSettings({ copy, user, close, saved, appearance, initial }: { copy: Copy; user: User; close: () => void; saved: () => Promise<void>; appearance: ReactNode; initial?: string }) {
  const resource = useResource<PublicProfile>('/profile')
  const [success, setSuccess] = useState(false)
  return <Modal title={copy.settings} closeLabel={copy.close} onClose={close}>
    <SettingsTabs label={copy.settings} initial={initial} tabs={[{ id: 'profile', label: copy.myProfile, content: <>
    <PhotoSettings name={user.name} src={user.image} copy={copy} saved={saved} />
    <ResourceFeedback copy={copy} resource={resource} />
    {resource.data && <ActionForm copy={copy} submit={copy.save} onSubmit={async (data) => {
      setSuccess(false)
      await api('/profile', { data: Object.fromEntries(data) })
      await saved()
      setSuccess(true)
    }}>
      <p className="muted">{copy.publicHint}</p>
      <label>{copy.name}<input name="name" defaultValue={resource.data.name ?? user.name} required maxLength={80} /></label>
      <label>{copy.handle}<input aria-label={copy.handle} aria-describedby="profile-handle-hint" name="handle" defaultValue={resource.data.handle ?? ''} required pattern="[a-z0-9_]{3,24}" minLength={3} maxLength={24} autoCapitalize="none" spellCheck={false} /><small id="profile-handle-hint">{copy.handleHint}</small></label>
      <label>{copy.bio}<textarea name="bio" rows={3} maxLength={500} defaultValue={resource.data.bio ?? ''} /></label>
      {success && <p role="status">{copy.profileSaved}</p>}
    </ActionForm>}
    {resource.data?.handle && <a className="profile-link" href={`#profile=${encodeURIComponent(resource.data.handle)}`} onClick={close}>{copy.viewPublic}</a>}
    </> }, { id: 'security', label: copy.security, content: <AccountSecurity user={user} copy={copy} saved={saved} /> },
    { id: 'appearance', label: copy.appearance, content: appearance }]} />
  </Modal>
}

export function PublicProfileView({ handle, userId, copy, user, close }: {
  handle?: string; userId?: string; copy: Copy; user?: User | null; close: () => void
}) {
  const resource = useResource<PublicProfile>(handle ? `/profiles/${encodeURIComponent(handle)}` : `/people/${encodeURIComponent(userId ?? '')}`)
  const profile = resource.data
  const [actionError, setActionError] = useState<unknown>()
  return <Modal title={copy.publicProfile} closeLabel={copy.close} onClose={close}>
    <ResourceFeedback copy={copy} resource={resource} />
    {profile && <div className="profile-details">
      <Avatar name={profile.name} src={profile.image} />
      <h2>{profile.name}</h2>
      <p className="muted">{profile.handle ? `@${profile.handle}` : copy.unpublishedProfile}</p>
      {actionError !== undefined && <p className="error" role="alert">{errorText(copy, actionError)}</p>}
      {profile.bio && <p className="profile-bio">{profile.bio}</p>}
      {profile.handle && <label className="fields">{copy.profileLink}<input readOnly value={`${location.origin}/#profile=${encodeURIComponent(profile.handle)}`} onFocus={(event) => event.target.select()} /></label>}
      {user && user.id !== profile.id && <Button onClick={async () => {
        setActionError(undefined)
        try {
          const channel = await api<DirectChannel>('/direct', { data: { userId: profile.id } })
          openDirect(channel)
          close()
        } catch (failure) { setActionError(failure) }
      }}><MessageSquare size={16} />{copy.messagePerson}</Button>}
    </div>}
  </Modal>
}

export function DirectView({ copy, locale, user, requested }: { copy: Copy; locale: Locale; user: User; requested?: DirectChannel }) {
  const unread = useUnread()
  const resource = useResource<DirectChannel[]>('/direct')
  const [selected, setSelected] = useState<DirectChannel | undefined>(requested)
  const [creating, setCreating] = useState(false)
  const [listOpen, setListOpen] = useState(!requested)
  const channel = resource.data?.find((item) => item.id === selected?.id) ?? selected ?? resource.data?.[0]
  return <div className={listOpen ? 'workspace mobile-channels' : 'workspace'}>
    <aside className="sidebar" aria-label={copy.direct}>
      <div className="group-heading"><h2>{copy.direct}</h2><Button variant="ghost" aria-label={copy.newDirect} onClick={() => setCreating(true)}><Plus size={18} /></Button></div>
      <ResourceFeedback copy={copy} resource={resource} />
      {resource.data?.map((item) => <button key={item.id} className="channel-link" aria-current={channel?.id === item.id ? 'true' : undefined}
        onClick={() => { setSelected(item); setListOpen(false) }}><Avatar name={item.name} src={item.image} /><span>{item.name}</span><UnreadBadge copy={copy} count={unread.find((entry) => entry.channelId === item.id)?.count ?? 0} /></button>)}
      {resource.data?.length === 0 && <p className="muted">{copy.emptyDirect}</p>}
    </aside>
    <main className="content">
      <header className="channel-header">
        <Button variant="ghost" className="mobile-back" aria-label={copy.back} onClick={() => setListOpen(true)}><ChevronLeft size={20} /></Button>
        {channel ? <Button variant="ghost" onClick={() => showPerson(channel.peerId)}><UserRound size={18} /><h1>{channel.name}</h1></Button> : <h1>{copy.direct}</h1>}
      </header>
      {channel ? <Conversation key={channel.id} channel={channel} user={user} copy={copy} locale={locale} /> : <div className="center-state"><Button onClick={() => setCreating(true)}><Plus size={16} />{copy.newDirect}</Button></div>}
    </main>
    {creating && <Modal title={copy.newDirect} closeLabel={copy.close} onClose={() => setCreating(false)}>
      <ActionForm copy={copy} submit={copy.messagePerson} onSubmit={async (data) => {
        const result = await api<DirectChannel>('/direct', { data: { handle: data.get('handle') } })
        setSelected(result); setListOpen(false); setCreating(false)
      }}>
        <p className="muted">{copy.directHint}</p>
        <label>{copy.handle}<input name="handle" required minLength={3} maxLength={24} autoCapitalize="none" /></label>
      </ActionForm>
    </Modal>}
  </div>
}
