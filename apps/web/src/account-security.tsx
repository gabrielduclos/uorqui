import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { ApiError, api, type User } from './api'
import { Button } from './components/ui/controls'
import type { Copy } from './copy'
import { ActionForm } from './forms'

function PasswordField({ copy, name, label, current = false }: { copy: Copy; name: string; label: string; current?: boolean }) {
  const [visible, setVisible] = useState(false)
  return <div>
    <label htmlFor={name}>{label}</label>
    <div className="password">
      <input id={name} name={name} type={visible ? 'text' : 'password'} autoComplete={current ? 'current-password' : 'new-password'}
        required minLength={current ? 1 : 8} maxLength={128} />
      <Button variant="ghost" aria-label={`${visible ? copy.hidePassword : copy.showPassword}: ${label}`} onClick={() => setVisible(!visible)}>
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </Button>
    </div>
  </div>
}

export function AccountSecurity({ copy, user, saved }: { copy: Copy; user: User; saved: () => Promise<void> }) {
  const [sent, setSent] = useState(false)
  const [changed, setChanged] = useState(false)
  const [generation, setGeneration] = useState(0)
  return <section className="account-security">
    <h3 className="section-label">{copy.security}</h3>
    <p>{user.email}</p>
    <p role="status">{user.emailVerified ? copy.emailConfirmed : copy.emailPending}</p>
    {!user.emailVerified && <ActionForm copy={copy} submit={copy.resendVerification} onSubmit={async () => {
      setSent(false)
      await api('/account/verification', { data: {} })
      setSent(true)
      await saved()
    }}>{sent && <p role="status">{copy.verificationSent}</p>}</ActionForm>}
    <ActionForm key={generation} copy={copy} submit={copy.changePassword} onSubmit={async (data) => {
      setChanged(false)
      if (data.get('newPassword') !== data.get('repeatPassword')) throw new ApiError('PASSWORD_MISMATCH')
      await api('/account/password', { data: { currentPassword: data.get('currentPassword'), newPassword: data.get('newPassword') } })
      await saved()
      setChanged(true)
      setGeneration((value) => value + 1)
    }}>
      <PasswordField copy={copy} name="currentPassword" label={copy.currentPassword} current />
      <PasswordField copy={copy} name="newPassword" label={copy.newPassword} />
      <small>{copy.passwordHint}</small>
      <PasswordField copy={copy} name="repeatPassword" label={copy.repeatPassword} />
    </ActionForm>
    {changed && <p role="status">{copy.passwordChanged}</p>}
  </section>
}
