import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

type AuthView = 'welcome' | 'login' | 'register' | 'forgot' | 'verify' | 'reset';
type ApiStatus = {
  registrationAvailable?: boolean;
  developmentRegistrationEnabled?: boolean;
  publicRegistration?: boolean;
  emailVerificationRequired?: boolean;
  passwordRecoveryAvailable?: boolean;
  turnstileSiteKey?: string | null;
};
export type Account = {
  user: { id: string; email: string; name: string };
  profile: { handle: string; displayName: string; bio: string | null } | null;
};

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

async function requestJson(path: string, options?: RequestInit) {
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const body: unknown = await response.json().catch(() => ({}));
  return { response, body };
}

function readableError(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null) {
    for (const key of ['message', 'error']) {
      const candidate = (body as Record<string, unknown>)[key];
      if (typeof candidate === 'string' && candidate.length < 300) return candidate;
    }
  }
  return fallback;
}

function Spinner() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4 animate-spin motion-reduce:animate-none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export default function AuthPanel({ onAuthenticated }: { onAuthenticated?: (account: Account) => void }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [view, setView] = useState<AuthView>(() => new URLSearchParams(window.location.search).has('token') ? 'reset' : 'welcome');
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get('token'));
  const [status, setStatus] = useState<ApiStatus>({});
  const [apiReady, setApiReady] = useState(false);
  const [apiChecked, setApiChecked] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const captchaRef = useRef<HTMLDivElement | null>(null);
  const captchaWidgetId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const canRegister = apiReady && status.registrationAvailable === true;
  const requiresVerification = status.emailVerificationRequired === true;
  const siteKey = status.turnstileSiteKey ?? null;

  const navigate = (next: AuthView) => {
    setView(next);
    setMessage('');
    setCaptchaToken('');
  };

  const refresh = useCallback(async () => {
    try {
      const { response, body } = await requestJson('/api/v1/me');
      if (response.ok) {
        const data = body as Account;
        setAccount(data);
        setDisplayName(data.user.name);
        setMessage('');
        if (data.profile) onAuthenticated?.(data);
      } else setAccount(null);
    } catch {
      setAccount(null);
      setMessage('Não foi possível acessar a API. Tente novamente mais tarde.');
    } finally {
      setLoading(false);
    }
  }, [onAuthenticated]);

  const checkApi = useCallback(async () => {
    setApiChecked(false);
    try {
      const [statusResponse, readiness] = await Promise.all([
        requestJson('/api/v1/status'), requestJson('/health/ready'),
      ]);
      const available = statusResponse.response.ok && readiness.response.ok;
      setApiReady(available);
      setStatus(statusResponse.response.ok ? statusResponse.body as ApiStatus : {});
    } catch {
      setApiReady(false);
      setStatus({});
    } finally {
      setApiChecked(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void checkApi();
  }, [refresh, checkApi]);

  // Turnstile is rendered only for forms requiring a public anti-bot challenge.
  useEffect(() => {
    if (!siteKey || !['register', 'forgot', 'verify'].includes(view)) return;
    let widgetId: string | undefined;
    let disposed = false;
    const mount = () => {
      if (disposed || !captchaRef.current || !window.turnstile) return;
      widgetId = window.turnstile.render(captchaRef.current, {
        sitekey: siteKey,
        callback: (token: string) => setCaptchaToken(token),
        'expired-callback': () => setCaptchaToken(''),
        'error-callback': () => setCaptchaToken(''),
        theme: 'dark',
      });
      captchaWidgetId.current = widgetId;
    };
    if (window.turnstile) mount();
    else {
      let script = document.querySelector<HTMLScriptElement>('script[data-uorqui-turnstile]');
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.dataset.uorquiTurnstile = 'true';
        document.head.appendChild(script);
      }
      script.addEventListener('load', mount);
      return () => {
        disposed = true;
        script?.removeEventListener('load', mount);
        if (widgetId) window.turnstile?.remove(widgetId);
      captchaWidgetId.current = null;
        captchaWidgetId.current = null;
      };
    }
    return () => {
      disposed = true;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [view, siteKey]);

  const doAction = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch {
      setMessage('Não foi possível conectar ao servidor. Tente novamente.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const resetChallenge = () => {
    setCaptchaToken('');
    if (captchaWidgetId.current) window.turnstile?.reset(captchaWidgetId.current);
  };

  const challenge = (): string | null => {
    if (!siteKey) return '';
    if (!captchaToken) {
      setMessage('Conclua a verificação de segurança antes de continuar.');
      return null;
    }
    return captchaToken;
  };

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await doAction(async () => {
      if (!apiReady) {
        setMessage('A API está indisponível. Verifique a conexão e tente novamente.');
        return;
      }
      if (view === 'register' && !canRegister) {
        setMessage('O cadastro público está sendo preparado. A verificação por e-mail e a proteção contra abuso ainda precisam ser ativadas.');
        return;
      }
      const token = view === 'register' ? challenge() : '';
      if (token === null) return;
      const signup = view === 'register';
      const { response, body } = await requestJson(
        signup ? '/api/auth/sign-up/email' : '/api/auth/sign-in/email',
        {
          method: 'POST',
          body: JSON.stringify(signup
            ? { name: name.trim(), email: email.trim(), password, callbackURL: window.location.origin, ...(token ? { captchaToken: token } : {}) }
            : { email: email.trim(), password }),
        },
      );
      if (signup) resetChallenge();
      if (!response.ok) {
        const errorCode = body && typeof body === 'object' && 'code' in body ? String(body.code) : '';
        if (!signup && errorCode === 'EMAIL_NOT_VERIFIED') {
          navigate('verify');
          setMessage('Sua conta está aguardando confirmação. Você pode solicitar um novo e-mail abaixo.');
          return;
        }
        setMessage(readableError(body, signup ? 'Não foi possível criar sua conta.' : 'E-mail ou senha inválidos.'));
        return;
      }
      setPassword('');
      setCaptchaToken('');
      if (signup && requiresVerification) {
        navigate('verify');
        setMessage('Conta criada! Enviamos um link de confirmação para seu e-mail.');
      } else await refresh();
    });
  }

  async function requestRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await doAction(async () => {
      if (!apiReady || !status.passwordRecoveryAvailable) {
        setMessage('A recuperação por e-mail ainda não está disponível.');
        return;
      }
      const token = challenge();
      if (token === null) return;
      const { response } = await requestJson('/api/auth/request-password-reset', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), redirectTo: window.location.origin + '/?reset=1', ...(token ? { captchaToken: token } : {}) }),
      });
      resetChallenge();
      if (!response.ok) {
        setMessage('Não foi possível solicitar a redefinição. Tente novamente.');
        return;
      }
      setMessage('Se esse e-mail estiver cadastrado, você receberá um link para redefinir a senha.');
    });
  }

  async function resendVerification() {
    await doAction(async () => {
      if (!apiReady || !requiresVerification) {
        setMessage('O envio de e-mails ainda não está disponível.');
        return;
      }
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setMessage('Digite um e-mail válido para receber a confirmação.');
        return;
      }
      const token = challenge();
      if (token === null) return;
      const { response } = await requestJson('/api/auth/send-verification-email', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), callbackURL: window.location.origin, ...(token ? { captchaToken: token } : {}) }),
      });
      resetChallenge();
      setMessage(response.ok ? 'Se a conta estiver pendente, enviaremos um novo link de confirmação.' : 'Não foi possível reenviar o e-mail. Tente novamente.');
    });
  }

  async function completePasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await doAction(async () => {
      if (!resetToken) {
        setMessage('Link inválido. Solicite uma nova recuperação de senha.');
        return;
      }
      const { response, body } = await requestJson('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword: password, token: resetToken }),
      });
      if (!response.ok) {
        setMessage(readableError(body, 'Link inválido ou expirado. Solicite outro.'));
        return;
      }
      setPassword('');
      window.history.replaceState({}, '', window.location.pathname);
      navigate('login');
      setMessage('Senha redefinida com sucesso. Entre com a nova senha.');
    });
  }

  async function completeProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await doAction(async () => {
      const { response, body } = await requestJson('/api/v1/onboarding', {
        method: 'POST',
        body: JSON.stringify({ handle: handle.trim().toLowerCase(), displayName: displayName.trim() }),
      });
      if (response.ok) await refresh();
      else setMessage(readableError(body, 'Não foi possível salvar o perfil.'));
    });
  }

  async function logout() {
    await doAction(async () => {
      const { response } = await requestJson('/api/auth/sign-out', { method: 'POST', body: '{}' });
      if (!response.ok) throw new Error('Logout unsuccessful');
      setAccount(null);
      setPassword('');
      navigate('welcome');
    });
  }

  const inputClass = 'w-full rounded-xl border border-white/20 bg-slate-900/90 px-4 py-3 text-base text-white outline-none transition-colors placeholder:text-slate-400 focus-visible:border-indigo-300 focus-visible:ring-2 focus-visible:ring-indigo-400/50';
  const buttonClass = 'flex w-full min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none';
  const minorButton = 'w-full min-h-11 rounded-xl border border-white/20 px-4 py-2.5 text-base font-medium text-slate-100 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300';
  const submitLabel = busy ? <><Spinner /> Aguarde…</> : view === 'register' ? 'Criar minha conta' : 'Entrar';

  return (
    <section aria-label="Acesso à conta" className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6">
      <div className="mb-5">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">Identidade Uorqui</div>
        <h2 className="mt-2 text-2xl font-semibold">{account ? 'Sua conta' : view === 'welcome' ? 'Bem-vindo ao Uorqui' : view === 'register' ? 'Criar sua conta' : view === 'forgot' ? 'Recuperar acesso' : view === 'verify' ? 'Confirme seu e-mail' : view === 'reset' ? 'Definir nova senha' : 'Entrar'}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">{account ? 'Seu perfil no Uorqui.' : view === 'welcome' ? 'Comece sua jornada. O feed e as comunidades ainda estão em desenvolvimento.' : view === 'register' ? 'Cadastre-se para criar sua identidade no Uorqui.' : view === 'verify' ? 'Verifique a caixa de entrada e o spam do endereço informado.' : 'Use seu e-mail para acessar sua conta.'}</p>
      </div>

      {loading ? (
        <div role="status" aria-label="Verificando sessão" className="space-y-3">
          <div aria-hidden="true" className="h-12 animate-pulse rounded-xl bg-white/10 motion-reduce:animate-none" />
          <div aria-hidden="true" className="h-12 animate-pulse rounded-xl bg-white/10 motion-reduce:animate-none" />
          <span className="sr-only">Verificando sessão…</span>
        </div>
      ) : account ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-slate-900/80 p-4">
            <p className="font-semibold">{account.profile?.displayName ?? account.user.name}</p>
            <p className="mt-1 break-all text-sm text-slate-300">{account.profile ? '@' + account.profile.handle : account.user.email}</p>
          </div>
          {!account.profile && (
            <form onSubmit={completeProfile} className="space-y-3">
              <p className="text-sm text-slate-300">Escolha um nome de usuário para concluir seu perfil.</p>
              <label className="block text-sm font-medium" htmlFor="handle">Nome de usuário</label>
              <input id="handle" className={inputClass} placeholder="seu_usuario" value={handle} onChange={(e) => setHandle(e.target.value)} pattern="[a-z][a-z0-9_]{2,31}" required minLength={3} maxLength={32} autoComplete="username" />
              <label className="block text-sm font-medium" htmlFor="displayName">Nome exibido</label>
              <input id="displayName" className={inputClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={2} maxLength={120} />
              <button type="submit" disabled={busy} aria-busy={busy} className={buttonClass}>{busy ? <><Spinner /> Salvando…</> : 'Criar meu perfil'}</button>
            </form>
          )}
          <button type="button" disabled={busy} aria-busy={busy} onClick={() => void logout()} className={minorButton}>{busy ? <><Spinner /> Saindo…</> : 'Sair da conta'}</button>
        </div>
      ) : view === 'welcome' ? (
        <div className="space-y-3">
          <button type="button" onClick={() => navigate('register')} className={buttonClass}>Criar conta</button>
          <button type="button" onClick={() => navigate('login')} className={minorButton}>Entrar com uma conta existente</button>
          {apiChecked && !apiReady && <p role="status" className="text-sm text-amber-200">O servidor está temporariamente indisponível. Você ainda pode conhecer os formulários.</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {view === 'verify' ? (
            <div className="space-y-3">
              <label htmlFor="verify-email" className="block text-sm font-medium text-slate-200">E-mail da conta</label>
              <input id="verify-email" type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              {siteKey && <div ref={captchaRef} aria-label="Verificação de segurança" />}
              <button type="button" disabled={busy} aria-busy={busy} onClick={() => void resendVerification()} className={buttonClass}>{busy ? <><Spinner /> Reenviando…</> : 'Reenviar confirmação'}</button>
              <button type="button" onClick={() => navigate('login')} className={minorButton}>Já confirmei · Entrar</button>
            </div>
          ) : (
            <form className="space-y-3" onSubmit={view === 'forgot' ? requestRecovery : view === 'reset' ? completePasswordReset : authenticate}>
              {view === 'register' && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="auth-name">Seu nome</label>
                  <input id="auth-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} autoComplete="name" />
                </div>
              )}
              {view !== 'reset' && <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="auth-email">E-mail</label>
                <input id="auth-email" type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </div>}
              {view !== 'forgot' && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="auth-password">Senha</label>
                  <div className="relative">
                    <input id="auth-password" type={showPassword ? 'text' : 'password'} className={inputClass + ' pr-24'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={view === 'register' || view === 'reset' ? 12 : undefined} maxLength={128} autoComplete={view === 'register' || view === 'reset' ? 'new-password' : 'current-password'} />
                    <button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPassword} onClick={() => setShowPassword(v => !v)} className="absolute inset-y-1 right-1 min-w-20 rounded-lg text-sm font-medium text-indigo-200 focus-visible:outline-2 focus-visible:outline-indigo-300">{showPassword ? 'Ocultar' : 'Mostrar'}</button>
                  </div>
                  {(view === 'register' || view === 'reset') && <p className="mt-1 text-xs text-slate-300">Use pelo menos 12 caracteres.</p>}
                </div>
              )}
              {siteKey && ['register', 'forgot'].includes(view) && <div ref={captchaRef} aria-label="Verificação de segurança" />}
              <button type="submit" disabled={busy} aria-busy={busy} className={buttonClass}>{busy ? <><Spinner /> Aguarde…</> : view === 'forgot' ? 'Enviar link de recuperação' : view === 'reset' ? 'Salvar nova senha' : submitLabel}</button>
              {view === 'register' && apiChecked && !canRegister && <p role="status" className="text-sm text-amber-200">Cadastro em preparação: falta ativar a confirmação por e-mail e a proteção contra abuso. Os dados preenchidos serão mantidos.</p>}
              {view === 'login' && <div className="flex flex-wrap gap-x-5 gap-y-3">
                <button type="button" onClick={() => navigate('forgot')} className="text-sm font-medium text-indigo-200 underline underline-offset-4">Esqueci minha senha</button>
                <button type="button" onClick={() => navigate('verify')} className="text-sm font-medium text-indigo-200 underline underline-offset-4">Reenviar confirmação de e-mail</button>
              </div>}
            </form>
          )}
          <button type="button" onClick={() => navigate('welcome')} className={minorButton}>Voltar às boas-vindas</button>
          {view === 'register' && <button type="button" onClick={() => navigate('login')} className="w-full text-sm font-medium text-indigo-200 underline underline-offset-4">Já tenho uma conta · Entrar</button>}
        </div>
      )}
      {message && <p role={view === 'verify' && message.startsWith('Conta criada') ? 'status' : 'alert'} className="mt-4 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">{message}</p>}
    </section>
  );
}
