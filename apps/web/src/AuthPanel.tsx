import { useCallback, useEffect, useState, type FormEvent } from 'react';

type Account = {
  user: { id: string; email: string; name: string };
  profile: { handle: string; displayName: string; bio: string | null } | null;
};

async function requestJson(path: string, options?: RequestInit) {
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const body: unknown = await response.json().catch(() => ({}));
  return { response, body };
}

function readableError(data: unknown, fallback: string) {
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const error = data.error;
    if (typeof error === 'string') return error;
  }
  return fallback;
}

export default function AuthPanel() {
  const [account, setAccount] = useState<Account | null>(null);
  const [view, setView] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    try {
      const { response, body } = await requestJson('/api/v1/me');
      if (response.ok) {
        const data = body as Account;
        setAccount(data);
        setDisplayName(data.user.name);
        setMessage('');
      } else {
        setAccount(null);
      }
    } catch {
      setAccount(null);
      setMessage('Não foi possível acessar a API. Verifique se o servidor está ligado.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const signup = view === 'register';
      const { response, body } = await requestJson(
        signup ? '/api/auth/sign-up/email' : '/api/auth/sign-in/email',
        {
          method: 'POST',
          body: JSON.stringify(signup ? { name: name.trim(), email: email.trim(), password } : { email: email.trim(), password }),
        },
      );
      if (!response.ok) {
        setMessage(readableError(body, signup ? 'Não foi possível criar a conta.' : 'E-mail ou senha inválidos.'));
      } else {
        setPassword('');
        await refresh();
      }
    } catch {
      setMessage('Não foi possível conectar ao servidor.');
    } finally {
      setBusy(false);
    }
  }

  async function completeProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const { response, body } = await requestJson('/api/v1/onboarding', {
        method: 'POST',
        body: JSON.stringify({ handle: handle.trim().toLowerCase(), displayName: displayName.trim() }),
      });
      if (response.ok) {
        await refresh();
      } else {
        setMessage(readableError(body, 'Não foi possível salvar o perfil.'));
      }
    } catch {
      setMessage('Não foi possível conectar ao servidor.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setMessage('');
    try {
      const { response } = await requestJson('/api/auth/sign-out', { method: 'POST', body: '{}' });
      if (!response.ok) throw new Error('Logout unsuccessful');
      setAccount(null);
      setPassword('');
      setView('login');
    } catch {
      setMessage('Não foi possível sair. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  const inputClass = 'w-full rounded-xl border border-white/15 bg-slate-900/90 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-indigo-400';
  const buttonClass = 'w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <section aria-label="Acesso à conta" className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6">
      <div className="mb-5">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">Identidade Uorqui</div>
        <h2 className="mt-2 text-xl font-semibold">Sua conta</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">Cadastro e sessão em fase de desenvolvimento. Ainda não há feed nem conversas funcionais.</p>
      </div>

      {loading ? (
        <p role="status" className="text-sm text-slate-300">Verificando sessão…</p>
      ) : account ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-slate-900/80 p-4">
            <p className="font-semibold">{account.profile?.displayName ?? account.user.name}</p>
            <p className="mt-1 break-all text-sm text-slate-300">{account.profile ? '@' + account.profile.handle : account.user.email}</p>
          </div>
          {!account.profile && (
            <form onSubmit={completeProfile} className="space-y-3">
              <p className="text-sm text-slate-300">Escolha um nome de usuário para concluir seu perfil.</p>
              <label className="block text-xs font-medium text-slate-300" htmlFor="handle">Nome de usuário</label>
              <input id="handle" className={inputClass} placeholder="seu_usuario" value={handle} onChange={(e) => setHandle(e.target.value)} pattern="[a-z][a-z0-9_]{2,31}" required minLength={3} maxLength={32} autoComplete="username" />
              <label className="block text-xs font-medium text-slate-300" htmlFor="displayName">Nome exibido</label>
              <input id="displayName" className={inputClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={2} maxLength={120} />
              <button type="submit" disabled={busy} className={buttonClass}>{busy ? 'Salvando…' : 'Criar meu perfil'}</button>
            </form>
          )}
          <button type="button" disabled={busy} onClick={() => void logout()} className="w-full rounded-xl border border-white/20 px-4 py-3 text-sm font-medium hover:bg-white/10 disabled:opacity-50">
            Sair da conta
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-900/80 p-1">
            <button type="button" aria-pressed={view === 'login'} onClick={() => { setView('login'); setMessage(''); }} className={view === 'login' ? 'rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold' : 'rounded-lg px-3 py-2 text-sm text-slate-300'}>Entrar</button>
            <button type="button" aria-pressed={view === 'register'} onClick={() => { setView('register'); setMessage(''); }} className={view === 'register' ? 'rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold' : 'rounded-lg px-3 py-2 text-sm text-slate-300'}>Criar conta</button>
          </div>
          <form className="space-y-3" onSubmit={authenticate}>
            {view === 'register' && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-300" htmlFor="auth-name">Seu nome</label>
                <input id="auth-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} autoComplete="name" />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300" htmlFor="auth-email">E-mail</label>
              <input id="auth-email" type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300" htmlFor="auth-password">Senha</label>
              <input id="auth-password" type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} maxLength={128} autoComplete={view === 'register' ? 'new-password' : 'current-password'} />
              {view === 'register' && <p className="mt-1 text-xs text-slate-400">Mínimo de 12 caracteres. Cadastro liberado apenas no ambiente local de desenvolvimento.</p>}
            </div>
            <button type="submit" disabled={busy} className={buttonClass}>{busy ? 'Aguarde…' : view === 'login' ? 'Entrar' : 'Criar conta'}</button>
          </form>
        </>
      )}
      {message && <p role="alert" className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">{message}</p>}
    </section>
  );
}
