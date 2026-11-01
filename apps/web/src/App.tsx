import { useCallback, useEffect, useState } from 'react';
import { motion, MotionConfig } from 'motion/react';
import { Github, MessageCircle, Users, Newspaper, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import AuthPanel, { type Account } from './AuthPanel';
import { UorquiWordmark } from './UorquiWordmark';
import SocialShell from './SocialShell';
import { PublicProfilePage } from './UserProfiles';
import { publicProfileHandle } from './publicProfileNavigation';
import { clearProfileImageCache } from './profileImageCache';
import { clearChatMediaCache } from './chatMediaCache';
import { clearFeedSessionCache } from './feedSessionCache';
import { deactivatePush } from './useSocialPush';
import EmailVerificationResult from './EmailVerificationResult';
import { UorquiPreferences, useUorquiPreferences } from './UorquiPreferences';
import { PreferencesControls } from './PreferencesControls';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LegalPage, legalDocumentFromPath } from './LegalPages';
import { CookieNotice } from './CookieNotice';

function StartupSplash() {
  const { t } = useUorquiPreferences();
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background p-6" role="status" aria-live="polite" aria-label={t("Iniciando Uorqui")}>
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="text-center">
        <UorquiWordmark className="mx-auto h-9 w-auto max-w-[85vw] text-foreground"/>
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
      <div className="relative mx-auto flex min-h-[100dvh] max-w-6xl flex-col px-0 sm:px-8 lg:px-10">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-border bg-background/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur sm:px-0 sm:py-4">
          <UorquiWordmark className="h-5 w-auto max-w-[45vw] text-foreground"/>
          <div className="flex shrink-0 items-center gap-2">
            <a href="https://github.com/gabrielduclos/uorqui" target="_blank" rel="noopener noreferrer"
              aria-label="GitHub" title="GitHub"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <Github aria-hidden="true" className="size-5" />
            </a>
            <PreferencesControls />
          </div>
        </header>

        <section className="grid flex-1 content-start items-center gap-5 py-4 sm:gap-10 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] lg:py-20">
          <div className="hidden lg:block">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-primary">{t("Conecte pessoas e interesses")}</p>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">{t('Descubra. Converse.')} <span className="text-primary">{t('Participe.')}</span></h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">{t('Uma plataforma social que reúne conversas individuais, comunidades e conteúdo em um só lugar.')}</p>

          </div>
          <div className="mx-auto w-full max-w-[440px] lg:max-w-none">
            <AuthPanel onAuthenticated={onAuthenticated} />
            <p className="mt-5 px-4 text-center text-sm leading-6 text-muted-foreground lg:hidden">
              {t('Converse, compartilhe e participe de comunidades em um só lugar.')}
            </p>
          </div>
        </section>

        <section aria-label={t("O que você encontra no Uorqui")} className="hidden gap-3 border-t border-border py-8 md:grid md:grid-cols-3">
          {areas.map(item => <article key={item.title} className="rounded-xl border border-border bg-card/65 p-5">
            <item.icon aria-hidden="true" className="mb-3 size-5 text-primary" />
            <h2 className="font-semibold">{t(item.title)}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(item.description)}</p>
          </article>)}
        </section>
        <footer className="mt-4 space-y-2 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground sm:px-0 lg:text-left">
          <nav className="flex flex-wrap justify-center gap-x-4 gap-y-2 lg:justify-start" aria-label={t('Documentos legais')}>
            <a href="/termos" target="_blank" rel="noopener noreferrer" className="underline">{t('Termos de Uso')}</a>
            <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline">{t('Política de Privacidade')}</a>
            <a href="/cookies" target="_blank" rel="noopener noreferrer" className="underline">{t('Política de Cookies')}</a>
          </nav>
        </footer>
      </div>
    </main>
  );
}

const INVITE_KEY='uorqui:pending-community-invite';
function invitationFromUrl(){
  const match=/^\/invite\/([0-9a-f-]{36})\/?$/i.exec(window.location.pathname);
  return match?.[1]??new URLSearchParams(window.location.search).get('invite');
}
function pendingInvitation(){
  const token=invitationFromUrl();
  if(token&&/^[0-9a-f-]{36}$/i.test(token)){
    try{localStorage.setItem(INVITE_KEY,token);}catch{}
    return token;
  }
  try{return localStorage.getItem(INVITE_KEY);}catch{return null;}
}

function AppContent() {
  const [inviteToken,setInviteToken]=useState<string|null>(pendingInvitation);
  const [invitePreview,setInvitePreview]=useState<string|null>(null);
  const [inviteError,setInviteError]=useState('');
  const [inviteBusy,setInviteBusy]=useState(false);
  const [invitedCommunity,setInvitedCommunity]=useState<string|null>(null);
  const [isVerificationResult, setIsVerificationResult] = useState(() => /^\/auth\/email-verification\/?$/.test(window.location.pathname));
  const [legalDocument,setLegalDocument]=useState(()=>legalDocumentFromPath(window.location.pathname));
  const [publicHandle, setPublicHandle] = useState<string | null>(() => publicProfileHandle(window.location.pathname));
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(()=>{
    const onBlocksChanged=()=>clearFeedSessionCache();
    window.addEventListener('uorqui:blocks-updated',onBlocksChanged);
    return ()=>window.removeEventListener('uorqui:blocks-updated',onBlocksChanged);
  },[]);

  useEffect(() => {
    const onNavigation = () => {
      setPublicHandle(publicProfileHandle(window.location.pathname));
      setInviteToken(pendingInvitation());
      setIsVerificationResult(/^\/auth\/email-verification\/?$/.test(window.location.pathname));
      setLegalDocument(legalDocumentFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onNavigation);
    return () => window.removeEventListener('popstate', onNavigation);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    // Do not block the login screen for a slow or cold-starting session service.
    const timeout = window.setTimeout(() => controller.abort(), 3_500);
    void (async () => {
      try {
        const response = await fetch('/api/v1/me', { credentials: 'same-origin', signal: controller.signal });
        if (response.ok && !controller.signal.aborted) setAccount(await response.json() as Account);
      } catch { /* Landing handles unavailable API and login errors. */ }
      finally { window.clearTimeout(timeout); if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; window.clearTimeout(timeout); controller.abort(); };
  }, []);

  const onPublicProfileMessage = useCallback((handle: string) => {
    window.history.replaceState(null, '', '/');
    setPublicHandle(null);
    window.dispatchEvent(new CustomEvent<string>('uorqui:open-dm', { detail: handle }));
  }, []);

  useEffect(()=>{
    if(!inviteToken)return;
    setInvitePreview(null);
    setInviteError('');
    let active=true;
    void fetch('/api/v1/community-invites/'+encodeURIComponent(inviteToken),{cache:'no-store'})
      .then(async r=>{if(!r.ok)throw Error('INVITE_EXPIRED');return r.json() as Promise<{community:{name:string}}>})
      .then(data=>{if(active){setInvitePreview(data.community.name);setInviteError('');}})
      .catch(()=>{if(active)setInviteError('Este convite expirou ou foi revogado. / This invitation is no longer valid.');});
    return ()=>{active=false;};
  },[inviteToken]);
  useEffect(()=>{
    // A second invite can be accepted in the same signed-in session.
    if(!inviteToken||!account?.profile)return;
    let active=true;setInviteBusy(true);
    void fetch('/api/v1/community-invites/'+encodeURIComponent(inviteToken)+'/redeem',{
      method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'
    }).then(async r=>{if(!r.ok)throw Error((await r.json().catch(()=>({error:'JOIN_FAILED'})) as {error:string}).error);return r.json() as Promise<{communityId:string}>;})
      .then(data=>{
        if(!active)return;
        setInvitedCommunity(data.communityId);setInviteToken(null);
        try{localStorage.removeItem(INVITE_KEY);}catch{}
        window.history.replaceState(null,'','/');
        // Verification callbacks may already have an authenticated session.
        setIsVerificationResult(false);
      }).catch(err=>{if(active){setInviteError(err instanceof Error&&err.message==='COMMUNITY_BANNED'?
          'Você foi banido desta comunidade. / You are banned from this community.':
          'Não foi possível aceitar o convite. / Could not redeem the invitation.');}})
      .finally(()=>{if(active)setInviteBusy(false);});
    return ()=>{active=false;};
  },[account?.profile,inviteToken]);
  const onAuthenticated = useCallback((next: Account) => {
    clearChatMediaCache();clearFeedSessionCache();setAccount(next);
  }, []);
  const signOut = useCallback(async () => {
    // Revoke the authenticated subscription before ending the session.
    await deactivatePush().catch(()=>{});
    const response = await fetch('/api/auth/sign-out', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) throw new Error('Logout failed');
    clearProfileImageCache();
    clearChatMediaCache();
    clearFeedSessionCache();
    setAccount(null);
    setInvitedCommunity(null);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      {legalDocument ? <LegalPage document={legalDocument}/> : isVerificationResult ? <EmailVerificationResult/> : account?.profile ? (
        <SocialShell account={account} onLogout={signOut} onAccountUpdate={next => setAccount(next)}
          invitedCommunityId={invitedCommunity} deferOnboarding={Boolean(inviteToken || invitedCommunity)} />
      ) : !publicHandle ? (loading ? <StartupSplash /> : <Landing onAuthenticated={onAuthenticated} />) : null}
      {inviteToken && !publicHandle && !isVerificationResult && !legalDocument && <div role="status" className="fixed left-1/2 top-4 z-[110] w-[min(90vw,34rem)] -translate-x-1/2 rounded-xl border border-primary/40 bg-card p-3 text-center text-sm shadow-lg">
        <button type="button" className="absolute right-2 top-2 rounded-md p-1.5 hover:bg-secondary"
          aria-label="Fechar convite / Dismiss invitation" onClick={()=>{
            try{localStorage.removeItem(INVITE_KEY);}catch{}
            if(/^\/invite\//.test(window.location.pathname))window.history.replaceState(null,'','/');
            setInviteToken(null);setInviteError('');
          }}><X className="size-4"/></button>
        {invitePreview?<strong className="block pr-8">{invitePreview}</strong>:
          inviteError?<strong>Convite indisponível / Invitation unavailable</strong>:
          <Skeleton className="mx-auto h-4 w-48"/>}
        <p className="mt-2 flex items-center justify-center gap-2 text-muted-foreground">
          {inviteBusy&&<Spinner className="size-4"/>}
          {inviteError||(inviteBusy?'Entrando na comunidade… / Joining community…':
            account?.profile?'Convite pronto para aceitar… / Accepting invite…':
            'Entre ou crie sua conta para participar. / Sign in or create an account to join.')}
        </p>
      </div>}
      {!isVerificationResult && !legalDocument && publicHandle && (
        <div className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain bg-background">
          <PublicProfilePage handle={publicHandle} onMessage={account?.profile && account.profile.handle !== publicHandle ? onPublicProfileMessage : undefined} />
        </div>
      )}
      <CookieNotice/>
    </MotionConfig>
  );
}

export default function App() {
  return <UorquiPreferences><AppContent /></UorquiPreferences>;
}
