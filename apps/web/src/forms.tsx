import { Check, Copy as CopyIcon, Eye, EyeOff } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { ApiError, api, errorText, type Channel, type Team } from './api'
import { Button, Modal } from './components/ui/controls'
import type { Copy } from './copy'

export function ActionForm({ copy, submit, children, onSubmit }: {
  copy: Copy; submit: string; children?: ReactNode; onSubmit: (data: FormData) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      await onSubmit(new FormData(event.currentTarget))
    } catch (failure) {
      setError(failure)
    } finally {
      setBusy(false)
    }
  }
  return <form className="fields" onSubmit={handleSubmit} aria-busy={busy}
    onInvalid={(event) => {
      if (event.target instanceof HTMLInputElement) event.target.setCustomValidity(copy.errors.INVALID_INPUT)
    }}
    onInput={(event) => {
      if (event.target instanceof HTMLInputElement) event.target.setCustomValidity('')
    }}>
    {children}
    {error !== undefined && <p role="alert" className="error">{errorText(copy, error)}</p>}
    <Button type="submit" disabled={busy}>{busy ? copy.loading : submit}</Button>
  </form>
}

export function SignIn({ copy, token, onSuccess }: { copy: Copy; token: string | null; onSuccess: () => Promise<void> }) {
  const [registering, setRegistering] = useState(false)
  const [visible, setVisible] = useState(false)
  return <main className="sign-in">
    <section className="sign-in-card">
      <h1>{registering ? copy.signUp : copy.authTitle}</h1>
      <p>{token ? copy.inviteAuth : copy.authHelp}</p>
      <ActionForm key={String(registering)} copy={copy} submit={registering ? copy.signUp : copy.signIn} onSubmit={async (data) => {
        await api(registering ? '/auth/sign-up/email' : '/auth/sign-in/email', {
          data: { ...Object.fromEntries(data), ...(registering ? { token } : {}) },
        })
        await onSuccess()
      }}>
        {registering && <label>{copy.name}<input name="name" autoComplete="name" required maxLength={80} /></label>}
        <label>{copy.email}<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
        <div>
          <label htmlFor="password">{copy.password}</label>
          <div className="password">
            <input id="password" name="password" type={visible ? 'text' : 'password'} required
              minLength={registering ? 8 : undefined} maxLength={128}
              aria-describedby={registering ? 'password-hint' : undefined}
              autoComplete={registering ? 'new-password' : 'current-password'} />
            <Button variant="ghost" aria-label={visible ? copy.hidePassword : copy.showPassword} onClick={() => setVisible(!visible)}>
              {visible ? <EyeOff size={17} /> : <Eye size={17} />}
            </Button>
          </div>
          {registering && <small id="password-hint">{copy.passwordHint}</small>}
        </div>
      </ActionForm>
      {token && <Button variant="ghost" onClick={() => { setRegistering(!registering); setVisible(false) }}>
        {registering ? copy.existing : copy.makeAccount}
      </Button>}
    </section>
  </main>
}

export function TeamForm({ copy, close, created }: { copy: Copy; close: () => void; created: (team: Team) => void }) {
  return <Modal title={copy.newTeam} closeLabel={copy.close} onClose={close}>
    <ActionForm copy={copy} submit={copy.create} onSubmit={async (data) => {
      created(await api<Team>('/teams', { data: Object.fromEntries(data) }))
    }}>
      <label>{copy.teamName}<input name="name" required minLength={2} maxLength={80} /></label>
    </ActionForm>
  </Modal>
}

export function ChannelForm({ copy, teamId, close, created }: {
  copy: Copy; teamId: string; close: () => void; created: (channel: Channel) => void
}) {
  return <Modal title={copy.newChannel} closeLabel={copy.close} onClose={close}>
    <ActionForm copy={copy} submit={copy.create} onSubmit={async (data) => {
      created(await api<Channel>(`/teams/${teamId}/channels`, { data: Object.fromEntries(data) }))
    }}>
      <label>{copy.channelName}
        <input name="name" autoCapitalize="none" spellCheck={false} aria-describedby="channel-name-hint"
          required pattern="[a-zA-Z0-9][a-zA-Z0-9\-]{1,39}" maxLength={40} />
        <small id="channel-name-hint">{copy.nameHint}</small>
      </label>
      <label>{copy.details}<input name="description" maxLength={180} /></label>
      <label>{copy.visibility}
        <select name="visibility"><option value="team">{copy.teamOnly}</option><option value="private">{copy.privateOnly}</option></select>
      </label>
    </ActionForm>
  </Modal>
}

export function InviteForm({ copy, teamId, channel, close }: { copy: Copy; teamId: string; channel?: Channel; close: () => void }) {
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<unknown>()
  return <Modal title={channel ? copy.invitePrivate : copy.inviteTitle} closeLabel={copy.close} onClose={close}>
    <p className="muted">{channel ? copy.inviteGuestHelp : copy.inviteHelp}</p>
    {url ? <div className="fields">
      <input aria-label={copy.copy} value={url} readOnly onFocus={(event) => event.target.select()} />
      <Button onClick={async () => {
        try {
          await navigator.clipboard.writeText(url)
          setCopied(true)
          setError(undefined)
        } catch {
          setError(new ApiError('COPY_FAILED'))
        }
      }}>{copied ? <Check size={16} /> : <CopyIcon size={16} />}{copied ? copy.copied : copy.copy}</Button>
      {error !== undefined && <p role="alert" className="error">{errorText(copy, error)}</p>}
    </div> : <ActionForm copy={copy} submit={copy.generate} onSubmit={async (data) => {
      const result = await api<{ url: string }>(`/teams/${teamId}/invitations`, {
        data: { email: data.get('email'), ...(channel ? { channelId: channel.id } : {}) },
      })
      setUrl(result.url)
    }}>
      <label>{copy.email}<input name="email" type="email" required maxLength={254} /></label>
    </ActionForm>}
  </Modal>
}
