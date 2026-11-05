import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Bell, ChevronDown, ChevronRight, Compass, LogOut, MessageCircle, PanelLeftClose, PanelLeftOpen, PanelRightOpen, Plus, Search, Settings2, ShieldCheck, Users,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BetaBadge } from './BetaBadge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { PreferencesControls } from './PreferencesControls';
import { UorquiWordmark } from './UorquiWordmark';
import { useUorquiPreferences } from './UorquiPreferences';
import { useVisualViewportFrame } from './useVisualViewportFrame';
import { ProfileEditor, type UserProfileData } from './UserProfiles';
import { useCachedProfileImage } from './profileImageCache';
import LiveDirectChat from './LiveDirectChat';
import LiveCommunities from './LiveCommunities';
import DiscoverHome from './DiscoverHome';
import ModerationPanel from './ModerationPanel';
import { useUnreadDirectMessages } from './useUnreadDirectMessages';
import { startDmOutbox } from './dmOutbox';
import { clearDmAccount } from './dmCache';
import { resetDmInboxSession } from './dmEventStream';
import { clearChatMediaCache } from './chatMediaCache';
import { clearCommunityMessageCache } from './communityMessageCache';
import {useCommunityUnread} from './useCommunityUnread';
import { useWorkspaceCommunities, WorkspaceCommunityShortcuts } from './WorkspaceCommunities';
import { WorkspaceCommandPalette, type WorkspaceCommand } from './WorkspaceCommandPalette';
import {OnboardingTour,onboardingStorageKey} from './OnboardingTour';
import {PwaFirstRun} from './PwaFirstRun';
import {ActivityNotifications} from './ActivityNotifications';
import {useActivityNotifications,type ActivityNotification} from './useActivityNotifications';

export type SignedInAccount = {
  user: { id: string; name: string; email: string };
  profile: UserProfileData | null;
};
type Area = 'discover' | 'conversations' | 'communities' | 'notifications' | 'profile' | 'moderation';

// Remember the last main app module per account on this device. Direct links
// and invitations remain authoritative over the restored selection.
const rememberedAreas: readonly Area[] = ['discover', 'conversations', 'communities', 'notifications', 'profile', 'moderation'];
const lastAreaKey = (userId: string) => 'uorqui:last-area:v1:' + userId;
function readLastArea(userId: string): Area {
  try {
    const value = localStorage.getItem(lastAreaKey(userId));
    return rememberedAreas.find(area => area === value) ?? 'communities';
  } catch {
    return 'communities';
  }
}

const navigation = [
  { id: 'communities', label: 'Comunidades', icon: Users },
  { id: 'conversations', label: 'Conversas', icon: MessageCircle },
  { id: 'discover', label: 'Descobrir', icon: Compass },
  { id: 'notifications', label: 'Notificações', icon: Bell },
] as const;

function ProfileAvatar({ name, image, className }: { name: string; image?: string | null; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'U';
  const source = useCachedProfileImage(image);
  return <Avatar className={cn('size-9', className)}>{source && <AvatarImage src={source} alt={name} referrerPolicy="no-referrer" className="object-cover" />}<AvatarFallback className="bg-primary/20 font-semibold text-primary">{initials}</AvatarFallback></Avatar>;
}

export default function SocialShell({ account, onLogout, onAccountUpdate, invitedCommunityId, deferOnboarding = false }: {
  account: SignedInAccount;
  onLogout: () => Promise<void>;
  onAccountUpdate: (next: SignedInAccount) => void;
  invitedCommunityId?: string | null;
  deferOnboarding?: boolean;
}) {
  const { t, locale } = useUorquiPreferences();
  useVisualViewportFrame();
  const [area, setArea] = useState<Area>(() => readLastArea(account.user.id));
  const areaAccountId = useRef(account.user.id);
  const [platformModerator,setPlatformModerator]=useState<boolean | null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch('/api/v1/moderation/access',{credentials:'same-origin',cache:'no-store',signal:controller.signal})
      .then(async response=>response.ok?response.json() as Promise<{moderator:boolean}>:{moderator:false})
      .then(result=>{
        if(controller.signal.aborted)return;
        setPlatformModerator(result.moderator===true);
        if(!result.moderator)setArea(previous=>previous==='moderation'?'communities':previous);
      })
      .catch(()=>{
        if(controller.signal.aborted)return;
        setPlatformModerator(false);
        setArea(previous=>previous==='moderation'?'communities':previous);
      });
    return ()=>controller.abort();
  },[account.user.id]);
  useEffect(()=>{if(invitedCommunityId)setArea('communities');},[invitedCommunityId]);
  const unreadMessageCount = useUnreadDirectMessages(account.user.id);
  useEffect(() => startDmOutbox(account.user.id), [account.user.id]);
  const communityUnread = useCommunityUnread();
  const workspaceCommunities = useWorkspaceCommunities(account.user.id);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string|null>(() => {
    try { return localStorage.getItem('uorqui:last-community:' + account.user.id); } catch { return null; }
  });
  useEffect(() => {
    setSelectedCommunityId(() => {
      try { return localStorage.getItem('uorqui:last-community:' + account.user.id); } catch { return null; }
    });
    const onSelect = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string | null }>).detail?.id;
      if (typeof id === 'string' || id === null) setSelectedCommunityId(id);
    };
    window.addEventListener('uorqui:community-selected', onSelect);
    return () => window.removeEventListener('uorqui:community-selected', onSelect);
  }, [account.user.id]);
  const [commandOpen, setCommandOpen] = useState(false);
  useEffect(() => {
    const open = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setCommandOpen(previous => !previous);
      }
    };
    window.addEventListener('keydown', open);
    return () => window.removeEventListener('keydown', open);
  }, []);
  const activity = useActivityNotifications(account.user.id);
  const communityUnreadLabel=communityUnread.total>99?'99+':String(communityUnread.total);
  // Joining through an invite takes priority; present the tour on a later normal visit.
  const [tourVisible,setTourVisible]=useState(()=>{
    if(deferOnboarding)return false;
    try{return localStorage.getItem(onboardingStorageKey(account.user.id))!=='done';}catch{return true;}
  });
  useEffect(()=>{if(deferOnboarding)setTourVisible(false);},[deferOnboarding]);
  useEffect(() => {
    // The shell can survive a session change. Never write one account's module
    // into another account's preference.
    if (areaAccountId.current !== account.user.id) {
      areaAccountId.current = account.user.id;
      setArea(readLastArea(account.user.id));
      return;
    }
    // Tour steps navigate automatically and must not overwrite this preference.
    if (tourVisible) return;
    try { localStorage.setItem(lastAreaKey(account.user.id), area); }
    catch { /* Private browsing or blocked storage: keep normal navigation. */ }
  }, [area, account.user.id, tourVisible]);
  const unreadLabel = unreadMessageCount > 99 ? '99+' : String(unreadMessageCount);
  const [requestedChatHandle, setRequestedChatHandle] = useState<string | null>(null);
  const [requestedConversationId,setRequestedConversationId]=useState<string|null>(null);
  const [conversationOpened, setConversationOpened] = useState(false);
  const [channelOpened, setChannelOpened] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutConfirm,setLogoutConfirm]=useState(false);
  const [logoutError, setLogoutError] = useState('');

  useEffect(() => {
    const listener = (event: Event) => {
      const handle = (event as CustomEvent<string>).detail;
      if (typeof handle !== 'string') return;
      setRequestedChatHandle(handle);
      setArea('conversations');
    };
    window.addEventListener('uorqui:open-dm', listener);
    return () => window.removeEventListener('uorqui:open-dm', listener);
  }, []);

  const move=useCallback((next: Area) => {
    const order:Area[]=['communities','conversations','discover','notifications','profile','moderation'];
    setNavDirection(order.indexOf(next)>=order.indexOf(previousArea.current)?1:-1);
    previousArea.current=next;
    setArea(next);
    setConversationOpened(false);
    // Communities remain mounted to preserve any ongoing WebRTC voice call.
  }, []);
  useEffect(()=>{
    const open=(event:Event)=>{
      const target=(event as CustomEvent<{communityId?:string;channelId?:string}>).detail;
      if(!target?.communityId||!/^[0-9a-f-]{36}$/i.test(target.communityId))return;
      move('communities');
      window.dispatchEvent(new CustomEvent('uorqui:open-community',{detail:target}));
    };
    window.addEventListener('uorqui:open-community-link',open);
    return()=>window.removeEventListener('uorqui:open-community-link',open);
  },[move]);


  useEffect(()=>{
    const open=(urlValue:string)=>{
      const url=new URL(urlValue,window.location.origin);
      if(url.origin!==window.location.origin)return;
      const id=url.searchParams.get('conversation');
      const community=url.searchParams.get('community');
      const channel=url.searchParams.get('channel');
      const notification=url.searchParams.get('notification');
      if(id&&/^[0-9a-f-]{36}$/i.test(id)){setRequestedConversationId(id);move('conversations');}
      else if(community&&/^[0-9a-f-]{36}$/i.test(community)){
        move('communities');
        if(channel&&/^[0-9a-f-]{36}$/i.test(channel))window.setTimeout(()=>window.dispatchEvent(new CustomEvent('uorqui:open-community',{detail:{communityId:community,channelId:channel}})),50);
      }
      else if(notification&&/^[0-9a-f-]{36}$/i.test(notification))move('notifications');
    };
    const onMessage=(event:MessageEvent)=>{
      if(event.data?.type==='uorqui:push-open'&&typeof event.data.url==='string')open(event.data.url);
      if(event.data?.type==='uorqui:activity-update')window.dispatchEvent(new Event('uorqui:activity-update'));
    };
    navigator.serviceWorker?.addEventListener('message',onMessage);
    const current=new URL(window.location.href);
    if(current.searchParams.has('conversation')||current.searchParams.has('community')||current.searchParams.has('notification')){
      open(current.toString());current.searchParams.delete('conversation');current.searchParams.delete('community');current.searchParams.delete('channel');current.searchParams.delete('notification');
      window.history.replaceState({},'',current.pathname+current.search);
    }
    return()=>navigator.serviceWorker?.removeEventListener('message',onMessage);
  },[move]);

  function openActivity(item:ActivityNotification){
    void activity.markRead(item.id);
    if(item.kind==='community_join_request'||item.kind==='meeting_join_request'){
      const communityId=item.communityId??(item.kind==='community_join_request'?item.targetId:null);
      if(communityId){openDiscoveryCommunity(communityId,item.kind==='meeting_join_request'?item.targetId:undefined);return;}
    }
    if(/^[a-z][a-z0-9_]{2,31}$/.test(item.actorHandle)){
      window.history.pushState({uorquiInternalProfile:true},'','/@'+item.actorHandle);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError('');
    try { await onLogout(); resetDmInboxSession(); clearChatMediaCache(); clearCommunityMessageCache(account.user.id); await clearDmAccount(account.user.id); }
    catch { setLogoutError(t("Não foi possível sair da conta. Tente novamente.")); setLoggingOut(false);setLogoutConfirm(false); }
  }

  const openDiscoveryCommunity=useCallback((communityId:string,channelId?:string)=>{
    setArea('communities');setConversationOpened(false);
    window.dispatchEvent(new CustomEvent('uorqui:open-community',{detail:{communityId,channelId}}));
  },[]);

  const [channelPanelOpen,setChannelPanelOpen]=useState(false);
  const [selectedChannelId,setSelectedChannelId]=useState<string|null>(null);
  useEffect(()=>{
    const listener=(event:Event)=>{
      const detail=(event as CustomEvent<{id?:string}>).detail;
      if(typeof detail?.id==='string'||detail?.id===null)setSelectedChannelId(detail.id);
    };
    window.addEventListener('uorqui:channel-selected',listener);
    return()=>window.removeEventListener('uorqui:channel-selected',listener);
  },[]);
  const createCommunity=useCallback(()=>{
    setChannelPanelOpen(true);
    move('communities');
    window.dispatchEvent(new Event('uorqui:create-community'));
  },[move]);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(()=>{
    try{return localStorage.getItem('uorqui:sidebar-collapsed:v1')==='1';}catch{return false;}
  });
  useEffect(()=>{
    try{localStorage.setItem('uorqui:sidebar-collapsed:v1',sidebarCollapsed?'1':'0');}catch{}
  },[sidebarCollapsed]);
  const [navDirection,setNavDirection]=useState<1|-1>(1);
  const previousArea=useRef<Area>(area);
  useEffect(()=>{previousArea.current=area;},[area]);
  const activeLabel=area==='profile'?'Perfil':area==='moderation'?(locale==='pt-BR'?'Moderação':'Moderation'):
    navigation.find(item=>item.id===area)?.label??'Comunidades';
  const commands:WorkspaceCommand[] = [
    ...navigation.map(item => ({
      id: item.id, label: t(item.label), hint: locale==='pt-BR'?'Módulo principal':'Main module',
      type: 'module' as const, run: () => move(item.id),
    })),
    { id: 'profile', label: t('Perfil'), hint: locale==='pt-BR'?'Sua conta':'Your account',
      type: 'module' as const, run: () => move('profile') },
    ...workspaceCommunities.map(item => ({
      id: 'community:' + item.id, label: item.name,
      hint: locale==='pt-BR'?'Comunidade':'Community', type: 'community' as const,
      run: () => openDiscoveryCommunity(item.id),
    })),
  ];
  const showSubpage = (area === 'conversations' && conversationOpened) || (area === 'communities' && channelOpened);

  return (
    <div data-uorqui-app-shell data-uorqui-channel-panel-open={channelPanelOpen?'true':'false'} data-uorqui-sidebar-mode={sidebarCollapsed?'collapsed':'expanded'} className="fixed inset-x-0 top-[var(--uorqui-app-top,0px)] flex h-[var(--uorqui-app-height,100dvh)] min-h-0 w-full overflow-hidden overscroll-none bg-background text-foreground">
      <aside data-uorqui-dashboard-sidebar
        className={cn('hidden h-full min-h-0 shrink-0 flex-col overflow-hidden bg-muted/50 transition-[width] duration-200 ease-out md:flex',sidebarCollapsed?'w-16':'w-64')}>
        <div className={cn('flex h-15 shrink-0 items-center',sidebarCollapsed?'justify-center px-2':'gap-2 px-4')}>
          <button type="button" onClick={()=>move('communities')}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-ring"
            aria-label={t('Uorqui — ir para o início')}>
            <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-card text-[11px] font-bold tracking-tight text-foreground">U</span>
            {!sidebarCollapsed&&<><UorquiWordmark className="h-[17px] w-auto max-w-[120px] text-foreground"/><ChevronDown className="size-3.5 shrink-0 text-muted-foreground"/></>}
          </button>
          {!sidebarCollapsed&&<div className="flex shrink-0 items-center gap-0.5">
            <button type="button" onClick={()=>setCommandOpen(true)}
              title={locale==='pt-BR'?'Buscar':'Search'} aria-label={locale==='pt-BR'?'Buscar':'Search'}
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
              <Search className="size-4"/>
            </button>
            <button type="button" onClick={createCommunity}
              title={locale==='pt-BR'?'Nova comunidade':'New community'}
              aria-label={locale==='pt-BR'?'Criar comunidade':'Create community'}
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
              <Plus className="size-4"/>
            </button>
          </div>}
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-3 pb-3 pt-1" aria-label={t('Navegação principal')}>
          {sidebarCollapsed&&<button type="button" aria-label={locale==='pt-BR'?'Abrir busca':'Open search'}
            title={locale==='pt-BR'?'Buscar':'Search'} onClick={()=>setCommandOpen(true)}
            className="mb-2 grid h-9 w-full place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <Search className="size-4"/>
          </button>}
          {navigation.filter(item=>item.id==='conversations'||item.id==='notifications').map(item=>{
            const Icon=item.icon;
            const badge=item.id==='conversations'?unreadMessageCount:activity.unread;
            return <Button key={item.id} type="button" size="sm" variant="ghost"
              data-uorqui-tour-target={item.id} title={sidebarCollapsed?t(item.label):undefined}
              aria-current={area===item.id?'page':undefined}
              aria-label={t(item.label)+(badge?' · '+badge:'')} onClick={()=>move(item.id)}
              className={cn('uorqui-sidebar-item relative h-8 w-full rounded-md text-[13px] font-medium',
                sidebarCollapsed?'justify-center px-1':'justify-start gap-3 px-2.5')}>
              <Icon aria-hidden="true" className="size-4 shrink-0"/>
              {!sidebarCollapsed&&<span className="truncate">{t(item.label)}</span>}
              {badge>0&&<span aria-hidden="true" className={cn('grid min-h-4 min-w-4 place-items-center rounded bg-muted px-1 text-[10px] font-medium',sidebarCollapsed?'absolute -right-1 -top-1':'ml-auto')}>{badge>99?'99+':badge}</span>}
            </Button>;
          })}
          {!sidebarCollapsed&&<div className="mb-2 mt-4 flex items-center justify-between px-2.5">
            <span className="text-[12px] font-medium text-muted-foreground">{locale==='pt-BR'?'Espaço de trabalho':'Workspace'}</span>
            <ChevronDown className="size-3.5 text-muted-foreground"/>
          </div>}
          {navigation.filter(item=>item.id==='communities'||item.id==='discover').map(item=>{
            const Icon=item.icon;
            const badge=item.id==='communities'?communityUnread.total:0;
            return <Button key={item.id} type="button" size="sm" variant="ghost"
              data-uorqui-tour-target={item.id} title={sidebarCollapsed?t(item.label):undefined}
              aria-current={area===item.id?'page':undefined}
              aria-label={t(item.label)+(badge?' · '+badge:'')} onClick={()=>move(item.id)}
              className={cn('uorqui-sidebar-item relative h-8 w-full rounded-md text-[13px] font-medium',
                sidebarCollapsed?'justify-center px-1':'justify-start gap-3 px-2.5')}>
              <Icon aria-hidden="true" className="size-4 shrink-0"/>
              {!sidebarCollapsed&&<span className="truncate">{t(item.label)}</span>}
              {badge>0&&<span aria-hidden="true" className={cn('grid min-h-4 min-w-4 place-items-center rounded bg-muted px-1 text-[10px] font-medium',sidebarCollapsed?'absolute -right-1 -top-1':'ml-auto')}>{badge>99?'99+':badge}</span>}
            </Button>;
          })}
          {!sidebarCollapsed&&<section className="mt-5" aria-label={locale==='pt-BR'?'Suas comunidades':'Your communities'}>
            <div className="mb-1 flex items-center justify-between gap-2 px-2.5">
              <h2 className="text-[12px] font-medium text-muted-foreground">{locale==='pt-BR'?'Suas comunidades':'Your communities'}</h2>
              <button type="button" onClick={createCommunity}
                title={locale==='pt-BR'?'Nova comunidade':'New community'}
                aria-label={locale==='pt-BR'?'Criar comunidade':'Create community'}
                className="grid size-5 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                <Plus className="size-3.5"/>
              </button>
            </div>
            <WorkspaceCommunityShortcuts communities={workspaceCommunities}
              unread={communityUnread.communities} channelUnread={communityUnread.channels}
              selectedId={selectedCommunityId} selectedChannelId={selectedChannelId}
              active={area==='communities'} onOpen={communityId=>{setChannelPanelOpen(false);openDiscoveryCommunity(communityId);}}
              onOpenChannel={(communityId,channelId)=>{setChannelPanelOpen(false);openDiscoveryCommunity(communityId,channelId);}}
              locale={locale}/>
          </section>}
          {platformModerator&&<div className="mt-4">
            {!sidebarCollapsed&&<p className="mb-1 px-2.5 text-[12px] font-medium text-muted-foreground">{locale==='pt-BR'?'Administração':'Administration'}</p>}
            <Button type="button" size="sm" variant="ghost"
              aria-current={area==='moderation'?'page':undefined}
              title={sidebarCollapsed?(locale==='pt-BR'?'Moderação':'Moderation'):undefined}
              onClick={()=>move('moderation')}
              className={cn('uorqui-sidebar-item h-8 w-full rounded-md text-[13px]',sidebarCollapsed?'justify-center px-1':'justify-start gap-3 px-2.5')}>
              <ShieldCheck className="size-4 shrink-0"/>{!sidebarCollapsed&&(locale==='pt-BR'?'Moderação':'Moderation')}
            </Button>
          </div>}
          <div className="mt-auto pt-4">
            <Button type="button" size="sm" variant="ghost" onClick={()=>move('profile')}
              title={sidebarCollapsed?t('Perfil'):undefined} aria-current={area==='profile'?'page':undefined}
              className={cn('uorqui-sidebar-item h-8 w-full rounded-md text-[13px]',sidebarCollapsed?'justify-center px-1':'justify-start gap-3 px-2.5')}>
              <Settings2 className="size-4"/>{!sidebarCollapsed&&(locale==='pt-BR'?'Configurações':'Settings')}
            </Button>
          </div>
        </nav>

        <div className="flex shrink-0 flex-col px-3 pb-3 pt-2">
          <button type="button" onClick={()=>move('profile')} title={sidebarCollapsed?t('Abrir meu perfil'):undefined}
            aria-label={t('Abrir meu perfil')} className={cn('flex w-full min-w-0 items-center rounded-md py-1.5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',sidebarCollapsed?'justify-center px-0':'gap-2 px-2')}>
            <ProfileAvatar name={account.profile?.displayName??account.user.name} image={account.profile?.avatarUrl} className="size-7"/>
            {!sidebarCollapsed&&<span className="min-w-0"><span className="block truncate text-[12px] font-semibold">{account.profile?.displayName??account.user.name}</span><span className="block truncate text-[11px] text-muted-foreground">{account.profile?'@'+account.profile.handle:t('Conta Uorqui')}</span></span>}
          </button>
        </div>
      </aside>

      <div data-uorqui-inset-panel className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card md:my-2 md:mr-2 md:h-auto md:rounded-2xl md:border md:border-border md:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <header data-uorqui-main-header className="relative z-30 flex h-[calc(4rem+env(safe-area-inset-top))] min-h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-center justify-between border-b border-border bg-card px-4 pt-[env(safe-area-inset-top)] sm:px-5 md:h-13 md:min-h-13 md:pt-0">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => move('communities')} aria-label={t('Uorqui — voltar ao início')} className="flex shrink-0 items-center gap-1.5 text-xl font-bold tracking-tight focus-visible:rounded focus-visible:outline-2 focus-visible:outline-ring md:hidden">
              <UorquiWordmark className="h-4 w-auto max-w-[34vw] text-foreground" />
              <BetaBadge compact />
            </button>
            <button type="button" className="hidden size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring md:grid"
              title={sidebarCollapsed?(locale==='pt-BR'?'Expandir menu':'Expand sidebar'):(locale==='pt-BR'?'Recolher menu':'Collapse sidebar')}
              aria-label={sidebarCollapsed?(locale==='pt-BR'?'Expandir menu':'Expand sidebar'):(locale==='pt-BR'?'Recolher menu':'Collapse sidebar')}
              aria-expanded={!sidebarCollapsed} onClick={()=>setSidebarCollapsed(old=>!old)}>
              {sidebarCollapsed?<PanelLeftOpen className="size-4"/>:<PanelLeftClose className="size-4"/>}
            </button>
            <div className="hidden min-w-0 items-center gap-2 text-xs md:flex">
              <span className="text-muted-foreground">Uorqui</span>
              <ChevronRight className="size-3.5 text-muted-foreground"/>
              <span className="truncate text-[13px] font-medium text-foreground">{t(activeLabel)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {area==='communities'&&<button type="button" onClick={()=>setChannelPanelOpen(old=>!old)}
              aria-pressed={channelPanelOpen}
              aria-label={locale==='pt-BR'?'Mostrar ou ocultar painel de canais':'Toggle channel panel'}
              title={locale==='pt-BR'?'Painel de canais':'Channel panel'}
              className="hidden size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground md:flex">
              <PanelRightOpen className="size-4"/>
            </button>}
            <button type="button" onClick={()=>setCommandOpen(true)}
              aria-label={locale==='pt-BR'?'Buscar no Uorqui':'Search Uorqui'}
              title={locale==='pt-BR'?'Buscar no Uorqui':'Search Uorqui'}
              className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
              <Search className="size-[18px]"/>
            </button>
             <PreferencesControls />
            <button type="button" onClick={() => move('profile')} aria-label={t('Abrir meu perfil')} title={t("Meu perfil")} className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <ProfileAvatar name={account.profile?.displayName ?? account.user.name} image={account.profile?.avatarUrl} className="size-8" />
            </button>
          </div>
        </header>

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="h-full min-h-0 overflow-hidden">
            <div hidden={area!=='discover'} data-uorqui-panel={area==='discover'?'active':'inactive'} data-direction={navDirection} className="h-full min-h-0">
              <DiscoverHome active={area==='discover'} unreadLocations={communityUnread.locations}
                onOpenCommunity={openDiscoveryCommunity}/>
            </div>
            {/* A persistent mount keeps the microphone, signaling and room state alive
                when switching between Discover, Messages, Profile and Communities. */}
            <div hidden={area!=='communities'} data-uorqui-panel={area==='communities'?'active':'inactive'} data-direction={navDirection} className="h-full min-h-0">
              <LiveCommunities myId={account.user.id} active={area==='communities'}
                onMobileOpenChange={setChannelOpened} onRestoreNavigation={()=>move('communities')}
                initialCommunityId={invitedCommunityId}
                unreadChannels={communityUnread.channels} unreadCommunities={communityUnread.communities}
                unreadLocations={communityUnread.locations}/>
            </div>
            {area!=='discover'&&area!=='communities'&&<motion.div key={area} data-uorqui-motion-panel initial={{opacity:0,x:navDirection*14}} animate={{opacity:1,x:0}}
              transition={{duration:0.18,ease:[0.22,1,0.36,1]}} className="h-full min-h-0 overflow-hidden">
            {area === 'conversations' && (
              <LiveDirectChat myId={account.user.id} initialHandle={requestedChatHandle} initialConversationId={requestedConversationId}
                onMobileOpenChange={setConversationOpened}
                onStarted={() => setRequestedChatHandle(null)} />
            )}

            {area==='notifications'&&<ActivityNotifications accountId={account.user.id}
              items={activity.items} unread={activity.unread} loading={activity.loading}
              error={activity.error} onRefresh={()=>void activity.refresh()}
              onReadAll={activity.markAllRead} onDelete={activity.remove} onOpen={openActivity}/>}
            {area === 'moderation' && platformModerator === null && <div className="grid h-full place-items-center"><Spinner /></div>}
            {area === 'moderation' && platformModerator && <ModerationPanel locale={locale}/>}
            {area === 'profile' && account.profile && (
              <ScrollArea className="h-full">
                <div className="mx-auto flex w-full max-w-3xl justify-end gap-2 px-4 pt-4 sm:px-7">
                  {platformModerator&&<Button type="button" variant="outline" onClick={()=>move('moderation')}
                    className="min-h-11 gap-2"><ShieldCheck className="size-4"/>{locale==='pt-BR'?'Moderação':'Moderation'}</Button>}
                  <Button type="button" variant="outline" onClick={()=>setLogoutConfirm(true)}
                    disabled={loggingOut} aria-label={t('Sair da conta')}
                    className="min-h-11 gap-2 rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10">
                    <LogOut className="size-4"/>{t('Sair da conta')}
                  </Button>
                </div>
                <ProfileEditor initial={account.profile} onSaved={profile => onAccountUpdate({ ...account, profile })} />
                <nav className="mx-auto mb-10 flex max-w-3xl flex-wrap justify-center gap-4 border-t border-border px-4 pt-5 text-xs text-primary sm:gap-6"
                  aria-label={locale==='pt-BR'?'Documentos legais':'Legal documents'}>
                  <a href="/termos" target="_blank" rel="noopener noreferrer" className="underline">{locale==='pt-BR'?'Termos de Uso':'Terms of Use'}</a>
                  <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline">{locale==='pt-BR'?'Privacidade / LGPD':'Privacy / LGPD'}</a>
                  <a href="/cookies" target="_blank" rel="noopener noreferrer" className="underline">{locale==='pt-BR'?'Política de Cookies':'Cookie Policy'}</a>
                </nav>
              </ScrollArea>
            )}
            </motion.div>}
          </div>
        </div>

        {logoutError && <div role="alert" className="border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-foreground">{logoutError}</div>}
        {logoutConfirm&&<div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="logout-confirm-title"
            className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-5 shadow-2xl">
            <h2 id="logout-confirm-title" className="text-lg font-semibold">{locale==='pt-BR'?'Sair da conta?':'Sign out?'}</h2>
            <p className="text-sm text-muted-foreground">{locale==='pt-BR'?'Você poderá entrar novamente quando quiser.':'You can sign back in at any time.'}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={loggingOut} onClick={()=>setLogoutConfirm(false)}>
                {locale==='pt-BR'?'Cancelar':'Cancel'}</Button>
              <Button type="button" disabled={loggingOut} onClick={()=>void logout()} className="gap-2">
                {loggingOut?<Spinner className="size-4"/>:<LogOut className="size-4"/>}
                {loggingOut?(locale==='pt-BR'?'Saindo…':'Signing out…'):t('Sair da conta')}
              </Button>
            </div>
          </section>
        </div>}

        {!showSubpage && <nav className="flex shrink-0 justify-around border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] md:hidden" aria-label={t("Navegação principal")}>
          {navigation.map(item => {
            const Icon = item.icon;
            return <Button data-uorqui-tour-target={item.id} key={item.id} variant="ghost" onClick={() => move(item.id)} aria-current={area === item.id ? 'page' : undefined} className={cn('flex h-16 min-w-0 flex-1 flex-col gap-1 rounded-none px-1 text-[11px] font-medium', area === item.id ? 'text-primary' : 'text-muted-foreground')}
              aria-label={item.id === 'conversations' && unreadMessageCount ? t(item.label) + ': ' + unreadMessageCount + (locale === 'pt-BR' ? ' mensagens não lidas' : ' unread messages') : t(item.label)}>
              <span className="relative inline-flex">
                <Icon aria-hidden="true" className="size-5" />
                {item.id === 'conversations' && unreadMessageCount > 0 && <span aria-hidden="true"
                  className="absolute -right-3 -top-2 grid min-h-4 min-w-4 place-items-center rounded-full bg-destructive px-0.5 text-[9px] font-bold leading-none text-white">{unreadLabel}</span>}
                {item.id === 'communities' && communityUnread.total>0 && <span aria-hidden="true"
                  className="absolute -right-3 -top-2 grid min-h-4 min-w-4 place-items-center rounded-full bg-destructive px-0.5 text-[9px] font-bold leading-none text-white">{communityUnreadLabel}</span>}
                {item.id==='notifications'&&activity.unread>0&&<span aria-hidden="true" className="absolute -right-3 -top-2 grid min-h-4 min-w-4 place-items-center rounded-full bg-destructive px-0.5 text-[9px] font-bold leading-none text-white">{activity.unread>99?'99+':activity.unread}</span>}
              </span>{t(item.label)}
            </Button>;
          })}
        </nav>}
      </div>
      <WorkspaceCommandPalette open={commandOpen} onOpenChange={setCommandOpen}
        commands={commands} locale={locale}/>
      {!tourVisible&&<PwaFirstRun accountId={account.user.id}/>}
      {tourVisible&&account.profile&&<OnboardingTour userId={account.user.id} profile={account.profile}
        onNavigate={move}
        onProfileSaved={next=>onAccountUpdate({...account,profile:next})}
        onFinish={()=>{setTourVisible(false);move('communities');}}/>}
    </div>
  );
}
