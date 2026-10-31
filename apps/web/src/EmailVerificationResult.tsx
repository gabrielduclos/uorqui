import { CheckCircle2, CircleAlert, MailCheck, ArrowLeft } from 'lucide-react';
import { PreferencesControls } from './PreferencesControls';
import { useUorquiPreferences } from './UorquiPreferences';

type Result = 'success' | 'expired' | 'invalid' | 'error' | 'unknown';

function getResult(): Result {
  const query = new URLSearchParams(window.location.search);
  const error = query.get('error')?.toLowerCase();
  if (error) {
    if (error === 'token_expired') return 'expired';
    if (error === 'invalid_token') return 'invalid';
    return 'error';
  }
  return query.get('result') === 'success' ? 'success' : 'unknown';
}

/** Dedicated result page after Better Auth has processed a verification link.
 * It never receives a verification token or exposes a user's email address.
 */
export default function EmailVerificationResult() {
  const { locale } = useUorquiPreferences();
  const pt = locale === 'pt-BR';
  const result = getResult();
  const success = result === 'success';
  const title = success
    ? (pt ? 'E-mail confirmado!' : 'Email verified!')
    : result === 'expired'
      ? (pt ? 'Link expirado' : 'Link expired')
      : result === 'invalid'
        ? (pt ? 'Link inválido' : 'Invalid link')
        : (pt ? 'Confirmação não concluída' : 'Verification incomplete');
  const description = success
    ? (pt ? 'Seu endereço de e-mail foi confirmado. Agora você pode entrar no Uorqui com sua conta.'
      : 'Your email address was verified. You can now sign in to Uorqui.')
    : result === 'expired'
      ? (pt ? 'O prazo de confirmação terminou. Solicite um novo link de confirmação na tela de acesso.'
        : 'This verification link has expired. Request a new link from the sign-in screen.')
      : result === 'invalid'
        ? (pt ? 'Não foi possível validar este link. Ele pode estar incorreto ou já ter sido utilizado. Se ainda não confirmou o e-mail, solicite outro.'
          : 'This verification link is invalid or may have been used already. If you have not verified your email, request another link.')
        : (pt ? 'Não foi possível confirmar seu e-mail por este endereço. Abra o link recebido por e-mail ou solicite um novo.'
          : 'Your email could not be verified from this address. Open your email link or request another one.');

  return <main className="flex min-h-[100dvh] flex-col bg-background text-foreground">
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <a href="/" className="text-2xl font-bold tracking-tight" aria-label="Uorqui">uorqui<span className="text-primary">.</span></a>
        <PreferencesControls/>
      </div>
    </header>
    <div className="flex flex-1 items-center justify-center px-5 py-10">
      <section aria-live="polite" className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
          {success ? <MailCheck className="size-8" aria-hidden="true"/> : <CircleAlert className="size-8" aria-hidden="true"/>}
        </div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="mt-7 flex flex-col gap-3">
          <a href={success ? '/?login=1' : '/?verify=1'}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90">
            {success ? <CheckCircle2 className="size-4" aria-hidden="true"/> : <MailCheck className="size-4" aria-hidden="true"/>}
            {success ? (pt ? 'Entrar na minha conta' : 'Sign in to my account') : (pt ? 'Solicitar novo link' : 'Request another link')}
          </a>
          <a href="/" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm hover:bg-accent">
            <ArrowLeft className="size-4" aria-hidden="true"/>
            {pt ? 'Voltar ao Uorqui' : 'Back to Uorqui'}
          </a>
        </div>
      </section>
    </div>
  </main>;
}
