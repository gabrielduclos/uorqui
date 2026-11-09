import { useCallback, useEffect, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { Github, MessageCircle, Users, Mail, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import AuthPanel, { type Account } from './AuthPanel';
import { UorquiWordmark } from './UorquiWordmark';
import { StartupSplash } from './StartupSplash';
import SocialShell from './SocialShell';
import { PublicProfilePage } from './UserProfiles';
import { publicProfileHandle } from './publicProfileNavigation';
import { clearProfileImageCache, setProfileImageCacheAccount } from './profileImageCache';
import { clearChatMediaCache, setChatMediaCacheAccount } from './chatMediaCache';
import { deactivatePush } from './useSocialPush';
import EmailVerificationResult from './EmailVerificationResult';
import { UorquiPreferences, useUorquiPreferences } from './UorquiPreferences';
import { PreferencesControls } from './PreferencesControls';
import { BetaBadge } from './BetaBadge';
import { Button } from '@/components/ui/button';
import { LegalPage, legalDocumentFromPath } from './LegalPages';
import { CookieNotice } from './CookieNotice';
import { AppInstanceBlocker } from './AppInstanceBlocker';
import { useAppInstanceLease } from './useAppInstanceLease';

const areas = [
  { title: 'Comunidades', icon: Users, description: 'Seu ponto de partida para canais de texto, salas de voz e reuniões.' },
  { title: 'Mensagens', icon: MessageCircle, description: 'Mensagens privadas entre duas pessoas, com uma interface leve e familiar.' },
  { title: 'Email', icon: Mail, description: 'Conecte Gmail e Outlook e acompanhe seus emails no mesmo lugar.' },
] as const;

function Landing({ onAuthenticated }: { onAuthenticated: (account: Account) => void }) {
  const { t } = useUorquiPreferences();
  return (
    <main className="relative min-h-[100dvh] overflow-x-clip bg-background">
      <div aria-hidden="true" className="pointer-events-none absolute -top-48 left-1/2 size-120 -translate-x-1/2 rounded-full bg-primary/15 blur-[100px]" />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-6xl flex-col px-0 sm:px-8 lg:px-10">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-border bg-background/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur sm:px-0 sm:py-4">
          <div className="flex min-w-0 items-center gap-2">
            <UorquiWordmark className="h-5 w-auto max-w-[38vw] text-foreground"/>
            <BetaBadge />
          </div>
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
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">{t('Sua comunicação.')} <span className="text-primary">{t('Em um só lugar.')}</span></h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">{t('Mensagens, comunidades e email conectados ao seu dia a dia.')}</p>

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
    try{
      localStorage.setItem(INVITE_KEY,token);
      const channel=new URLSearchParams(window.location.search).get('channel');
      if(channel&&/^[0-9a-f-]{36}$/i.test(channel))localStorage.setItem('uorqui:pending-meeting-channel',channel);
    }catch{}
    return token;
  }
  try{return localStorage.getItem(INVITE_KEY);}catch{return null;}
}

function AppContent() {
  const {locale}=useUorquiPreferences();
  const pt=locale==='pt-BR';
  const [inviteToken,setInviteToken]=useState<string|null>(pendingInvitation);
  const [invitePreview,setInvitePreview]=useState<string|null>(null);
  const [inviteError,setInviteError]=useState<''|'expired'|'banned'|'redeem'>('');
  const [inviteBusy,setInviteBusy]=useState(false);
  const [invitedCommunity,setInvitedCommunity]=useState<string|null>(null);
  const [isVerificationResult, setIsVerificationResult] = useState(() => /^\/auth\/email-verification\/?$/.test(window.location.pathname));
  const [legalDocument,setLegalDocument]=useState(()=>legalDocumentFromPath(window.location.pathname));
  const [publicHandle, setPublicHandle] = useState<string | null>(() => publicProfileHandle(window.location.pathname));
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<Account | null>(null);
  const instance = useAppInstanceLease(account?.profile ? account.user.id : null);

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
        if (response.ok && !controller.signal.aborted) {
          const verified = await response.json() as Account;
          if (!controller.signal.aborted) {
            setProfileImageCacheAccount(verified.user.id);
            setChatMediaCacheAccount(verified.user.id);
            setAccount(verified);
          }
        }
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
      .catch(()=>{if(active)setInviteError('expired');});
    return ()=>{active=false;};
  },[inviteToken]);
  // Redeem only after an explicit user click. Registration or login never joins a community.
  async function acceptCommunityInvite(){
    if(!inviteToken||!account?.profile||inviteBusy||!invitePreview)return;
    setInviteBusy(true);setInviteError('');
    try{
      const response=await fetch('/api/v1/community-invites/'+encodeURIComponent(inviteToken)+'/redeem',{
        method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'
      });
      if(!response.ok)throw Error((await response.json().catch(()=>({error:'JOIN_FAILED'})) as {error:string}).error);
      const data=await response.json() as {communityId:string};
      setInvitedCommunity(data.communityId);setInviteToken(null);
      let channel:string|null=null;
      try{
        channel=localStorage.getItem('uorqui:pending-meeting-channel');
        localStorage.removeItem('uorqui:pending-meeting-channel');
        localStorage.removeItem(INVITE_KEY);
      }catch{}
      window.history.replaceState(null,'','/');
      if(channel&&/^[0-9a-f-]{36}$/i.test(channel))
        window.setTimeout(()=>window.dispatchEvent(new CustomEvent('uorqui:open-community-link',{
          detail:{communityId:data.communityId,channelId:channel}
        })),120);
      setIsVerificationResult(false);
    }catch(error){
      setInviteError(error instanceof Error&&error.message==='COMMUNITY_BANNED'?'banned':'redeem');
    }finally{setInviteBusy(false);}
  }
  function declineCommunityInvite(){
    try{localStorage.removeItem(INVITE_KEY);localStorage.removeItem('uorqui:pending-meeting-channel');}catch{}
    if(/^\/invite\//.test(window.location.pathname))window.history.replaceState(null,'','/');
    setInviteToken(null);setInvitePreview(null);setInviteError('');
  }
  const onAuthenticated = useCallback((next: Account) => {
    setProfileImageCacheAccount(next.user.id);
    setChatMediaCacheAccount(next.user.id);
    clearChatMediaCache();
    setAccount(next);
  }, []);
  const accountDeleted = useCallback(async () => {
    await deactivatePush().catch(()=>{});
    await clearProfileImageCache().catch(()=>{});
    clearChatMediaCache();
    setProfileImageCacheAccount(null);
    setChatMediaCacheAccount(null);
    setAccount(null);
    setInvitedCommunity(null);
    window.history.replaceState(null,'','/');
  }, []);
  const signOut = useCallback(async () => {
    // Release only our owned slot; never invalidate the other active device.
    await instance.release();
    // Revoke the authenticated subscription before ending the session.
    await deactivatePush().catch(()=>{});
    const response = await fetch('/api/auth/sign-out', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) throw new Error('Logout failed');
    await clearProfileImageCache();
    setProfileImageCacheAccount(null);
    setChatMediaCacheAccount(null);
    setAccount(null);
    setInvitedCommunity(null);
  }, [instance.release]);

  const inviteErrorText=inviteError==='expired'
    ?(pt?'Este convite expirou ou foi revogado.':'This invitation is no longer valid.')
    :inviteError==='banned'
      ?(pt?'Você foi banido desta comunidade.':'You are banned from this community.')
      :inviteError==='redeem'
        ?(pt?'Não foi possível aceitar o convite.':'Could not redeem the invitation.')
        :'';
  return (
    <MotionConfig reducedMotion="user">
      {legalDocument ? <LegalPage document={legalDocument}/> : isVerificationResult ? <EmailVerificationResult/> : account?.profile ? (
        instance.status === 'active'
          ? <SocialShell account={account} onLogout={signOut} onAccountDeleted={accountDeleted} onAccountUpdate={next => setAccount(next)}
              invitedCommunityId={invitedCommunity} deferOnboarding={Boolean(inviteToken || invitedCommunity)} />
          : instance.status === 'checking'
            // Keep the original startup splash mounted while the authenticated
            // instance lease is checked; never flash a separate checking screen.
            ? <StartupSplash />
            : <AppInstanceBlocker kind={instance.kind} status={instance.status}
                onTakeover={instance.takeover} onRetry={instance.retry} onLogout={()=>void signOut()} />
      ) : !publicHandle ? (loading ? <StartupSplash /> : <Landing onAuthenticated={onAuthenticated} />) : null}
      {instance.status === 'active' && inviteToken && account?.profile && !publicHandle && !isVerificationResult && !legalDocument && <div
        role="dialog" aria-modal={true} aria-label={pt?'Convite para comunidade':'Community invitation'}
        className="fixed inset-0 z-[410] flex items-center justify-center bg-black/65 p-4">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{pt?'Convite de comunidade':'Community invitation'}</p>
              <h2 className="mt-1 break-words text-lg font-semibold">{invitePreview||(pt?'Acessar comunidade':'Join community')}</h2></div>
            <button type="button" aria-label={pt?'Recusar convite':'Decline invitation'}
              onClick={declineCommunityInvite} className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-secondary">
              <X className="size-4"/></button>
          </div>
          {!invitePreview&&!inviteError&&<Skeleton className="h-4 w-48"/>}
          <p className="text-sm text-muted-foreground">{inviteErrorText||
            (account?.profile
              ?(pt?'Você recebeu um convite. Quer entrar nesta comunidade? Nada será aceito automaticamente.':
                'You have been invited. Would you like to join this community? Nothing will be accepted automatically.')
              :(pt?'Entre ou crie sua conta primeiro. Depois você poderá escolher se deseja participar.':
                'Sign in or register first; then choose whether to join.'))}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={inviteBusy} onClick={declineCommunityInvite}>
              {pt?'Agora não':'Not now'}
            </Button>
            {account?.profile&&<Button type="button" onClick={()=>void acceptCommunityInvite()}
              disabled={!invitePreview||Boolean(inviteError)||inviteBusy}>
              {inviteBusy&&<Spinner className="size-4"/>}{pt?'Entrar na comunidade':'Join community'}
            </Button>}
          </div>
        </div>
      </div>}
      {!isVerificationResult && !legalDocument && publicHandle && (
        <div className="fixed inset-0 z-[400] overflow-y-auto overscroll-contain bg-background">
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
