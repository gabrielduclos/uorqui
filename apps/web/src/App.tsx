import { useCallback, useEffect, useState } from 'react';
import { motion, MotionConfig } from 'motion/react';
import { Github, MessageCircle, Users, Newspaper } from 'lucide-react';
import AuthPanel, { type Account } from './AuthPanel';
import SocialShell from './SocialShell';
import { UorquiPreferences, useUorquiPreferences } from './UorquiPreferences';
import { PreferencesControls } from './PreferencesControls';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function StartupSplash() {
  const { t } = useUorquiPreferences();
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background p-6" role="status" aria-live="polite" aria-label={t("Iniciando Uorqui")}>
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="text-center">
        <div className="text-5xl font-bold tracking-tight">uorqui<span className="text-primary">.</span></div>
        <p className="mt-3 text-sm text-muted-foreground">{t("Preparando sua experiência…")}</p>
        <div className="mt-6 h-1 w-52 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
          <motion.div className="h-full w-1/3 rounded-full bg-primary" initial={{ x: '-100%' }} animate={{ x: '310%' }} transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }} />
        </div>
      </motion.div>
    </main>
  );
}

const areas = [
  { title: 'Conversas', icon: MessageCircle, description: 'Mensagens privadas entre duas pessoas, com uma interface leve e familiar.' },
  { title: 'Feed', icon: Newspaper, description: 'Um espaço contínuo para textos, fotos e vídeos da sua rede.' },
  { title: 'Comunidades', icon: Users, description: 'Grupos com canais de texto e salas de voz organizados por assunto.' },
] as const;

function Landing({ onAuthenticated }: { onAuthenticated: (account: Account) => void }) {
  const { t } = useUorquiPreferences();
  return (
    <main className="relative min-h-[100dvh] overflow-x-clip bg-background">
      <div aria-hidden="true" className="pointer-events-none absolute -top-48 left-1/2 size-120 -translate-x-1/2 rounded-full bg-primary/15 blur-[100px]" />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-6xl flex-col px-5 sm:px-10">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-border bg-background/95 py-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
          <span className="text-2xl font-bold tracking-tight">uorqui<span className="text-primary">.</span></span>
          <div className="flex shrink-0 items-center gap-2">
            <PreferencesControls />
          </div>
        </header>

        <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1fr_390px] lg:py-20">
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-primary">{t("Conecte pessoas e interesses")}</p>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">{t('Descubra. Converse.')} <span className="text-primary">{t('Participe.')}</span></h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">{t('Uma plataforma social que reúne conversas individuais, comunidades e conteúdo em um só lugar.')}</p>
            <Button variant="outline" className="mt-8" asChild><a href="https://github.com/gabrielduclos/uorqui" target="_blank" rel="noreferrer"><Github className="size-4" /> {t("Conheça o projeto")}</a></Button>
          </div>
          <AuthPanel onAuthenticated={onAuthenticated} />
        </section>

        <section aria-label={t("O que você encontra no Uorqui")} className="grid gap-3 border-t border-border py-8 md:grid-cols-3">
          {areas.map(item => <article key={item.title} className="rounded-xl border border-border bg-card/65 p-5">
            <item.icon aria-hidden="true" className="mb-3 size-5 text-primary" />
            <h2 className="font-semibold">{t(item.title)}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(item.description)}</p>
          </article>)}
        </section>
        <footer className="pb-6 text-xs text-muted-foreground">{t('Uorqui · Construído em código aberto · Funcionalidades sociais em desenvolvimento')}</footer>
      </div>
    </main>
  );
}

function AppContent() {
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    void (async () => {
      try {
        const response = await fetch('/api/v1/me', { credentials: 'same-origin', signal: controller.signal });
        if (response.ok && !controller.signal.aborted) setAccount(await response.json() as Account);
      } catch { /* Landing handles unavailable API and login errors. */ }
      finally { window.clearTimeout(timeout); if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; window.clearTimeout(timeout); controller.abort(); };
  }, []);

  const onAuthenticated = useCallback((next: Account) => setAccount(next), []);
  const signOut = useCallback(async () => {
    const response = await fetch('/api/auth/sign-out', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) throw new Error('Logout failed');
    setAccount(null);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      {loading ? <StartupSplash /> : account?.profile ? (
        <SocialShell account={account} onLogout={signOut} />
      ) : <Landing onAuthenticated={onAuthenticated} />}
    </MotionConfig>
  );
}

export default function App() {
  return <UorquiPreferences><AppContent /></UorquiPreferences>;
}
