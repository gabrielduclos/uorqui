import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Bell, Compass, Mail, LogOut, Menu, MessageCircle, PanelLeftClose, PanelLeftOpen, Plus, Search, ShieldCheck, Users, X,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { WorkspaceContentLoading } from './ui-kit/WorkspaceContentLoading';
import { cn } from '@/lib/utils';
import { PreferencesControls } from './PreferencesControls';
import { UorquiWordmark } from './UorquiWordmark';
import { useUorquiPreferences } from './UorquiPreferences';
import { useVisualViewportFrame } from './useVisualViewportFrame';
import { ProfileEditor, type UserProfileData } from './UserProfiles';
import { useCachedProfileImage } from './profileImageCache';
import LiveDirectChat from './LiveDirectChat';
import { FriendsPanel } from './FriendsPanel';
import LiveCommunities from './LiveCommunities';
import EmailInbox from './EmailInbox';
import ModerationPanel from './ModerationPanel';
import { useUnreadDirectMessages } from './useUnreadDirectMessages';
import { startDmOutbox } from './dmOutbox';
import { clearDmAccount } from './dmCache';
import { resetDmInboxSession } from './dmEventStream';
import { clearChatMediaCache } from './chatMediaCache';
import { clearCommunityMessageCache } from './communityMessageCache';
import {useCommunityUnread} from './useCommunityUnread';
import { useWorkspaceCommunities } from './WorkspaceCommunities';
import { UIKitSectionHeading, UIKitCount } from './ui-kit/components';
import { WorkspaceCommandPalette, type WorkspaceCommand } from './WorkspaceCommandPalette';
import {OnboardingTour,onboardingStorageKey} from './OnboardingTour';
import {PwaFirstRun} from './PwaFirstRun';
import {ActivityNotifications} from './ActivityNotifications';
import {useActivityNotifications,type ActivityNotification} from './useActivityNotifications';
import type {ReadPushTarget} from './readPushNotifications';
import {subscribeDmStream} from './dmEventStream';

export type SignedInAccount = {
  user: { id: string; name: string; email: string };
  profile: UserProfileData | null;
};
type Area = 'email' | 'conversations' | 'contacts' | 'communities' | 'notifications' | 'profile' | 'moderation';
type InAppNotice = {id:string;key:string;title:string;body:string;url:string};
type AppBadgeNavigator = Navigator & {
  setAppBadge?: (count:number)=>Promise<void>;
  clearAppBadge?: ()=>Promise<void>;
};
/** PWA icon count is native to supported installed web apps. No custom icon asset
 * or per-page badge artwork is generated. */
function updatePwaAppBadge(count:number){
  if(!window.isSecureContext)return;
  const browser=navigator as AppBadgeNavigator;
  try{
    const result=count>0?browser.setAppBadge?.(Math.min(9999,Math.floor(count))):
      browser.clearAppBadge?.();
    void result?.catch(()=>{/* Permission and platform support vary. */});
  }catch{/* A missing native badging API must never break the workspace. */}
}
const validUuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const mailMessageId=/^[A-Za-z0-9_=+\/\-]{1,1024}$/;

// Remember the last main app module per account on this device. Direct links
// and invitations remain authoritative over the restored selection.
const rememberedAreas: readonly Area[] = ['email', 'conversations', 'communities', 'notifications', 'profile', 'moderation'];
const lastAreaKey = (userId: string) => 'uorqui:last-area:v1:' + userId;
function readLastArea(userId: string): Area {
  try {
    const value = localStorage.getItem(lastAreaKey(userId));
    if (new URLSearchParams(window.location.search).has('mail') || new URLSearchParams(window.location.search).has('mailAccount')) return 'email';
    // Contacts now live under Messages; recover older saved navigation safely.
    if(value==='contacts')return 'conversations';
    return rememberedAreas.find(area => area === value) ?? 'conversations';
  } catch {
    return 'conversations';
  }
}

const WORKSPACE_PAGE_MOTION = { duration: 0.18, ease: [0.22, 1, 0.36, 1] as [number,number,number,number] };

// The same alphabetical order is used in the desktop sidebar and mobile menu.
const navigation = [
  { id: 'communities', label: 'Comunidades', icon: Users },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'conversations', label: 'Mensagens', icon: MessageCircle },
  { id: 'notifications', label: 'Notificações', icon: Bell },
] as const;

function CommunityRailPicture({url,name}:{url:string|null;name:string}) {
  const cached=useCachedProfileImage(url);
  return <span aria-hidden="true" className="uorqui-kit-community-picture">
    {cached?<img src={cached} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"/>:
      <span>{name.trim().charAt(0).toUpperCase()||'C'}</span>}
  </span>;
}

function ProfileAvatar({ name, image, className }: { name: string; image?: string | null; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'U';
  const source = useCachedProfileImage(image);
  return <Avatar className={cn('size-9', className)}>{source && <AvatarImage src={source} alt={name} referrerPolicy="no-referrer" className="object-cover" />}<AvatarFallback className="bg-primary/20 font-semibold text-primary">{initials}</AvatarFallback></Avatar>;
}

export default function SocialShell({ account, onLogout, onAccountDeleted, onAccountUpdate, invitedCommunityId, deferOnboarding = false }: {
  account: SignedInAccount;
  onLogout: () => Promise<void>;
  onAccountDeleted: () => Promise<void>;
  onAccountUpdate: (next: SignedInAccount) => void;
  invitedCommunityId?: string | null;
  deferOnboarding?: boolean;
}) {
  const { t, locale } = useUorquiPreferences();
  useVisualViewportFrame();
  const [area, setArea] = useState<Area>(() => readLastArea(account.user.id));
  // Remember the module beneath Notifications so tapping its bell a second
  // time returns to the exact module instead of restarting at the home screen.
  const notificationReturnArea=useRef<Area>(area==='notifications'?'conversations':area);
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
  const [mobileMenuOpen,setMobileMenuOpen] = useState(false);
  useEffect(()=>{
    if(!mobileMenuOpen)return;
    const handle=(event:KeyboardEvent)=>{if(event.key==='Escape')setMobileMenuOpen(false);};
    window.addEventListener('keydown',handle);
    return()=>window.removeEventListener('keydown',handle);
  },[mobileMenuOpen]);
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
  const [unreadMailCount,setUnreadMailCount]=useState(0);
  useEffect(()=>{
    let active=true;
    // Ignore a request started before a local read/move and stale out-of-order
    // responses from older refresh calls. Otherwise the badge jumps back up.
    let requestVersion=0;
    const refresh=async()=>{
      const version=++requestVersion;
      try{
        const response=await fetch('/api/v1/mail/unread',{credentials:'same-origin',cache:'no-store'});
        if(!response.ok)return;
        const data=await response.json() as {unreadCount:number};
        if(active&&version===requestVersion&&Number.isFinite(data.unreadCount))
          setUnreadMailCount(Math.max(0,Math.floor(data.unreadCount)));
      }catch{/* Mail is optional; a failed provider check must not break the main menu. */}
    };
    const delta=(event:Event)=>{
      const amount=Number((event as CustomEvent<{amount?:number}>).detail?.amount);
      if(Number.isFinite(amount)&&amount>0){
        ++requestVersion;
        setUnreadMailCount(previous=>Math.max(0,previous-amount));
      }
    };
    const focus=()=>{if(document.visibilityState==='visible')void refresh();};
    void refresh();
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},90_000);
    window.addEventListener('uorqui:mail-unread-refresh',refresh);
    window.addEventListener('uorqui:mail-unread-delta',delta);
    document.addEventListener('visibilitychange',focus);
    return()=>{
      active=false;window.clearInterval(timer);
      window.removeEventListener('uorqui:mail-unread-refresh',refresh);
      window.removeEventListener('uorqui:mail-unread-delta',delta);
      document.removeEventListener('visibilitychange',focus);
    };
  },[account.user.id]);
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
      notificationReturnArea.current='conversations';
      setArea(readLastArea(account.user.id));
      return;
    }
    // Tour steps navigate automatically and must not overwrite this preference.
    if (tourVisible) return;
    try { localStorage.setItem(lastAreaKey(account.user.id), area==='contacts'?'conversations':area); }
    catch { /* Private browsing or blocked storage: keep normal navigation. */ }
  }, [area, account.user.id, tourVisible]);
  const communityUnreadCount = Object.values(communityUnread.communities).reduce((sum, count) => sum + count, 0);
  // Count unread channel locations once per channel, not once per message.
  const notificationBadgeCount = activity.unread + communityUnread.locations.length + communityUnread.invites.length;
  // One total shared across messages, community channels, invitations, activity
  // and ALL connected mailboxes. Recalculate when any unread source changes.
  const pwaUnreadCount=Math.max(0,unreadMessageCount)+
    Math.max(0,communityUnread.total)+communityUnread.invites.length+
    Math.max(0,activity.unread)+Math.max(0,unreadMailCount);
  useEffect(()=>{updatePwaAppBadge(pwaUnreadCount);},[account.user.id,pwaUnreadCount]);
  const [requestedChatHandle, setRequestedChatHandle] = useState<string | null>(null);
  const [requestedConversation,setRequestedConversation]=useState<{id:string;nonce:number}|null>(null);
  const [requestedCommunity,setRequestedCommunity]=useState<{communityId:string;channelId:string|null;nonce:number}|null>(null);
  const [requestedActivity,setRequestedActivity]=useState<{id:string;nonce:number}|null>(null);
  const navigationNonce=useRef(0);
  const [inAppNotices,setInAppNotices]=useState<InAppNotice[]>([]);
  const noticeTimers=useRef(new Map<string,number>());
  const noticeDedupe=useRef(new Map<string,number>());
  const currentArea=useRef<Area>(area);
  useEffect(()=>{currentArea.current=area;},[area]);
  const [, setConversationOpened] = useState(false);
  const [channelOpened, setChannelOpened] = useState(false);
  const [, setEmailOpened] = useState(false);
  const [mailDeepLink,setMailDeepLink]=useState<{accountId:string;messageId:string;nonce:number}|null>(null);
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
    const order:Area[]=['communities','contacts','email','conversations','notifications','profile','moderation'];
    if(next==='notifications'&&previousArea.current!=='notifications')
      notificationReturnArea.current=previousArea.current;
    setNavDirection(order.indexOf(next)>=order.indexOf(previousArea.current)?1:-1);
    previousArea.current=next;
    setArea(next);
    setConversationOpened(false);
    setEmailOpened(false);
    setMobileMenuOpen(false);
    // Communities remain mounted to preserve any ongoing WebRTC voice call.
  }, []);
  const tourNavigate=useCallback((tab:'email'|'conversations'|'communities')=>{
    move(tab);
    if(window.matchMedia('(max-width: 767px)').matches)setMobileMenuOpen(true);
  },[move]);
  const toggleNotifications=()=>{
    if(area==='notifications')move(notificationReturnArea.current==='notifications'?'conversations':notificationReturnArea.current);
    else move('notifications');
  };
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


  /** One navigation entry point for system notifications and in-app alerts.
   * Stable URLs also work when the PWA is cold-started from an OS notification. */
  const openPushDestination=useCallback((urlValue:string)=>{
    let url:URL;
    try{url=new URL(urlValue,window.location.origin);}catch{return;}
    if(url.origin!==window.location.origin||url.pathname!=='/')return;
    const params=url.searchParams;
    const id=params.get('conversation');
    const community=params.get('community');
    const channel=params.get('channel');
    const notification=params.get('notification');
    const invited=params.get('communityInvite');
    const mailAccount=params.get('mailAccount');
    const mailMessage=params.get('mailMessage');
    if(mailAccount&&validUuid.test(mailAccount)&&mailMessage&&mailMessageId.test(mailMessage)){
      setMailDeepLink({accountId:mailAccount,messageId:mailMessage,nonce:++navigationNonce.current});
      move('email');
    }else if(id&&validUuid.test(id)){
      setRequestedConversation({id,nonce:++navigationNonce.current});
      move('conversations');
    }else if(community&&validUuid.test(community)){
      setRequestedCommunity({communityId:community,channelId:channel&&validUuid.test(channel)?channel:null,
        nonce:++navigationNonce.current});
      move('communities');
    }else if(notification&&validUuid.test(notification)){
      setRequestedActivity({id:notification,nonce:++navigationNonce.current});
      move('notifications');
      window.dispatchEvent(new Event('uorqui:activity-update'));
    }else if(invited&&validUuid.test(invited)){
      move('notifications');
      window.dispatchEvent(new Event('uorqui:community-push-update'));
    }else if(params.has('mailInbox')){
      move('email');
    }
  },[move]);

  const dismissNotice=useCallback((id:string)=>{
    const timer=noticeTimers.current.get(id);
    if(timer!==undefined)window.clearTimeout(timer);
    noticeTimers.current.delete(id);
    setInAppNotices(old=>old.filter(item=>item.id!==id));
  },[]);
  const showNotice=useCallback((key:string,title:string,body:string,url:string,destination:Area)=>{
    if(document.visibilityState!=='visible'||currentArea.current===destination)return;
    const now=Date.now();
    if(now-(noticeDedupe.current.get(key)??0)<12_000)return;
    noticeDedupe.current.set(key,now);
    if(noticeDedupe.current.size>100)
      for(const [id,at] of noticeDedupe.current)if(now-at>30_000)noticeDedupe.current.delete(id);
    const id=key+':'+now;
    setInAppNotices(old=>[...old.slice(-2),{id,key,title:title.slice(0,100),body:body.slice(0,180),url}]);
    const timer=window.setTimeout(()=>dismissNotice(id),6500);
    noticeTimers.current.set(id,timer);
  },[dismissNotice]);
  // A confirmed read also retracts any matching foreground toast. Keep each
  // notification's link (not its title) as the source of destination identity.
  useEffect(()=>{
    const onRead=(event:Event)=>{
      const targets=(event as CustomEvent<ReadPushTarget[]>).detail;
      if(!Array.isArray(targets)||!targets.length)return;
      setInAppNotices(old=>old.filter(notice=>{
        let params:URLSearchParams;
        try{params=new URL(notice.url,window.location.origin).searchParams;}catch{return true;}
        const matched=targets.some(target=>
          target.kind==='dm'?params.get('conversation')===target.conversationId:
          target.kind==='community'?params.get('channel')===target.channelId:
          target.kind==='community-invite'?params.get('communityInvite')===target.communityId:
          target.kind==='mail'?params.get('mailAccount')===target.accountId&&params.get('mailMessage')===target.messageId:
          target.kind==='activity'?params.get('notification')===target.notificationId:
          target.kind==='activity-all'?params.has('notification'):false);
        if(matched){
          const timer=noticeTimers.current.get(notice.id);
          if(timer!==undefined)window.clearTimeout(timer);
          noticeTimers.current.delete(notice.id);
        }
        return !matched;
      }));
    };
    window.addEventListener('uorqui:push-read',onRead);
    return()=>window.removeEventListener('uorqui:push-read',onRead);
  },[]);
  useEffect(()=>()=>{
    noticeTimers.current.forEach(timer=>window.clearTimeout(timer));
    noticeTimers.current.clear();
  },[account.user.id]);

  useEffect(()=>{
    const onMessage=(event:MessageEvent)=>{
      const data=event.data as {type?:string;recipientId?:string;kind?:string;title?:string;body?:string;url?:string;
        messageId?:string;channelId?:string;notificationId?:string}|null;
      if(data?.type==='uorqui:push-open'&&typeof data.url==='string')openPushDestination(data.url);
      if(data?.type==='uorqui:activity-update')window.dispatchEvent(new Event('uorqui:activity-update'));
      if(data?.type==='uorqui:community-push-update')window.dispatchEvent(new Event('uorqui:community-push-update'));
      if(data?.type==='uorqui:mail-push-update')window.dispatchEvent(new Event('uorqui:mail-unread-refresh'));
      if(data?.type!=='uorqui:foreground-push'||data.recipientId!==account.user.id||
        typeof data.url!=='string'||typeof data.kind!=='string')return;
      const destination:Area = data.kind==='dm'?'conversations':
        data.kind==='community'?'communities':data.kind==='mail'?'email':'notifications';
      const key=data.kind==='dm'?'dm:'+(data.messageId||data.url):
        data.kind==='community'?'community:'+(data.channelId||data.url):
        data.kind==='mail'?'mail:'+(data.messageId||data.url):
        data.kind==='activity'?'activity:'+(data.notificationId||data.url):data.kind+':'+data.url;
      showNotice(key,data.title||'Uorqui',data.body||'Nova notificação',data.url,destination);
    };
    navigator.serviceWorker?.addEventListener('message',onMessage);
    // A service-worker click can reuse an already-running tab without remounting
    // React. Consume the target on activation/history updates as well as startup.
    const consumeLocation=()=>{
      const current=new URL(window.location.href);
      if(!['conversation','community','notification','mailAccount','communityInvite','mailInbox']
        .some(key=>current.searchParams.has(key)))return;
      const destination=current.toString();
      for(const key of ['conversation','community','channel','notification','mailAccount','mailMessage','communityInvite','mailInbox'])
        current.searchParams.delete(key);
      window.history.replaceState({},'',current.pathname+current.search+current.hash);
      openPushDestination(destination);
    };
    consumeLocation();
    const visible=()=>{if(document.visibilityState==='visible')consumeLocation();};
    const pending=(event:Event)=>{const target=(event as CustomEvent<string>).detail;
      if(typeof target==='string')openPushDestination(target);};
    window.addEventListener('uorqui:open-notification-destination',pending);
    window.addEventListener('popstate',consumeLocation);
    window.addEventListener('pageshow',consumeLocation);
    window.addEventListener('focus',consumeLocation);
    document.addEventListener('visibilitychange',visible);
    return()=>{
      navigator.serviceWorker?.removeEventListener('message',onMessage);
      window.removeEventListener('uorqui:open-notification-destination',pending);
      window.removeEventListener('popstate',consumeLocation);
      window.removeEventListener('pageshow',consumeLocation);
      window.removeEventListener('focus',consumeLocation);
      document.removeEventListener('visibilitychange',visible);
    };
  },[openPushDestination,showNotice,account.user.id]);

  // DM SSE is also active when the user has not allowed operating-system push.
  useEffect(()=>subscribeDmStream(event=>{
    if(event.kind!=='message'||!event.message||event.message.authorId===account.user.id)return;
    const conversationId=event.conversationId;
    if(validUuid.test(conversationId))
      showNotice('dm:'+event.message.id,
        locale==='pt-BR'?'Nova mensagem privada':'New direct message',
        locale==='pt-BR'?'Você recebeu uma mensagem.':'You received a message.',
        '/?conversation='+encodeURIComponent(conversationId),'conversations');
  }),[account.user.id,locale,showNotice]);

  const communityBaseline=useRef<{channels:Record<string,number>;invites:string[]}|null>(null);
  useEffect(()=>{
    if(!communityUnread.initialized)return;
    const current={channels:communityUnread.channels,invites:communityUnread.invites.map(item=>item.communityId)};
    const previous=communityBaseline.current;
    communityBaseline.current=current;
    if(!previous)return;
    if(currentArea.current!=='communities'){
      for(const location of communityUnread.locations){
        const before=previous.channels[location.channelId]??0;
        if(location.count>before){
          showNotice('community:'+location.channelId,
            locale==='pt-BR'?'Nova mensagem em comunidade':'New community message',
            location.communityName+' · #'+location.channelName,
            '/?community='+encodeURIComponent(location.communityId)+'&channel='+encodeURIComponent(location.channelId),
            'communities');
          break; // One compact toast per incoming batch.
        }
      }
    }
    if(currentArea.current!=='notifications'){
      for(const invite of communityUnread.invites){
        if(!previous.invites.includes(invite.communityId)){
          showNotice('invite:'+invite.communityId,
            locale==='pt-BR'?'Convite para comunidade':'Community invitation',
            invite.communityName,'/?communityInvite='+encodeURIComponent(invite.communityId),'notifications');
          break;
        }
      }
    }
  },[communityUnread,locale,showNotice]);

  const activityBaseline=useRef<string[]|null>(null);
  useEffect(()=>{
    if(activity.loading)return;
    const now=activity.items.filter(item=>!item.readAt).map(item=>item.id);
    const before=activityBaseline.current;
    activityBaseline.current=now;
    if(!before||currentArea.current==='notifications')return;
    const known=new Set(before);
    const first=activity.items.find(item=>!item.readAt&&!known.has(item.id));
    if(first)showNotice('activity:'+first.id,
      locale==='pt-BR'?'Nova notificação':'New notification',
      first.actorName+' · '+(first.kind==='friend_request'?
        (locale==='pt-BR'?'solicitação de contato':'contact request'):
        first.kind==='friend_accepted'?(locale==='pt-BR'?'contato aceito':'contact accepted'):
        (locale==='pt-BR'?'atividade na comunidade':'community activity')),
      '/?notification='+encodeURIComponent(first.id),'notifications');
  },[activity.items,activity.loading,locale,showNotice]);

  const handledActivity=useRef(0);
  useEffect(()=>{
    if(!requestedActivity||handledActivity.current===requestedActivity.nonce)return;
    const target=activity.items.find(item=>item.id===requestedActivity.id);
    if(!target)return;
    handledActivity.current=requestedActivity.nonce;
    openActivity(target);
  },[requestedActivity,activity.items]);


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
    try {
      await onLogout();
      updatePwaAppBadge(0);
      resetDmInboxSession();
      clearChatMediaCache();
      clearCommunityMessageCache(account.user.id);
      await clearDmAccount(account.user.id);
    }
    catch { setLogoutError(t("Não foi possível sair da conta. Tente novamente.")); setLoggingOut(false);setLogoutConfirm(false); }
  }

  const openDiscoveryCommunity=useCallback((communityId:string,channelId?:string)=>{
    setArea('communities');setConversationOpened(false);
    window.dispatchEvent(new CustomEvent('uorqui:open-community',{detail:{communityId,channelId}}));
  },[]);

  const createCommunity=useCallback(()=>{
    move('communities');
    window.dispatchEvent(new Event('uorqui:create-community'));
  },[move]);
  const browseCommunities=()=>{
    move('communities');
    window.dispatchEvent(new Event('uorqui:browse-communities'));
  };
  const [sidebarCollapsed,setSidebarCollapsed]=useState(()=>{
    try{return localStorage.getItem('uorqui:sidebar-collapsed:v1')==='1';}catch{return false;}
  });
  useEffect(()=>{
    try{localStorage.setItem('uorqui:sidebar-collapsed:v1',sidebarCollapsed?'1':'0');}catch{}
  },[sidebarCollapsed]);
  const [navDirection,setNavDirection]=useState<1|-1>(1);
  const previousArea=useRef<Area>(area);
  useEffect(()=>{previousArea.current=area;},[area]);
  const activeLabel=area==='contacts'?(locale==='pt-BR'?'Contatos':'Contacts'):
     area==='profile'?'Perfil':area==='moderation'?(locale==='pt-BR'?'Moderação':'Moderation'):
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

  return (
    <div data-uorqui-app-shell data-uorqui-ui-kit="sprintrix-v1" data-uorqui-sidebar-mode={sidebarCollapsed?'collapsed':'expanded'} className="fixed inset-x-0 top-[var(--uorqui-app-top,0px)] flex h-[var(--uorqui-app-height,100dvh)] min-h-0 w-full overflow-hidden overscroll-none bg-background text-foreground">
      <aside data-uorqui-dashboard-sidebar
        inert={sidebarCollapsed} aria-hidden={sidebarCollapsed||undefined}
        className={cn('hidden h-full min-h-0 shrink-0 flex-col overflow-hidden bg-background md:flex',sidebarCollapsed?'pointer-events-none w-0 opacity-0':'w-64 opacity-100')}>
        <div className={cn('flex h-15 shrink-0 items-center',sidebarCollapsed?'justify-center px-2':'gap-2 px-4')}>
          <button type="button" onClick={()=>move('conversations')}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-ring"
            aria-label={t('Uorqui — ir para o início')}>
            <UorquiWordmark className="h-[17px] w-auto max-w-[104px] text-foreground"/>
          </button>

        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-3 pb-3 pt-1" aria-label={t('Navegação principal')}>
          <Button type="button" size="sm" variant="ghost"
            onClick={()=>setCommandOpen(true)}
            title={sidebarCollapsed?(locale==='pt-BR'?'Buscar':'Search'):undefined}
            aria-label={locale==='pt-BR'?'Buscar':'Search'}
            className={cn('uorqui-sidebar-item h-8 w-full rounded-md text-[13px] font-medium',
              sidebarCollapsed?'justify-center px-1':'justify-start gap-3 px-2.5')}>
            <Search aria-hidden="true" className="size-4 shrink-0"/>
            {!sidebarCollapsed&&<span className="truncate">{locale==='pt-BR'?'Buscar':'Search'}</span>}
          </Button>
          {/* Notification access stays in the header bell; the sidebar lists the other modules alphabetically. */}
          {navigation.filter(item=>item.id!=='notifications').map(item=>{
            const Icon=item.icon;
            const badge=item.id==='conversations'?unreadMessageCount:item.id==='communities'?communityUnreadCount:item.id==='email'?unreadMailCount:0;
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
          {platformModerator&&<section data-uorqui-administration className="mt-4" aria-label={locale==='pt-BR'?'Administração':'Administration'}>
            {!sidebarCollapsed&&<UIKitSectionHeading className="mb-2">{locale==='pt-BR'?'Administração':'Administration'}</UIKitSectionHeading>}
            <Button type="button" size="sm" variant="ghost"
              aria-current={area==='moderation'?'page':undefined}
              title={sidebarCollapsed?(locale==='pt-BR'?'Moderação':'Moderation'):undefined}
              onClick={()=>move('moderation')}
              className={cn('uorqui-sidebar-item h-8 w-full rounded-md text-[13px]',sidebarCollapsed?'justify-center px-1':'justify-start gap-3 px-2.5')}>
              <ShieldCheck className="size-4 shrink-0"/>{!sidebarCollapsed&&(locale==='pt-BR'?'Moderação':'Moderation')}
            </Button>
          </section>}
        </nav>

        <div className="flex shrink-0 flex-col px-3 pb-3 pt-2">
          <button type="button" onClick={()=>move('profile')} title={sidebarCollapsed?t('Abrir meu perfil'):undefined}
            aria-label={t('Abrir meu perfil')} className={cn('flex w-full min-w-0 items-center rounded-md py-1.5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',sidebarCollapsed?'justify-center px-0':'gap-2 px-2')}>
            <ProfileAvatar name={account.profile?.displayName??account.user.name} image={account.profile?.avatarUrl} className="size-7"/>
            {!sidebarCollapsed&&<span className="min-w-0"><span className="block truncate text-[12px] font-semibold">{account.profile?.displayName??account.user.name}</span><span className="block truncate text-[11px] text-muted-foreground">{account.profile?'@'+account.profile.handle:t('Conta Uorqui')}</span></span>}
          </button>
        </div>
      </aside>

      {mobileMenuOpen&&<div className="absolute inset-0 z-[80] md:hidden">
        <button type="button" className="absolute inset-0 bg-black/60" aria-label={locale==='pt-BR'?'Fechar menu':'Close menu'} onClick={()=>setMobileMenuOpen(false)}/>
        <aside id="uorqui-mobile-nav" role="dialog" aria-modal="true" aria-label={locale==='pt-BR'?'Menu principal':'Main menu'}
          className="relative flex h-full w-[min(82vw,288px)] flex-col overflow-hidden border-r border-border bg-background shadow-2xl pt-[env(safe-area-inset-top)]">
          <div className="flex h-15 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
            <button type="button" onClick={()=>move('conversations')} aria-label={t('Uorqui — ir para o início')}>
              <UorquiWordmark className="h-[17px] w-auto max-w-[110px] text-foreground"/>
            </button>
            <button type="button" className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-accent" onClick={()=>setMobileMenuOpen(false)}
              aria-label={locale==='pt-BR'?'Fechar menu':'Close menu'}><X className="size-5"/></button>
          </div>
          <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-3 py-3"
            aria-label={t('Navegação principal')}>
            <Button type="button" variant="ghost" size="sm"
              aria-label={locale==='pt-BR'?'Buscar':'Search'}
              onClick={()=>{setMobileMenuOpen(false);setCommandOpen(true);}}
              className="uorqui-sidebar-item h-10 w-full justify-start gap-3 rounded-md px-3 text-[13px] font-medium">
              <Search aria-hidden="true" className="size-4 shrink-0"/>
              <span className="min-w-0 flex-1 truncate text-left">{locale==='pt-BR'?'Buscar':'Search'}</span>
            </Button>
            {navigation.filter(item=>item.id!=='notifications').map(item=>{
              const Icon=item.icon;
              const badge=item.id==='conversations'?unreadMessageCount:item.id==='communities'?communityUnreadCount:item.id==='email'?unreadMailCount:0;
              return <Button key={item.id} data-uorqui-tour-target={item.id} type="button" size="sm" variant="ghost"
                aria-current={area===item.id?'page':undefined}
                aria-label={t(item.label)+(badge?' · '+badge:'')}
                onClick={()=>move(item.id)}
                className={cn('uorqui-sidebar-item relative h-10 w-full justify-start gap-3 rounded-md px-3 text-[13px] font-medium',
                  area===item.id&&'bg-accent text-foreground')}>
                <Icon className="size-4 shrink-0" aria-hidden="true"/>
                <span className="min-w-0 flex-1 truncate text-left">{t(item.label)}</span>
                {badge>0&&<span aria-hidden="true" className="grid min-h-5 min-w-5 place-items-center rounded bg-muted px-1 text-[11px] font-semibold">
                  {badge>99?'99+':badge}
                </span>}
              </Button>;
            })}
            {platformModerator&&<section data-uorqui-administration className="mt-5 border-t border-border pt-3">
              <UIKitSectionHeading className="mb-2">{locale==='pt-BR'?'Administração':'Administration'}</UIKitSectionHeading>
              <Button type="button" variant="ghost" size="sm" onClick={()=>move('moderation')}
                className="uorqui-sidebar-item h-10 w-full justify-start gap-3 px-3 text-[13px]">
                <ShieldCheck className="size-4"/>{locale==='pt-BR'?'Moderação':'Moderation'}
              </Button>
            </section>}
          </nav>
          <div className="shrink-0 border-t border-border px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
            <button type="button" onClick={()=>move('profile')}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent"
              aria-label={t('Abrir meu perfil')}>
              <ProfileAvatar name={account.profile?.displayName??account.user.name} image={account.profile?.avatarUrl} className="size-8"/>
              <span className="min-w-0"><span className="block truncate text-[13px] font-semibold">{account.profile?.displayName??account.user.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{account.profile?'@'+account.profile.handle:t('Conta Uorqui')}</span></span>
            </button>
          </div>
        </aside>
      </div>}

      <div data-uorqui-inset-panel className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card md:my-2 md:mr-2 md:h-auto md:rounded-2xl md:border md:border-border md:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <header data-uorqui-main-header className="relative z-30 flex h-[calc(4rem+env(safe-area-inset-top))] min-h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-center justify-between border-b border-border bg-card px-4 pt-[env(safe-area-inset-top)] sm:px-5 md:h-13 md:min-h-13 md:pt-0">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={()=>setMobileMenuOpen(true)} aria-label={locale==='pt-BR'?'Abrir menu':'Open menu'}
              aria-expanded={mobileMenuOpen} aria-controls="uorqui-mobile-nav"
              className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring md:hidden">
              <Menu className="size-5"/>
            </button>
            <button type="button" onClick={() => move('conversations')} aria-label={t('Uorqui — voltar ao início')} className="flex shrink-0 items-center gap-1.5 text-xl font-bold tracking-tight focus-visible:rounded focus-visible:outline-2 focus-visible:outline-ring md:hidden">
              <UorquiWordmark aria-hidden="true" className="h-[17px] w-auto max-w-[104px] text-foreground"/>
            </button>
            <button type="button" className="hidden size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring md:grid"
              title={sidebarCollapsed?(locale==='pt-BR'?'Expandir menu':'Expand sidebar'):(locale==='pt-BR'?'Recolher menu':'Collapse sidebar')}
              aria-label={sidebarCollapsed?(locale==='pt-BR'?'Expandir menu':'Expand sidebar'):(locale==='pt-BR'?'Recolher menu':'Collapse sidebar')}
              aria-expanded={!sidebarCollapsed} onClick={()=>setSidebarCollapsed(old=>!old)}>
              {sidebarCollapsed?<PanelLeftOpen className="size-4"/>:<PanelLeftClose className="size-4"/>}
            </button>
            <div className="hidden min-w-0 items-center gap-3 text-xs md:flex">
              <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true"/>
              <span className="truncate text-[13px] font-semibold text-foreground">{t(activeLabel)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={toggleNotifications}
              aria-label={t('Notificações')+(notificationBadgeCount?' · '+notificationBadgeCount+' '+(locale==='pt-BR'?'avisos não lidos':'unread alerts'):'')}
              title={t('Notificações')}
              aria-current={area==='notifications'?'page':undefined}
              className="uorqui-kit-header-notifications relative grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring md:grid">
              <Bell className="size-[18px]"/>
              <UIKitCount count={notificationBadgeCount} className="uorqui-kit-notification-count"/>
            </button>
            <PreferencesControls />
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {area==='communities'&&<nav data-uorqui-community-icon-rail
          aria-label={locale==='pt-BR'?'Barra de ícones das comunidades':'Community icon rail'}
          className={cn('uorqui-kit-community-icon-rail z-20 h-full w-14 min-w-14 shrink-0 flex-col items-center gap-2 overflow-y-auto overscroll-contain border-r border-border px-1 py-3 md:w-16 md:min-w-16',channelOpened?'hidden md:flex':'flex')}>
          {workspaceCommunities.map(item=>{
            const selected=selectedCommunityId===item.id;
            const unread=communityUnread.communities[item.id]??0;
            return <button type="button" key={item.id}
              className={cn('uorqui-kit-community-icon relative grid h-10 w-10 min-h-10 min-w-10 shrink-0 place-items-center rounded-xl',selected&&'uorqui-kit-community-icon--active')}
              title={item.name} aria-label={item.name+(unread?' · '+unread+' '+(locale==='pt-BR'?'mensagens não lidas':'unread messages'):'')}
              aria-current={selected?'page':undefined}
              onClick={()=>openDiscoveryCommunity(item.id)}>
              <CommunityRailPicture url={item.avatarUrl} name={item.name}/>
              {unread>0&&<span aria-hidden="true" className="uorqui-kit-community-unread">{unread>99?'99+':unread}</span>}
            </button>;
          })}
          <button type="button" onClick={createCommunity} aria-label={locale==='pt-BR'?'Criar comunidade':'Create community'}
            title={locale==='pt-BR'?'Criar comunidade':'Create community'}
            className="uorqui-kit-community-utility grid size-10 shrink-0 place-items-center rounded-xl border border-dashed border-border">
            <Plus className="size-5"/>
          </button>
          <button type="button" onClick={browseCommunities} aria-label={locale==='pt-BR'?'Descobrir':'Discover'}
            title={locale==='pt-BR'?'Descobrir':'Discover'}
            className="uorqui-kit-community-utility grid size-10 shrink-0 place-items-center rounded-xl">
            <Compass className="size-5"/>
          </button>
        </nav>}
          <div className="h-full min-h-0 min-w-0 flex-1 overflow-hidden">
            {/* A persistent mount keeps the microphone, signaling and room state alive
                when switching between Email, Messages, Profile and Communities. */}
            <motion.div hidden={area!=='communities'} data-uorqui-panel={area==='communities'?'active':'inactive'}
              data-uorqui-motion-panel data-direction={navDirection}
              initial={{opacity:0,x:navDirection*14}}
              animate={area==='communities'?{opacity:1,x:0}:{opacity:0,x:navDirection*14}}
              transition={WORKSPACE_PAGE_MOTION}
              className="h-full min-h-0 overflow-hidden">
              <LiveCommunities myId={account.user.id} active={area==='communities'}
                onMobileOpenChange={setChannelOpened} onRestoreNavigation={()=>move('communities')}
                initialCommunityId={invitedCommunityId} requestedDestination={requestedCommunity}
                unreadChannels={communityUnread.channels} unreadCommunities={communityUnread.communities}
                unreadLocations={communityUnread.locations}/>
            </motion.div>
            {area!=='communities'&&<motion.div key={area} data-uorqui-motion-panel initial={{opacity:0,x:navDirection*14}} animate={{opacity:1,x:0}}
              transition={WORKSPACE_PAGE_MOTION} className="h-full min-h-0 overflow-hidden">
            {area === 'conversations' && (
              <LiveDirectChat myId={account.user.id} initialHandle={requestedChatHandle} initialConversationId={requestedConversation?.id} requestedOpenNonce={requestedConversation?.nonce}
                onMobileOpenChange={setConversationOpened} onOpenContacts={()=>move('contacts')}
                onStarted={() => setRequestedChatHandle(null)} />
            )}
            {area === 'email' && <EmailInbox onMobileOpenChange={setEmailOpened} requestedMessage={mailDeepLink}/>}
            {area === 'contacts' && <FriendsPanel onBack={()=>move('conversations')}
               onMessage={async handle => { setRequestedChatHandle(handle); move('conversations'); }} />}

            {area==='notifications'&&<ActivityNotifications accountId={account.user.id}
              items={activity.items} unread={activity.unread} loading={activity.loading}
              channelAlerts={communityUnread.locations}
              communityInvites={communityUnread.invites}
              unreadMailCount={unreadMailCount} onOpenEmailInbox={()=>move('email')}
              onOpenDm={conversationId=>openPushDestination('/?conversation='+encodeURIComponent(conversationId))}
              onOpenMail={(mailAccountId,mailMessageId)=>openPushDestination(
                '/?mailAccount='+encodeURIComponent(mailAccountId)+'&mailMessage='+encodeURIComponent(mailMessageId))}
              onOpenChannel={(communityId,channelId)=>openDiscoveryCommunity(communityId,channelId)}
              onOpenCommunity={communityId=>openDiscoveryCommunity(communityId)}
              error={activity.error} onRefresh={()=>void activity.refresh()}
              onReadAll={activity.markAllRead} onDelete={activity.remove} onOpen={openActivity}/>} 
            {area === 'moderation' && platformModerator === null &&
              <WorkspaceContentLoading label={locale==='pt-BR'?'Carregando moderação':'Loading moderation'} className="mx-auto max-w-4xl p-6" />}
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
                <ProfileEditor initial={account.profile} onSaved={profile => onAccountUpdate({ ...account, profile })}
                  onDeleted={async()=>{
                    updatePwaAppBadge(0);
                    resetDmInboxSession();
                    clearChatMediaCache();
                    clearCommunityMessageCache(account.user.id);
                    await clearDmAccount(account.user.id).catch(()=>{});
                    await onAccountDeleted();
                  }}/>
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


      </div>
      {inAppNotices.length>0&&<section aria-label={locale==='pt-BR'?'Avisos recentes':'Recent alerts'}
        aria-live="polite" className="pointer-events-none fixed right-3 top-[calc(4.5rem+env(safe-area-inset-top))] z-[120] flex w-[min(26rem,calc(100vw-1.5rem))] flex-col gap-2 md:top-17">
        {inAppNotices.map(notice=><div key={notice.id}
          className="pointer-events-auto flex min-h-17 items-start gap-2 rounded-xl border border-border bg-card p-3 shadow-xl">
          <button type="button" className="flex min-w-0 flex-1 items-start gap-3 text-left"
            aria-label={notice.title+' · '+notice.body}
            onClick={()=>{dismissNotice(notice.id);openPushDestination(notice.url);}}>
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Bell className="size-4"/></span>
            <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{notice.title}</strong>
              <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">{notice.body}</span></span>
          </button>
          <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent"
            aria-label={locale==='pt-BR'?'Dispensar aviso':'Dismiss alert'} onClick={()=>dismissNotice(notice.id)}>
            <X className="size-4"/>
          </button>
        </div>)}
      </section>}
      <WorkspaceCommandPalette open={commandOpen} onOpenChange={setCommandOpen}
        commands={commands} locale={locale}/>
      {!tourVisible&&<PwaFirstRun accountId={account.user.id}/>}
      {tourVisible&&account.profile&&<OnboardingTour userId={account.user.id} profile={account.profile}
        onNavigate={tourNavigate}
        onProfileSaved={next=>onAccountUpdate({...account,profile:next})}
        onFinish={()=>{setTourVisible(false);setMobileMenuOpen(false);move('communities');}}/>}
    </div>
  );
}
