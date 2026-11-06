import { apiRequest as api } from './lib/apiClient';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Dialog } from 'radix-ui';
import { VoicePortalShell } from './VoicePortalShell';
import { ArrowLeft, Check, ChevronDown, ChevronUp, Copy, Hash, Headphones, LockKeyhole, LockKeyholeOpen, MessageCircle, MessageSquareText, Mic, MicOff, Flag, Pencil, Plus, Search, UserPlus, Users, Video, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkspaceContentLoading } from './ui-kit/WorkspaceContentLoading';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { UserAvatar } from './UserProfiles';
import { useCachedProfileImage } from './profileImageCache';
import { useUorquiPreferences } from './UorquiPreferences';
import CommunityVoiceRoom, { type CommunityVoiceParticipant, type VoiceRoomTarget, type VoicePhase } from './CommunityVoiceRoom';
import CommunityModerationPanel from './CommunityModerationPanel';
import CommunityMediaPicker, { isCommunityGifUrl } from './CommunityMediaPicker';
import CommunityMessageReactions, { type CommunityReaction } from './CommunityMessageReactions';
import { LiveMessageComposer } from './LiveMessageComposer';
import { MessageText } from './MessageText';
import { LinkPreview } from './LinkPreview';
import type {UnreadLocation} from './useCommunityUnread';
import {clearReadPush} from './readPushNotifications';
import { CommunityMessageAttachment, type CommunityAttachment } from './CommunityMessageAttachment';
import { invalidateChatMedia, invalidateCommunityMedia } from './chatMediaCache';
import { ContentReportDialog } from './ContentReportDialog';
import { navigateToPublicProfile } from './publicProfileNavigation';
import { forgetCommunityMessages, peekCommunityMessages, putCommunityMessages, reconcileCommunityMessages } from './communityMessageCache';

/** Shared authorized avatar cache prevents repeated R2 downloads between
 * the community directory, channel header and the workspace icon rail. */
function CommunityAvatarImage({url,name,classes}:{url:string|null;name:string;classes:string}) {
  const cached=useCachedProfileImage(url);
  return cached?<img src={cached} alt="" loading="lazy" decoding="async"
    referrerPolicy="no-referrer" className={classes+' block min-h-0 min-w-0 object-cover'}/>:
    <span aria-hidden="true" className="grid size-full place-items-center">{name.trim().charAt(0).toUpperCase()||'C'}</span>;
}

type Visibility='public'|'approval'|'private';
type Community={
  id:string;name:string;slug:string;description:string|null;avatarUrl:string|null;visibility:Visibility;
  memberCount:number;myRole:string|null;requestKind:string|null;requestStatus:string|null;
};
type Channel={id:string;name:string;kind:'text'|'voice'|'meeting';createdAt:string;hasPassword?:boolean;unlocked?:boolean;accessMode?:'open'|'restricted'};
type Pending={handle:string;displayName:string;requestedAt:string};
type Detail={community:Community;channels:Channel[];pendingRequests:Pending[]};
type Message={id:string;clientId:string;body:string|null;createdAt:string;authorHandle:string;authorName:string;authorAvatar:string|null;editedAt:string|null;deletedAt:string|null;canEdit:boolean;canDelete:boolean;canReact:boolean;reactions:CommunityReaction[];attachment?:CommunityAttachment|null;attachmentUrl?:string|null};
type PendingMessage=Message & {channelId:string;pending:'sending'|'failed'};
function isPendingMessage(value:Message|PendingMessage):value is PendingMessage { return 'pending' in value; }
/** Stoat-like compact rows: consecutive posts from the same author form a group. */
function groupedWithPrevious(messages:(Message|PendingMessage)[],index:number){
  if(index<=0)return false;
  const previous=messages[index-1],current=messages[index];
  if(!previous||!current||previous.authorHandle!==current.authorHandle||
     previous.authorName!==current.authorName||previous.deletedAt||current.deletedAt)return false;
  const delta=Date.parse(current.createdAt)-Date.parse(previous.createdAt);
  return delta>=0&&delta<5*60_000;
}
const hidden='min-h-0 flex-1 overflow-y-auto overscroll-contain';
const allowedSlug=/^[a-z][a-z0-9-]{2,63}$/;

function body(value:unknown):RequestInit{
  return {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)};
}
function memberView(community:Community){return !!community.myRole;}
function manage(community:Community){return community.myRole==='owner'||community.myRole==='admin';}

export default function LiveCommunities({myId,onMobileOpenChange,onRestoreNavigation,initialCommunityId,requestedDestination,unreadChannels,unreadCommunities,unreadLocations,active}:{
  myId:string;onMobileOpenChange?:(value:boolean)=>void;onRestoreNavigation?:()=>void;initialCommunityId?:string|null;
  requestedDestination?:{communityId:string;channelId:string|null;nonce:number}|null;
  unreadChannels:Record<string,number>;unreadCommunities:Record<string,number>;unreadLocations:UnreadLocation[];active:boolean;
}){
  const {locale}=useUorquiPreferences(),pt=locale==='pt-BR';
  const lastCommunityKey='uorqui:last-community:'+myId;
  const [list,setList]=useState<Community[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(initialCommunityId??null);
  const [directory, setDirectory] = useState(false);
  const [communitySearch, setCommunitySearch] = useState('');
  const [detail,setDetail]=useState<Detail|null>(null);
  const [channelId,setChannelId]=useState<string|null>(null);
  const requestedChannel=useRef<{communityId:string;channelId:string}|null>(null);
  const externalSelection=useRef(false);
  const [channelOpen,setChannelOpen]=useState(false);
  const [voiceParticipants,setVoiceParticipants]=useState<CommunityVoiceParticipant[]>([]);
  const [activeVoiceRoom,setActiveVoiceRoom]=useState<VoiceRoomTarget|null>(null);
  const [voiceMinimized,setVoiceMinimized]=useState(false);
  const [voiceTextExpanded,setVoiceTextExpanded]=useState(false);
  const [voicePhase,setVoicePhase]=useState<VoicePhase>('idle');
  const voiceHostRef=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{if(!active){setVoiceMinimized(true);if(voicePhase==='idle')setActiveVoiceRoom(null);}},[active,voicePhase]);
  function openVoiceRoom(target:VoiceRoomTarget){
    if(activeVoiceRoom?.communityId===target.communityId&&activeVoiceRoom.channelId===target.channelId){
      setVoiceMinimized(false);return;
    }
    if(activeVoiceRoom&&voicePhase!=='idle'){
      setVoiceMinimized(true);
      setNotice(pt?'Você já está conectado a outra sala. Desconecte antes de entrar em outra.':
        'You are already connected to another room. Disconnect before joining another.');
      return;
    }
    // Keep the text chat collapsed initially in voice rooms and meetings.
    // Members can expand it using the existing button when they need it.
    setVoiceTextExpanded(false);
    setActiveVoiceRoom(target);setVoiceMinimized(false);
  }
  const [voiceRooms,setVoiceRooms]=useState<Record<string,CommunityVoiceParticipant[]>>({});
  const [voicePresenceLoading,setVoicePresenceLoading]=useState(false);
  const [voicePresenceFailed,setVoicePresenceFailed]=useState(false);
  const [createOpen,setCreateOpen]=useState(false);
  const [createName,setCreateName]=useState('');
  const [createSlug,setCreateSlug]=useState('');
  const [slugTouched,setSlugTouched]=useState(false);
  const [createDescription,setCreateDescription]=useState('');
  const [createVisibility,setCreateVisibility]=useState<Visibility>('public');
  const [inviteLink,setInviteLink]=useState<{id:string;expiresAt:string}|null>(null);
  const [channelInviteOpen,setChannelInviteOpen]=useState(false);
  const [channelInviteContacts,setChannelInviteContacts]=useState<{handle:string;displayName:string;avatarUrl:string|null}[]>([]);
  const [channelInviteFilter,setChannelInviteFilter]=useState('');
  const [channelInviteLoading,setChannelInviteLoading]=useState(false);
  const [channelInviteSending,setChannelInviteSending]=useState<string|null>(null);
  const [channelInviteError,setChannelInviteError]=useState('');
  const [channelInviteSuccess,setChannelInviteSuccess]=useState('');
  const [shareBusy,setShareBusy]=useState(false);
  const [shareNotice,setShareNotice]=useState('');
  const [shareOpen,setShareOpen]=useState(false);
  const [shareCopyState,setShareCopyState]=useState<'idle'|'copied'|'error'>('idle');
  const [shareToast,setShareToast]=useState<{kind:'success'|'error';message:string}|null>(null);
  const shareToastTimer=useRef<number|null>(null);
  useEffect(()=>()=>{if(shareToastTimer.current!==null)window.clearTimeout(shareToastTimer.current);},[]);
  function showShareToast(kind:'success'|'error',message:string){
    if(shareToastTimer.current!==null)window.clearTimeout(shareToastTimer.current);
    setShareToast({kind,message});
    shareToastTimer.current=window.setTimeout(()=>{
      setShareToast(null);setShareCopyState('idle');shareToastTimer.current=null;
    },3500);
  }
  useEffect(()=>{
    if(!channelInviteOpen)return;
    const controller=new AbortController();
    setChannelInviteLoading(true);setChannelInviteError('');setChannelInviteSuccess('');
    setChannelInviteContacts([]);
    if(!selectedId){setChannelInviteLoading(false);return()=>controller.abort();}
    void api<{members:{handle:string;displayName:string;avatarUrl:string|null}[]}>(
      '/api/v1/communities/'+selectedId+'/invitable-members',{signal:controller.signal})
      .then(data=>{if(!controller.signal.aborted)setChannelInviteContacts(data.members??[]);})
      .catch(()=>{if(!controller.signal.aborted)setChannelInviteError(pt?'Não foi possível carregar os membros da comunidade.':'Could not load community members.');})
      .finally(()=>{if(!controller.signal.aborted)setChannelInviteLoading(false);});
    return()=>controller.abort();
  },[channelInviteOpen,selectedId,pt]);
  const [newChannelOpen,setNewChannelOpen]=useState(false);
  const [newChannelName,setNewChannelName]=useState('');
  const [newChannelKind,setNewChannelKind]=useState<'text'|'voice'|'meeting'>('text');
  const [newChannelAccessMode,setNewChannelAccessMode]=useState<'open'|'restricted'>('open');
  const [unlockPassword,setUnlockPassword]=useState('');
  const [unlockBusy,setUnlockBusy]=useState(false);
  const [unlockError,setUnlockError]=useState('');
  const [channelSettingsOpen,setChannelSettingsOpen]=useState(false);
  const [channelSettingsName,setChannelSettingsName]=useState('');
  const [channelSettingsPassword,setChannelSettingsPassword]=useState('');
  const [channelSettingsAccessMode,setChannelSettingsAccessMode]=useState<'open'|'restricted'>('open');
  const [channelSettingsBusy,setChannelSettingsBusy]=useState<'name'|'password'|'remove'|'access'|null>(null);
  const [channelSettingsError,setChannelSettingsError]=useState('');
  const [channelRemoveConfirm,setChannelRemoveConfirm]=useState(false);
  const channelSettingsRef=useRef<HTMLDivElement|null>(null);
  const channelSettingsMenuRef=useRef<HTMLDivElement|null>(null);
  const [channelSettingsPosition,setChannelSettingsPosition]=useState<{top:number;left:number}|null>(null);
  useEffect(()=>{
    setChannelSettingsOpen(false);setChannelSettingsName('');setChannelSettingsPassword('');
    setChannelSettingsError('');setChannelRemoveConfirm(false);setChannelSettingsPosition(null);
  },[selectedId,channelId]);
  useEffect(()=>{
    if(!channelSettingsOpen)return;
    // Voice/video is rendered in a document-body portal above the app shell.
    // Portaling this menu as well keeps it clickable and visible on every room type.
    const reposition=()=>{
      const rect=channelSettingsRef.current?.getBoundingClientRect();
      if(!rect){setChannelSettingsOpen(false);return;}
      const width=Math.min(352,Math.max(220,window.innerWidth-24));
      setChannelSettingsPosition({
        top:Math.max(12,Math.min(rect.bottom+8,window.innerHeight-72)),
        left:Math.max(12,Math.min(rect.right-width,window.innerWidth-width-12))
      });
    };
    reposition();
    const dismiss=(event:PointerEvent)=>{
      const target=event.target as Node;
      if(!channelSettingsRef.current?.contains(target)&&!channelSettingsMenuRef.current?.contains(target))
        setChannelSettingsOpen(false);
    };
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setChannelSettingsOpen(false);};
    document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',escape);
    window.addEventListener('resize',reposition);
    window.addEventListener('scroll',reposition,true);
    window.visualViewport?.addEventListener('resize',reposition);
    return ()=>{
      document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape);
      window.removeEventListener('resize',reposition);
      window.removeEventListener('scroll',reposition,true);
      window.visualViewport?.removeEventListener('resize',reposition);
    };
  },[channelSettingsOpen]);
  const [inviteHandle,setInviteHandle]=useState('');
  const [messages,setMessages]=useState<Message[]>([]);
  const [messagesForKey,setMessagesForKey]=useState<string|null>(null);
  const [newBelow,setNewBelow]=useState(0);
  const [pendingMessages,setPendingMessages]=useState<PendingMessage[]>([]);
  const [messagesLoading,setMessagesLoading]=useState(false);
  const [messagesLoadFailed,setMessagesLoadFailed]=useState(false);
  const [detailLoading,setDetailLoading]=useState(false);
  const [draft,setDraft]=useState('');
  const [mediaPicker,setMediaPicker]=useState<'emoji'|'gif'|null>(null);
  const [reactionPickerId,setReactionPickerId]=useState<string|null>(null);
  const [reactionBusyId,setReactionBusyId]=useState<string|null>(null);
  const reactionSubmitting=useRef<string|null>(null);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [editingBody,setEditingBody]=useState('');
  const [deletingId,setDeletingId]=useState<string|null>(null);
  const [reportMessageId,setReportMessageId]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [busyAction,setBusyAction]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const scrollRef=useRef<HTMLDivElement>(null);
  const messageContentRef=useRef<HTMLDivElement>(null);
  const followBottomRef=useRef(true);
  const composerRef=useRef<HTMLTextAreaElement>(null);
  const pendingFiles=useRef(new Map<string,File>());
  const pendingBlobUrls=useRef(new Map<string,string>());
  const previousLastMessage=useRef<string|null>(null);
  const previousMessageCount=useRef(0);
  const activeScrollKey=useRef<string|null>(null);
  const acknowledged=useRef(new Map<string,string>());
  // Reopening a channel always begins with its newest message. Scrolling
  // through history during an open session still remains under user control.
  useEffect(()=>{
    if(!channelOpen || !active){
      activeScrollKey.current=null;
      followBottomRef.current=true;
    }
  },[channelOpen,active]);
  useEffect(()=>()=>{for(const url of pendingBlobUrls.current.values())URL.revokeObjectURL(url);pendingBlobUrls.current.clear();pendingFiles.current.clear();},[]);
  const activeChannel=detail?.channels.find(x=>x.id===channelId)??null;
  const channelLocked=Boolean(activeChannel?.hasPassword&&!activeChannel?.unlocked);
  const community=detail?.community??null;
  // A revoked grant removes a closed room from the authorized channel list.
  // Unmount its WebRTC component rather than keeping a stale floating call.
  useEffect(()=>{
    if(!activeVoiceRoom||!detail||selectedId!==activeVoiceRoom.communityId)return;
    if(detail.channels.some(ch=>ch.id===activeVoiceRoom.channelId))return;
    setActiveVoiceRoom(null);setVoiceParticipants([]);setVoiceMinimized(true);
    setNotice(pt?'Você não tem mais acesso a esta sala.':'You no longer have access to this room.');
  },[detail,activeVoiceRoom,selectedId,pt]);
  const currentMessageKey=selectedId&&channelId?selectedId+'/'+channelId:null;
  const visibleMessages=messagesForKey===currentMessageKey?messages:[];
  const renderedMessages=[...visibleMessages,...pendingMessages.filter(p=>p.channelId===channelId&&!visibleMessages.some(m=>m.clientId===p.clientId))];

  const loadList=useCallback(async()=>{
    const data=await api<{communities:Community[]}>('/api/v1/communities');
    setList(data.communities);setLoading(false);
    return data.communities;
  },[]);
  const loadDetail=useCallback(async(id:string)=>{
    const data=await api<Detail>('/api/v1/communities/'+encodeURIComponent(id));
    setDetail(data);
    const requested=requestedChannel.current;
    setChannelId(old=>{
      if(requested?.communityId===id&&data.channels.some(channel=>channel.id===requested.channelId)){
        requestedChannel.current=null;return requested.channelId;
      }
      return old&&data.channels.some(channel=>channel.id===old)?old:data.channels[0]?.id??null;
    });
    return data;
  },[]);
  useEffect(()=>{
    let active=true;
    void loadList().then(groups=>{
      if(!active)return;
      // Do not let a first-load response override a user navigation from Discover.
      if(externalSelection.current)return;
      if(initialCommunityId&&groups.some(g=>g.id===initialCommunityId&&g.myRole)){
        setSelectedId(initialCommunityId);
        
      }else{
        // Restore only a community this account still belongs to.
        let remembered:string|null=null;
        try{remembered=localStorage.getItem(lastCommunityKey);}catch{}
        const chosen=groups.find(group=>group.id===remembered&&group.myRole)??groups.find(group=>group.myRole);
        setSelectedId(chosen?.id??null);
        
      }
    }).catch(()=>{if(active){setLoading(false);setError(pt?'Não foi possível carregar as comunidades.':'Could not load communities.');}});
    return ()=>{active=false;};
  },[loadList,pt,initialCommunityId,lastCommunityKey]);
  useEffect(()=>{
    // Persist validated memberships only; public previews and expired access are never remembered.
    if(!selectedId||detail?.community.id!==selectedId||!detail.community.myRole)return;
    try{localStorage.setItem(lastCommunityKey,selectedId);}catch{}
  },[selectedId,detail,lastCommunityKey]);
  useEffect(()=>{
    if(!selectedId){setDetail(null);setChannelId(null);return;}
    let active=true;setDetail(null);setDetailLoading(true);
    void loadDetail(selectedId).catch(()=>{if(active)setError(pt?'Não foi possível abrir a comunidade.':'Could not open community.');}).finally(()=>{if(active)setDetailLoading(false);});
    return ()=>{active=false;};
  },[selectedId,loadDetail,pt]);
  useEffect(()=>{
    let lastRequest=0;
    const membershipUpdate=(incoming:Event)=>{
      const event=(incoming as CustomEvent<{kind?:string;communityId?:string}>).detail;
      if(event?.kind!=='membership'&&event?.kind!=='channel'&&event?.kind!=='ready')return;
      const request=++lastRequest;
      // List and selected community detail are different queries. Both must
      // refresh when an approval arrives while the applicant is viewing the app.
      void Promise.all([loadList(),selectedId?loadDetail(selectedId):Promise.resolve(null)])
        .then(([,updated])=>{
          if(request!==lastRequest||event?.kind!=='membership'||event.communityId!==selectedId)return;
          if(updated?.community.myRole)
            setNotice(pt?'Sua entrada na comunidade foi aprovada.':'Your community request was approved.');
        }).catch(()=>{/* Focus/reconnect can retry without interrupting the user. */});
    };
    const onFocus=()=>{if(document.visibilityState==='visible')membershipUpdate(new CustomEvent('membership-refresh',{detail:{kind:'ready'}}));};
    window.addEventListener('uorqui:community-event',membershipUpdate);
    window.addEventListener('focus',onFocus);
    return()=>{lastRequest++;window.removeEventListener('uorqui:community-event',membershipUpdate);
      window.removeEventListener('focus',onFocus);};
  },[loadList,loadDetail,selectedId,pt]);
  // Discover opens the exact community/channel using the already-mounted community
  // view; opening a voice room never starts a WebRTC session automatically.
  useEffect(()=>{
    const navigate=(event:Event)=>{
      const target=(event as CustomEvent<{communityId?:string;channelId?:string}>).detail;
      if(!target||typeof target.communityId!=='string'||!/^[0-9a-f-]{36}$/i.test(target.communityId))return;
      const selectedChannel=typeof target.channelId==='string'&&/^[0-9a-f-]{36}$/i.test(target.channelId)
        ?target.channelId:null;
      externalSelection.current=true;
      requestedChannel.current=selectedChannel?{communityId:target.communityId,channelId:selectedChannel}:null;
      setSelectedId(target.communityId);
      setCreateOpen(false);setError('');setNotice('');
      setChannelOpen(Boolean(selectedChannel));
      if(selectedChannel){
        setChannelId(selectedChannel);
        setVoiceMinimized(true);
      }
    };
    window.addEventListener('uorqui:open-community',navigate);
    return()=>window.removeEventListener('uorqui:open-community',navigate);
  },[]);
  // On a cold PWA start the shell may parse a notification before a
  // window event listener exists. The explicit prop replays the destination
  // reliably and prevents the async initial community restore from winning.
  const lastDestinationNonce=useRef<number|null>(null);
  useEffect(()=>{
    if(!requestedDestination||lastDestinationNonce.current===requestedDestination.nonce)return;
    lastDestinationNonce.current=requestedDestination.nonce;
    window.dispatchEvent(new CustomEvent('uorqui:open-community',{
      detail:{communityId:requestedDestination.communityId,channelId:requestedDestination.channelId}
    }));
  },[requestedDestination]);

  useEffect(()=>onMobileOpenChange?.(channelOpen),[channelOpen,onMobileOpenChange]);
  useEffect(()=>{
    window.dispatchEvent(new CustomEvent('uorqui:community-selected',{detail:{id:selectedId}}));
  },[selectedId]);
  useEffect(()=>{
    window.dispatchEvent(new CustomEvent('uorqui:channel-selected',{detail:{id:channelId}}));
  },[channelId]);
  useEffect(()=>{
    const create=()=>{
      externalSelection.current=true;
      setCreateOpen(true);setSelectedId(null);setChannelId(null);setChannelOpen(false);
      setDetail(null);setError('');setNotice('');
    };
    window.addEventListener('uorqui:create-community',create);
    return()=>window.removeEventListener('uorqui:create-community',create);
  },[]);
  useEffect(()=>{
    const browse=()=>{
      externalSelection.current=true;
      setCreateOpen(false);setSelectedId(null);setChannelId(null);setChannelOpen(false);
      setDetail(null);setDirectory(true);setCommunitySearch('');setError('');setNotice('');
    };
    window.addEventListener('uorqui:browse-communities',browse);
    return()=>window.removeEventListener('uorqui:browse-communities',browse);
  },[]);
  // The main room roster is refreshed immediately by the shared community SSE.
  // Retain a slow fallback only for disconnected browsers or expired sessions.
  useEffect(()=>{
    let mounted=true,requestId=0;
    setVoiceRooms({});setVoicePresenceFailed(false);
    if(!selectedId||!community?.myRole){setVoicePresenceLoading(false);return;}
    setVoicePresenceLoading(true);
    const refresh=async()=>{
      const id=++requestId;
      try{
        const response=await api<{rooms:Record<string,CommunityVoiceParticipant[]>}>(
          '/api/v1/communities/'+encodeURIComponent(selectedId)+'/voice/presence');
        if(mounted&&id===requestId){setVoiceRooms(response.rooms);setVoicePresenceFailed(false);}
      }catch{if(mounted&&id===requestId)setVoicePresenceFailed(true);}
      finally{if(mounted&&id===requestId)setVoicePresenceLoading(false);}
    };
    const event=(incoming:Event)=>{
      const detail=(incoming as CustomEvent<{kind:string;communityId?:string}>).detail;
      if(detail?.kind==='ready'||detail?.kind==='voice'&&detail.communityId===selectedId)
        void refresh();
    };
    const focus=()=>{if(document.visibilityState==='visible')void refresh();};
    window.addEventListener('uorqui:community-event',event);
    window.addEventListener('focus',focus);
    const timer=window.setInterval(()=>{
      if(document.visibilityState==='visible')void refresh();
    },30000);
    void refresh();
    return ()=>{mounted=false;requestId++;window.clearInterval(timer);
      window.removeEventListener('uorqui:community-event',event);
      window.removeEventListener('focus',focus);
    };
  },[selectedId,community?.myRole]);

  async function shareCommunity(){
    if(!selectedId)return;
    setShareBusy(true);setShareNotice('');setShareCopyState('idle');
    try{
      const existing=await api<{link:{id:string;expiresAt:string}|null}>('/api/v1/communities/'+selectedId+'/share');
      if(!existing.link&&manage(community!)){
        const made=await api<{link:{id:string;expiresAt:string}}>('/api/v1/communities/'+selectedId+'/share',body({}));
        setInviteLink(made.link);
      }else setInviteLink(existing.link);
      setShareOpen(true);
    }catch{setShareNotice(pt?'Não foi possível carregar o convite.':'Could not load invitation.');}
    finally{setShareBusy(false);}
  }
  async function copyInvite(){
    if(!inviteLink)return;
    const url=window.location.origin+'/invite/'+inviteLink.id;
    setShareCopyState('idle');
    try{
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(url);
      setShareCopyState('copied');
      setShareNotice(pt?'Link copiado para a área de transferência.':'Link copied to clipboard.');
      showShareToast('success',pt?'Link da comunidade copiado!':'Community link copied!');
    }catch{
      setShareCopyState('error');
      setShareNotice(pt?'Não foi possível copiar. Selecione o link acima para copiar manualmente.':
        'Could not copy. Select the link above to copy it manually.');
      showShareToast('error',pt?'Não foi possível copiar o link.':'Could not copy the link.');
    }
  }
  async function inviteContactToChannel(handle:string){
    if(channelInviteSending||!selectedId||!channelId||!activeChannel||!community?.myRole||
       !channelInviteContacts.some(member=>member.handle===handle))return;
    setChannelInviteSending(handle);setChannelInviteError('');setChannelInviteSuccess('');
    try{
      // This picker includes only current community members, so use the
      // direct channel link rather than generating a community-wide invite.
      // Password and restricted-channel grants are still enforced on arrival.
      const link=new URL('/',window.location.origin);
      link.searchParams.set('community',selectedId);
      link.searchParams.set('channel',channelId);
      const target=await api<{id:string}>('/api/v1/dm/conversations',body({handle}));
      await api('/api/v1/dm/conversations/'+target.id+'/messages',body({
        clientId:crypto.randomUUID(),
        body:(pt?'Venha para o canal ':'Join the channel ')+
          (activeChannel.kind==='text'?'#':activeChannel.kind==='meeting'?'📹 ':'🔊 ')+
          activeChannel.name+' · '+community.name+'\n'+link.toString()
      }));
      setChannelInviteSuccess(pt?'Convite enviado para @'+handle+' no chat.':'Invitation sent to @'+handle+' in chat.');
    }catch{
      setChannelInviteError(pt?'Não foi possível enviar a mensagem. Confira as permissões de conversa.':
        'Could not send the message. Check direct-message permissions.');
    }finally{setChannelInviteSending(null);}
  }
  const closeChannel=()=>{setChannelInviteOpen(false);if(voicePhase==='idle')setActiveVoiceRoom(null);setVoiceMinimized(true);setChannelOpen(false);setReactionPickerId(null);setMediaPicker(null);setDraft('');setVoiceParticipants([]);setEditingId(null);setDeletingId(null);};

  useEffect(()=>{
    if(!selectedId||!channelId||!activeChannel||!community?.myRole||
       (activeChannel.hasPassword&&!activeChannel.unlocked)){
      setMessagesForKey(null);setMessages([]);setMessagesLoadFailed(false);return;
    }
    const communityId=selectedId,roomId=channelId,roomKey=communityId+'/'+roomId;
    let mounted=true,inFlight=false,repeat=false,lastRefresh=0;
    const cached=peekCommunityMessages<Message>(myId,communityId,roomId);
    setReactionPickerId(null);setMessagesForKey(roomKey);
    setMessages(cached??[]);setMessagesLoading(!cached);setMessagesLoadFailed(false);
    // Open from cache immediately, then revalidate in the background. A burst
    // of SSE events during one request only schedules one follow-up request.
    const refresh=async(force=false)=>{
      if(!mounted)return;
      if(inFlight){repeat=true;return;}
      if(!force&&Date.now()-lastRefresh<350)return;
      inFlight=true;lastRefresh=Date.now();
      try{
        const result=await api<{messages:Message[]}>(`/api/v1/communities/${communityId}/channels/${roomId}/messages`);
        if(mounted){
          // A deleted attachment must not remain readable through its cached
          // Blob URL, even if another member removed the message over SSE.
          const existing=peekCommunityMessages<Message>(myId,communityId,roomId)??[];
          const revised=new Map(result.messages.map(message=>[message.id,message]));
          for(const prior of existing){
            if(prior.attachment&&!prior.deletedAt&&revised.get(prior.id)?.deletedAt){
              invalidateChatMedia(prior.attachmentUrl||
                '/media/community-attachment/'+communityId+'/'+roomId+'/'+prior.attachment.id);
            }
          }
          putCommunityMessages(myId,communityId,roomId,result.messages);
          setMessages(old=>reconcileCommunityMessages(old,result.messages));
          setPendingMessages(old=>old.filter(p=>p.channelId!==roomId||!result.messages.some(m=>m.clientId===p.clientId)));
          setMessagesLoading(false);setMessagesLoadFailed(false);
        }
      }catch(reason){
        if(mounted){
          const code=reason instanceof Error?reason.message:'';
          // A cached protected channel must disappear immediately when the
          // authoritative API revokes access; temporary outages keep the cache.
          const accessDenied=['MEMBERS_ONLY','CHANNEL_PASSWORD_REQUIRED',
            'CHANNEL_PERMISSION_REQUIRED','CHANNEL_NOT_FOUND','Unauthorized','UNAUTHORIZED'].includes(code);
          if(accessDenied){
            invalidateCommunityMedia(communityId,roomId);
            forgetCommunityMessages(myId,communityId,roomId);
            setMessages([]);setMessagesForKey(null);
          }
          setMessagesLoading(false);
          if(!cached||accessDenied)setMessagesLoadFailed(true);
        }
      }finally{
        inFlight=false;
        if(repeat&&mounted){repeat=false;void refresh(true);}
      }
    };
    const event=(incoming:Event)=>{
      const detail=(incoming as CustomEvent<{kind:string;communityId?:string;channelId?:string}>).detail;
      if(detail?.kind==='ready'||(detail?.kind==='message'&&detail.communityId===communityId&&detail.channelId===roomId))
        void refresh();
    };
    const focus=()=>{if(document.visibilityState==='visible')void refresh();};
    window.addEventListener('uorqui:community-event',event);
    window.addEventListener('focus',focus);
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},60_000);
    void refresh(true);
    return ()=>{mounted=false;window.clearInterval(timer);
      window.removeEventListener('uorqui:community-event',event);
      window.removeEventListener('focus',focus);
    };
  },[myId,selectedId,channelId,activeChannel?.kind,activeChannel?.hasPassword,activeChannel?.unlocked,community?.myRole]);

  useLayoutEffect(()=>{
    const element=scrollRef.current;
    const key=currentMessageKey;
    if(!active||!channelOpen||!element||!key||messagesForKey!==key||messagesLoading)return;
    const latest=messages.at(-1)?.id??null;
    if(activeScrollKey.current!==key){
      activeScrollKey.current=key;
      previousLastMessage.current=latest;
      previousMessageCount.current=messages.length;
      followBottomRef.current=true;
      setNewBelow(0);
      // Position before paint, then again after mobile/PWA layout settles.
      element.scrollTop=element.scrollHeight;
      const frame=window.requestAnimationFrame(()=>{
        if(scrollRef.current===element&&activeScrollKey.current===key)
          element.scrollTop=element.scrollHeight;
      });
      return ()=>window.cancelAnimationFrame(frame);
    }
    if(latest&&latest!==previousLastMessage.current){
      const distance=element.scrollHeight-element.scrollTop-element.clientHeight;
      if(followBottomRef.current||distance<180){
        followBottomRef.current=true;
        element.scrollTo({top:element.scrollHeight,behavior:previousLastMessage.current?'smooth':'instant'});
      }else if(previousLastMessage.current){
        setNewBelow(old=>old+Math.max(1,messages.length-previousMessageCount.current));
      }
    }
    previousLastMessage.current=latest;
    previousMessageCount.current=messages.length;
  },[active,channelOpen,messages,selectedId,channelId,messagesForKey,messagesLoading,currentMessageKey]);

  // Image previews and GIFs may expand after channel data is painted. Keep
  // the bottom anchored only while the reader has not scrolled away.
  useLayoutEffect(()=>{
    const element=scrollRef.current,content=messageContentRef.current;
    const key=currentMessageKey;
    if(!active||!channelOpen||!element||!content||!key||messagesForKey!==key||messagesLoading)return;
    let previousHeight=element.scrollHeight;
    let frame=0;
    const pin=()=>{
      const height=element.scrollHeight;
      const grew=height>previousHeight;
      const wasNearBottom=previousHeight-element.scrollTop-element.clientHeight<110;
      previousHeight=height;
      if(!followBottomRef.current && !(grew&&wasNearBottom))return;
      window.cancelAnimationFrame(frame);
      frame=window.requestAnimationFrame(()=>{
        if(scrollRef.current===element&&activeScrollKey.current===key)
          element.scrollTop=element.scrollHeight;
      });
    };
    let observer:ResizeObserver|null=null;
    if(typeof ResizeObserver!=='undefined'){
      observer=new ResizeObserver(pin);
      observer.observe(content);
      observer.observe(element);
    }
    const openingFrame=window.requestAnimationFrame(pin);
    return ()=>{
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(openingFrame);
    };
  },[active,channelOpen,currentMessageKey,messagesForKey,messagesLoading,voiceTextExpanded]);
  useEffect(()=>{
    if(activeChannel?.kind==='text'||!voiceTextExpanded)return;
    const frame=window.requestAnimationFrame(()=>{
      const el=scrollRef.current;
      if(el)el.scrollTop=el.scrollHeight;
    });
    return ()=>window.cancelAnimationFrame(frame);
  },[voiceTextExpanded,channelId,activeChannel?.kind]);

  // A message is read only while its text chat panel is actually open, not merely
  // selected by default in the community sidebar. Never mark unseen messages
  // in background tabs; the cursor is tied to a message present in our response.
  useEffect(()=>{
    if(!active||!channelOpen||!selectedId||!channelId||!activeChannel||
       messagesForKey!==currentMessageKey||
       (activeChannel.kind!=='text'&&!voiceTextExpanded)||
       document.visibilityState!=='visible'||messagesLoading)return;
    const lastMessageId=messages.at(-1)?.id;
    if(!lastMessageId)return;
    const key=selectedId+'/'+channelId;
    if(acknowledged.current.get(key)===lastMessageId)return;
    let cancelled=false;
    const timer=window.setTimeout(()=>{
      void api('/api/v1/communities/'+selectedId+'/channels/'+channelId+'/read',
        body({lastMessageId})).then(()=>{
        if(cancelled)return;
        acknowledged.current.set(key,lastMessageId);
        clearReadPush({kind:'community',channelId});
        window.dispatchEvent(new CustomEvent('uorqui:community-channel-read',{
          detail:{channelId,communityId:selectedId}}));
      }).catch(()=>{/* Leave badge intact and retry after next successful load. */});
    },250);
    return ()=>{cancelled=true;window.clearTimeout(timer);};
  },[active,channelOpen,selectedId,channelId,activeChannel?.kind,voiceTextExpanded,messages,messagesLoading,messagesForKey,currentMessageKey]);

  async function refresh(id=selectedId){
    await loadList();
    if(id)await loadDetail(id);
  }
  async function act(run:()=>Promise<unknown>,success:string,id=selectedId,key='action'){
    if(busy)return false;
    setBusy(true);setBusyAction(key);setError('');setNotice('');
    try{await run();await refresh(id);setNotice(success);return true;}
    catch(reason){
      const err=reason instanceof Error?reason.message:'';
      setError(err==='SLUG_TAKEN'?(pt?'Este endereço já está em uso.':'This address is taken.')
        :err==='REQUEST_COOLDOWN'?(pt?'Você precisa aguardar antes de tentar novamente.':'Please wait before retrying.')
        :err==='CHANNEL_EXISTS'?(pt?'Já existe um canal desse tipo com esse nome.':'A channel of this type already has that name.')
        :err==='COMMUNITY_LIMIT'?(pt?'Limite de comunidades criadas atingido.':'Community creation limit reached.')
        :err==='OWNER_CANNOT_LEAVE'?(pt?'O proprietário não pode sair sem transferir a comunidade.':'Owners cannot leave without transferring ownership.')
        :(pt?'Não foi possível concluir a operação.':'Could not complete this operation.'));
      return false;
    }finally{setBusy(false);setBusyAction(null);}
  }

  function selectCommunity(id:string){
    requestedChannel.current=null;
    closeChannel();setSelectedId(id);setCreateOpen(false);
    setError('');setNotice('');
  }
  function openUnread(location:UnreadLocation){
    requestedChannel.current={communityId:location.communityId,channelId:location.channelId};
    setSelectedId(location.communityId);setCreateOpen(false);
    setChannelId(location.channelId);setChannelOpen(true);setVoiceMinimized(true);
    setError('');setNotice('');
    if(location.channelKind!=='text' && voicePhase==='idle'){
      // Reading room text must not automatically join a voice call.
      setActiveVoiceRoom(null);
    }
  }
  async function create(event:FormEvent){
    event.preventDefault();
    if(!allowedSlug.test(createSlug)) {setError(pt?'Use um endereço com letras minúsculas, números ou hífens (3–64).':'Use a lowercase slug, numbers or hyphens (3–64).');return;}
    if(busy)return;
    setBusy(true);setBusyAction('create');setError('');
    try{
      const result=await api<{id:string}>('/api/v1/communities',body({
        name:createName.trim(),slug:createSlug.trim(),description:createDescription.trim(),visibility:createVisibility
      }));
      await loadList();
      selectCommunity(result.id);
      setCreateName('');setCreateSlug('');setSlugTouched(false);setCreateDescription('');
    }catch(reason){setError(reason instanceof Error&&reason.message==='SLUG_TAKEN'
      ?(pt?'Este endereço já pertence a uma comunidade.':'This slug already exists.')
      :(pt?'Falha ao criar comunidade.':'Could not create community.'));}
    finally{setBusy(false);setBusyAction(null);}
  }
  async function unlockChannel(event:FormEvent){
    event.preventDefault();
    if(!selectedId||!channelId||!unlockPassword||unlockBusy)return;
    setUnlockBusy(true);setUnlockError('');
    try{
      await api('/api/v1/communities/'+selectedId+'/channels/'+channelId+'/unlock',body({password:unlockPassword}));
      setUnlockPassword('');
      await loadDetail(selectedId);
    }catch(e){
      const code=e instanceof Error?e.message:'';
      setUnlockError(code==='CHANNEL_PASSWORD_RATE_LIMIT'?(pt?'Muitas tentativas. Tente novamente em 15 minutos.':'Too many attempts. Try again in 15 minutes.'):
        code==='INVALID_CHANNEL_PASSWORD'?(pt?'Senha incorreta.':'Incorrect password.'):
        (pt?'Não foi possível desbloquear o canal.':'Could not unlock the channel.'));
    }finally{setUnlockBusy(false);}
  }
  async function updateChannelSettings(operation:'name'|'password'|'remove'){
    if(!selectedId||!activeChannel||!community||!manage(community)||channelSettingsBusy)return;
    const name=channelSettingsName.trim();
    if(operation==='name'&&(name.length<2||name.length>64||name===activeChannel.name))return;
    if(operation==='password'&&(channelSettingsPassword.length<8||channelSettingsPassword.length>72))return;
    setChannelSettingsBusy(operation);setChannelSettingsError('');
    try{
      const endpoint='/api/v1/communities/'+selectedId+'/channels/'+activeChannel.id;
      await api(endpoint+(operation==='name'?'':'/password'),{
        method:operation==='name'?'PATCH':'PUT',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(operation==='name'?{name}:{password:operation==='remove'?null:channelSettingsPassword})
      });
      await loadDetail(selectedId);
      setChannelSettingsPassword('');setChannelRemoveConfirm(false);setChannelSettingsOpen(false);
      setNotice(operation==='name'?(pt?'Nome do canal atualizado.':'Channel name updated.'):
        operation==='password'?(pt?'Senha do canal atualizada.':'Channel password updated.'):
        (pt?'Senha do canal removida.':'Channel password removed.'));
    }catch(reason){
      const code=reason instanceof Error?reason.message:'';
      setChannelSettingsError(code==='CHANNEL_EXISTS'?(pt?'Já existe um canal desse tipo com esse nome.':'A channel of this type already has that name.'):
        code==='ADMIN_REQUIRED'||code==='Forbidden'?(pt?'Você não tem permissão para editar este canal.':'You cannot edit this channel.'):
        (pt?'Não foi possível salvar as alterações.':'Could not save changes.'));
    }finally{setChannelSettingsBusy(null);}
  }
  async function updateChannelAccessMode(){
    if(!selectedId||!activeChannel||!community||!manage(community)||channelSettingsBusy||
       channelSettingsAccessMode===(activeChannel.accessMode??'open'))return;
    setChannelSettingsBusy('access');setChannelSettingsError('');
    try{
      await api('/api/v1/communities/'+selectedId+'/channels/'+activeChannel.id+'/access',{
        method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({accessMode:channelSettingsAccessMode})
      });
      await loadDetail(selectedId);
      setChannelSettingsOpen(false);
      setNotice(channelSettingsAccessMode==='restricted'
        ?(pt?'Canal fechado. Libere os membros em Moderação.':'Channel closed. Assign members in Moderation.')
        :(pt?'Canal aberto para os membros da comunidade.':'Channel open to community members.'));
    }catch{
      setChannelSettingsError(pt?'Não foi possível alterar o acesso do canal.':'Could not change channel access.');
    }finally{setChannelSettingsBusy(null);}
  }
  async function createChannel(event:FormEvent){
    event.preventDefault();
    if(!selectedId||!newChannelName.trim())return;
    const created=await act(()=>api('/api/v1/communities/'+selectedId+'/channels',body({name:newChannelName.trim(),kind:newChannelKind,accessMode:newChannelAccessMode})),
      pt?'Canal criado.':'Channel created.',selectedId,'createChannel');
    if(created){setNewChannelOpen(false);setNewChannelName('');setNewChannelAccessMode('open');}
  }
  async function invite(event:FormEvent){
    event.preventDefault();
    if(!selectedId)return;
    const handle=inviteHandle.trim().replace(/^@/,'').toLowerCase();
    if(!/^[a-z][a-z0-9_]{2,31}$/.test(handle)){setError(pt?'Digite um @usuário válido.':'Enter a valid @username.');return;}
    await act(()=>api('/api/v1/communities/'+selectedId+'/invite',body({handle})),
      pt?'Convite enviado.':'Invitation sent.',selectedId,'inviteUser');
    setInviteHandle('');
  }
  function releasePending(clientId:string){
    pendingFiles.current.delete(clientId);
    const url=pendingBlobUrls.current.get(clientId);
    if(url){URL.revokeObjectURL(url);pendingBlobUrls.current.delete(clientId);}
  }
  async function submitPending(p:PendingMessage){
    const currentCommunity=selectedId;
    if(!currentCommunity)return;
    try{
      if(p.attachment){
        const file=pendingFiles.current.get(p.clientId);
        if(!file)throw Error('MISSING_ATTACHMENT');
        const response=await fetch('/api/media/community-attachment/'+currentCommunity+'/'+p.channelId,{
          method:'POST',credentials:'same-origin',cache:'no-store',
          headers:{
            'Content-Type':p.attachment.type,
            'x-uorqui-client-id':p.clientId,
            'x-uorqui-filename':encodeURIComponent(p.attachment.name),
            ...(p.body?{'x-uorqui-caption':encodeURIComponent(p.body)}:{})
          },body:file
        });
        if(!response.ok)throw Error('UPLOAD_'+response.status);
      }else{
        await api('/api/v1/communities/'+currentCommunity+'/channels/'+p.channelId+'/messages',
          body({clientId:p.clientId,body:p.body}));
      }
      if(channelId===p.channelId&&currentCommunity){
        const updated=await api<{messages:Message[]}>('/api/v1/communities/'+currentCommunity+'/channels/'+p.channelId+'/messages');
        putCommunityMessages(myId,currentCommunity,p.channelId,updated.messages);
        setMessages(old=>reconcileCommunityMessages(old,updated.messages));
        setPendingMessages(old=>old.filter(msg=>msg.clientId!==p.clientId || !updated.messages.some(m=>m.clientId===msg.clientId)));
        if(updated.messages.some(m=>m.clientId===p.clientId))releasePending(p.clientId);
      }else{
        setPendingMessages(old=>old.filter(x=>x.clientId!==p.clientId));
        releasePending(p.clientId);
      }
    }catch{
      setPendingMessages(old=>old.map(x=>x.clientId===p.clientId?{...x,pending:'failed'}:x));
    }
  }
  function enqueueMessage(text:string,attachment?:File){
    const selected=channelId;
    if(!community?.myRole||!activeChannel||!selectedId||!selected||
      (!text.trim()&&!attachment)||text.length>4000)return;
    const clientId=crypto.randomUUID(),now=new Date().toISOString();
    const preview=attachment?URL.createObjectURL(attachment):null;
    if(attachment){
      pendingFiles.current.set(clientId,attachment);
      if(preview)pendingBlobUrls.current.set(clientId,preview);
    }
    const pending:PendingMessage={id:clientId,clientId,channelId:selected,body:text.trim(),createdAt:now,
      authorHandle:'',authorName:pt?'Você':'You',authorAvatar:null,editedAt:null,deletedAt:null,
      canEdit:false,canDelete:false,canReact:false,reactions:[],pending:'sending',
      attachment:attachment?{id:clientId,name:attachment.name,type:attachment.type||'application/octet-stream',size:attachment.size}:null,
      attachmentUrl:preview};
    setPendingMessages(old=>[...old,pending]);
    setError('');
    window.requestAnimationFrame(()=>scrollRef.current?.scrollTo({top:scrollRef.current.scrollHeight,behavior:'smooth'}));
    void submitPending(pending);
  }
  function queueText(text:string,clearDraft=false){
    if(!text.trim())return;
    enqueueMessage(text);
    if(clearDraft)setDraft('');
  }
  function send(){
    queueText(draft.trim(),true);
  }
  function sendAttachment(file:File,caption:string){
    const mime=file.type||'application/octet-stream';
    const allowed=new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
      'video/mp4','video/webm','video/quicktime','application/pdf','text/plain','application/zip',
      'application/octet-stream','audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav','audio/x-m4a','audio/aac']);
    if(!file.size||file.size>50*1024*1024||!allowed.has(mime)){
      setError(pt?'Arquivo inválido ou maior que 50 MB.':'Invalid file or larger than 50 MB.');return;
    }
    enqueueMessage(caption,file);
  }
  function retryPending(p:PendingMessage){
    setPendingMessages(old=>old.map(x=>x.clientId===p.clientId?{...x,pending:'sending'}:x));
    void submitPending({...p,pending:'sending'});
  }
  async function updateMessage(event:FormEvent){
    event.preventDefault();
    if(!selectedId||!channelId||!editingId||!editingBody.trim()||busy)return;
    setBusy(true);setError('');
    try{
      setBusyAction('editMessage');
      await api('/api/v1/communities/'+selectedId+'/channels/'+channelId+'/messages/'+editingId,{
        method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:editingBody.trim()})
      });
      const updated=await api<{messages:Message[]}>(`/api/v1/communities/${selectedId}/channels/${channelId}/messages`);
      putCommunityMessages(myId,selectedId,channelId,updated.messages);
      setMessages(old=>reconcileCommunityMessages(old,updated.messages));setEditingId(null);setEditingBody('');
    }catch{setError(pt?'Não foi possível editar a mensagem.':'Could not edit message.');}
    finally{setBusy(false);setBusyAction(null);}
  }
  async function removeMessage(messageId:string){
    if(!selectedId||!channelId||busy)return;
    if(deletingId!==messageId){setDeletingId(messageId);return;}
    setBusy(true);setError('');
    try{
      setBusyAction('deleteMessage:'+messageId);
      await api('/api/v1/communities/'+selectedId+'/channels/'+channelId+'/messages/'+messageId,{method:'DELETE'});
      const prior=messages.find(item=>item.id===messageId);
      if(prior?.attachment)invalidateChatMedia(prior.attachmentUrl||
        '/media/community-attachment/'+selectedId+'/'+channelId+'/'+prior.attachment.id);
      const updated=await api<{messages:Message[]}>(`/api/v1/communities/${selectedId}/channels/${channelId}/messages`);
      putCommunityMessages(myId,selectedId,channelId,updated.messages);
      setMessages(old=>reconcileCommunityMessages(old,updated.messages));setDeletingId(null);
    }catch{setError(pt?'Não foi possível cancelar a mensagem.':'Could not remove message.');}
    finally{setBusy(false);setBusyAction(null);}
  }
  async function toggleReaction(message:Message,emoji:string,mine:boolean){
    if(!selectedId||!channelId||!message.canReact||message.deletedAt||reactionSubmitting.current)return;
    const key=selectedId+'/'+channelId+'/'+message.id;
    reactionSubmitting.current=key;setReactionBusyId(message.id);setError('');
    try{
      const result=await api<{reactions:CommunityReaction[]}>(
        '/api/v1/communities/'+selectedId+'/channels/'+channelId+'/messages/'+message.id+'/reactions',{
          method:mine?'DELETE':'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({emoji})
        });
      setMessages(old=>old.map(item=>item.id===message.id?{...item,reactions:result.reactions}:item));
      setReactionPickerId(null);
    }catch{
      setError(pt?'Não foi possível atualizar a reação.':'Could not update reaction.');
    }finally{
      reactionSubmitting.current=null;setReactionBusyId(null);
    }
  }

  const owned=list.filter(group=>group.myRole);
  const homeGroups=(directory ? list.filter(group=>group.visibility!=='private') : [...owned,...list.filter(group=>!group.myRole&&group.requestKind==='invite'&&group.requestStatus==='pending')])
    .filter(group=>(group.name+' '+group.slug).toLocaleLowerCase(locale).includes(communitySearch.toLocaleLowerCase(locale)));
  const visibilityLabel=(v:Visibility)=>v==='public'?(pt?'Pública':'Public'):v==='approval'?(pt?'Por aprovação':'Approval required'):(pt?'Privada':'Private');
  const communityAvatar=(group:Community,classes:string)=><CommunityAvatarImage
    url={group.avatarUrl} name={group.name} classes={classes}/>;

  const voiceInline=Boolean(activeVoiceRoom&&active&&channelOpen&&!voiceMinimized&&!createOpen&&
    community?.id===activeVoiceRoom.communityId&&activeChannel?.id===activeVoiceRoom.channelId&&
    activeChannel?.kind!=='text');

  return <div className="flex h-full min-h-0 w-full min-w-0 overflow-hidden">
    <nav data-uorqui-community-rail aria-label={pt?'Minhas comunidades':'My communities'}
      className={cn('relative z-20 w-14 shrink-0 flex-col items-center gap-3 overflow-y-auto overscroll-contain border-r border-border bg-card/95 py-4',
        channelOpen?'hidden md:flex':'flex')}>
      {owned.map(group=><button type="button" key={group.id} title={group.name}
        aria-label={group.name+(unreadCommunities[group.id]?' · '+unreadCommunities[group.id]+(pt?' mensagens não lidas':' unread messages'):'')}
        aria-current={selectedId===group.id&&!createOpen?'page':undefined}
        onClick={()=>selectCommunity(group.id)} className={cn('relative grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/15 text-base font-semibold text-primary hover:bg-primary/25',selectedId===group.id&&!createOpen&&'ring-2 ring-primary')}>
        <span className="grid size-full place-items-center overflow-hidden rounded-2xl">{communityAvatar(group,'size-full rounded-2xl')}</span>
        {!!unreadCommunities[group.id]&&<span aria-hidden="true"
          className="absolute -right-1.5 -top-1.5 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-card bg-destructive px-1 text-[10px] font-bold text-white">
          {unreadCommunities[group.id]>99?'99+':unreadCommunities[group.id]}
        </span>}
      </button>)}
      <button type="button" onClick={()=>{closeChannel();setSelectedId(null);setCreateOpen(true);}}
        aria-label={pt?'Criar comunidade':'Create community'} title={pt?'Criar comunidade':'Create community'}
        className="grid size-11 shrink-0 place-items-center rounded-2xl border border-dashed border-primary/60 text-primary hover:bg-secondary">
        <Plus className="size-5"/>
      </button>
      <button type="button" onClick={()=>{closeChannel();setSelectedId(null);setCreateOpen(false);setDirectory(true);}}
        aria-label={pt?'Comunidades públicas':'Public communities'} title={pt?'Comunidades públicas':'Public communities'}
        className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-secondary"><Search className="size-5"/></button>
    </nav>

    <section data-uorqui-channel-nav aria-label={pt?'Comunidades e canais':'Communities and channels'}
      className={cn('h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-r border-border bg-card/25 md:flex md:w-64 md:shrink-0',channelOpen?'hidden':'flex')}>
      {createOpen||!selectedId?<div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 space-y-3 border-b border-border bg-card/95 p-4">
          <h2 className="text-lg font-semibold tracking-tight">{createOpen?(pt?'Criar comunidade':'Create community'):(pt?'Comunidades':'Communities')}</h2>
          {!createOpen&&<><div className="uorqui-inbox-filters flex gap-1" role="group" aria-label={pt?'Filtrar comunidades':'Filter communities'}>
            <button type="button" aria-pressed={!directory} onClick={()=>setDirectory(false)} className="min-h-10 rounded-md px-3 text-xs">{pt?'Suas comunidades':'Your communities'}</button>
            <button type="button" aria-pressed={directory} onClick={()=>setDirectory(true)} className="min-h-10 rounded-md px-3 text-xs">{pt?'Públicas':'Public'}</button>
          </div><Input value={communitySearch} onChange={event=>setCommunitySearch(event.target.value)} aria-label={pt?'Buscar comunidades':'Search communities'} placeholder={pt?'Buscar comunidades…':'Search communities…'} className="h-10 text-base md:text-sm"/></>}
          <Button className="w-full" size="sm" variant={createOpen?'outline':'secondary'}
            onClick={()=>{setCreateOpen(v=>!v);setError('');}}>{createOpen?<X className="size-4"/>:<Plus className="size-4"/>}
            {createOpen?(pt?'Fechar formulário':'Close form'):(pt?'Nova comunidade':'New community')}</Button>
        </div>
        <div className={hidden+' p-3'}>
          {!!unreadLocations.length&&!createOpen&&<section className="mb-4 rounded-xl border border-border bg-card p-3" aria-label={pt?'Canais com mensagens novas':'Channels with new messages'}>
            <p className="mb-2 text-xs font-semibold text-primary">{pt?'Mensagens não lidas':'Unread messages'}</p>
            <div className="space-y-1">
              {unreadLocations.map(item=><button key={item.channelId} type="button" onClick={()=>openUnread(item)}
                className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-xs hover:bg-secondary">
                <span className="min-w-0 flex-1 truncate"><strong>{item.communityName}</strong> · {item.channelKind==='voice'?'🔊':item.channelKind==='meeting'?'📹':'#'} {item.channelName}</span>
                <span className="rounded-full bg-destructive px-1.5 py-0.5 font-bold text-white">{item.count>99?'99+':item.count}</span>
              </button>)}
            </div>
          </section>}
          {!loading&&!owned.length&&!createOpen&&<section className="mb-4 space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <h3 className="text-sm font-semibold">{pt?'Comece por uma comunidade':'Start with a community'}</h3>
            <p className="text-xs leading-5 text-muted-foreground">{pt?'Encontre uma comunidade para participar ou crie a sua.':'Find a community to join or create your own.'}</p>
            <p className="text-xs text-muted-foreground">{pt?'Use o filtro Públicas para encontrar uma comunidade ou entre por um convite.':'Use the Public filter to find a community or join through an invitation.'}</p>
          </section>}
          {createOpen?<form onSubmit={event=>void create(event)} className="space-y-3">
            <label className="block text-xs font-medium">{pt?'Nome':'Name'}
              <Input value={createName} onChange={e=>{setCreateName(e.target.value);if(!slugTouched)setCreateSlug(e.target.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9-]+/g,'-').replace(/^-+/,'').slice(0,64));}}
                required minLength={2} maxLength={120} className="mt-1 text-base" placeholder={pt?'Minha comunidade':'My community'}/></label>
            <label className="block text-xs font-medium">{pt?'Endereço':'Slug'}
              <Input required value={createSlug} onChange={e=>{setSlugTouched(true);setCreateSlug(e.target.value.toLowerCase());}} maxLength={64}
                className="mt-1 text-base" placeholder="minha-comunidade"/></label>
            <label className="block text-xs font-medium">{pt?'Descrição':'Description'}
              <textarea value={createDescription} onChange={e=>setCreateDescription(e.target.value)} maxLength={500} rows={3}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"/></label>
            <label className="block text-xs font-medium">{pt?'Privacidade':'Visibility'}
              <select value={createVisibility} onChange={e=>setCreateVisibility(e.target.value as Visibility)}
                className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-2 text-base">
                <option value="public">{pt?'Pública (entrada livre)':'Public (open join)'}</option>
                <option value="approval">{pt?'Por aprovação':'Approval required'}</option>
                <option value="private">{pt?'Privada (somente convite)':'Private (invitation only)'}</option>
              </select></label>
            <Button type="submit" className="w-full" loading={busyAction==='create'} disabled={busy||createName.trim().length<2||!allowedSlug.test(createSlug)}>
              <Plus className="size-4"/>{pt?'Criar comunidade':'Create community'}</Button>
          </form>:<div className="space-y-2">
            {loading&&<WorkspaceContentLoading label={pt?'Carregando comunidades':'Loading communities'} rows={4} className="p-3"/>}
            {homeGroups.map(group=><button type="button" key={group.id} onClick={()=>selectCommunity(group.id)}
              className="flex w-full items-start gap-3 rounded-xl p-3 text-left hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring">
              <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary/15 font-bold text-primary">{communityAvatar(group,'size-full rounded-xl')}</div>
              <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{group.name}</strong>
                <span className="block truncate text-xs text-muted-foreground">{group.requestKind==='invite'&&group.requestStatus==='pending'?(pt?'Convite recebido':'Invitation received'):
                  visibilityLabel(group.visibility)+' · '+group.memberCount+' '+(pt?'membros':'members')}</span>
              </span>
            </button>)}
            {!loading&&!homeGroups.length&&<p className="p-4 text-center text-sm text-muted-foreground">
              {pt?'Nenhuma comunidade encontrada. Use o filtro Públicas ou crie a sua.':'No communities found. Use the Public filter or create your own.'}
            </p>}
          </div>}
        </div>
      </div>:<>
        <div className="shrink-0 border-b border-border bg-card/95 p-4">
          <button type="button" onClick={()=>{closeChannel();setSelectedId(null);setCreateOpen(false);}}
            className="mb-3 flex min-h-9 items-center gap-2 rounded-md text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5"/>{pt?'Todas as comunidades':'All communities'}
          </button>
          {detailLoading?<div className="space-y-2"><Skeleton className="h-5 w-3/4"/><Skeleton className="h-3 w-1/2"/></div>:
          <div className="flex items-center gap-2">
            {community?.avatarUrl&&<div className="size-10 shrink-0 overflow-hidden rounded-xl"><CommunityAvatarImage
              url={community.avatarUrl} name={community.name} classes="block size-full object-cover"/></div>}
            <div className="min-w-0 flex-1 truncate text-base font-semibold">{community?.name??(pt?'Comunidade':'Community')}</div>
          </div>}
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{community?.description|| (community?visibilityLabel(community.visibility):'…')}</p>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="size-3.5"/>{community?.memberCount??'…'} {pt?'membros':'members'}
            {community?.visibility==='private'&&<LockKeyhole className="size-3.5"/>}
          </div>
        </div>
        <div className={hidden+' space-y-4 p-3'}>
          {!!unreadLocations.length&&<section aria-label={pt?'Comunidades e canais com mensagens não lidas':'Communities and channels with unread messages'} className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="mb-2 text-xs font-semibold">{pt?'Mensagens não lidas':'Unread messages'}</p>
            <div className="space-y-1">
              {unreadLocations.map(item=><button type="button" key={item.channelId}
                onClick={()=>openUnread(item)} className="flex min-h-9 w-full items-center gap-2 rounded-lg bg-card px-2.5 py-1.5 text-left text-xs hover:bg-secondary">
                <span className="min-w-0 flex-1 truncate"><strong>{item.communityName}</strong> · {item.channelKind==='voice'?'🔊':item.channelKind==='meeting'?'📹':'#'} {item.channelName}</span>
                <span className="rounded-full bg-destructive px-1.5 py-0.5 font-bold text-white">{item.count>99?'99+':item.count}</span>
              </button>)}
            </div>
          </section>}
          {community&&!memberView(community)&&<div className="space-y-3 rounded-xl border border-border bg-card p-3">
            <p className="text-sm text-muted-foreground">{community.visibility==='private'?(pt?'Entrada apenas por convite.':'Invitation only.'):
              community.visibility==='approval'?(pt?'O responsável aprova a entrada.':'A manager approves requests.'):(pt?'Entre para acessar os canais.':'Join to access channels.')}</p>
            {community.requestKind==='invite'&&community.requestStatus==='pending'?<div className="flex flex-wrap gap-2">
              <Button size="sm" loading={busyAction==='acceptInvite'} disabled={busy} onClick={()=>void act(()=>api('/api/v1/communities/'+community.id+'/invite/accept',{method:'POST'}),pt?'Convite aceito.':'Invitation accepted.',community.id,'acceptInvite')}><Check className="size-4"/>{pt?'Aceitar convite':'Accept invite'}</Button>
              <Button size="sm" variant="outline" loading={busyAction==='declineInvite'} disabled={busy} onClick={()=>void act(()=>api('/api/v1/communities/'+community.id+'/invite/decline',{method:'POST'}),pt?'Convite recusado.':'Invitation declined.',community.id,'declineInvite')}><X className="size-4"/>{pt?'Recusar':'Decline'}</Button>
            </div>:community.requestKind==='join'&&community.requestStatus==='pending'?
              <p className="text-xs font-medium text-primary">{pt?'Solicitação pendente':'Request pending'}</p>:
              community.visibility!=='private'&&<Button size="sm" loading={busyAction==='joinCommunity'} disabled={busy} onClick={()=>void act(()=>api('/api/v1/communities/'+community.id+'/join',{method:'POST'}),pt?'Solicitação registrada ou entrada concluída.':'Joined or request submitted.',community.id,'joinCommunity')}>
                <UserPlus className="size-4"/>{community.visibility==='approval'?(pt?'Solicitar entrada':'Request to join'):(pt?'Entrar':'Join')}</Button>}
          </div>}
          {community&&memberView(community)&&<>
            <section><p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{pt?'Canais de texto':'Text channels'}</p>
              {detail?.channels.filter(ch=>ch.kind==='text').map(ch=><button type="button" key={ch.id}
                aria-label={ch.name+(unreadChannels[ch.id]?' · '+unreadChannels[ch.id]+(pt?' não lidas':' unread'):'')}
                onClick={()=>{if(voicePhase==='idle')setActiveVoiceRoom(null);setVoiceMinimized(true);setMediaPicker(null);setChannelId(ch.id);setChannelOpen(true);setError('');setUnlockPassword('');setUnlockError('');}}
                className={cn('mb-1 flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm hover:bg-secondary',channelId===ch.id&&channelOpen&&'bg-secondary font-semibold')}>
                <Hash className="size-4 shrink-0 text-muted-foreground"/><span className="min-w-0 flex-1 truncate">{ch.name}</span>{(ch.hasPassword||ch.accessMode==='restricted')&&<LockKeyhole aria-label={pt?(ch.accessMode==='restricted'?'Canal fechado':'Canal com senha'):(ch.accessMode==='restricted'?'Closed channel':'Password-protected channel')} className="size-3.5 shrink-0 text-primary"/>}
                {!!unreadChannels[ch.id]&&<span aria-hidden="true"
                  className="grid min-h-5 min-w-5 shrink-0 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                  {unreadChannels[ch.id]>99?'99+':unreadChannels[ch.id]}</span>}
              </button>)}</section>
            {(['voice','meeting'] as const).map(roomKind=><section key={roomKind}><p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{roomKind==='meeting'?(pt?'Salas de reunião':'Video meetings'):(pt?'Salas de voz':'Voice rooms')}</p>
              {detail?.channels.filter(ch=>ch.kind===roomKind).map(ch=>{
                const occupants=activeVoiceRoom?.communityId===selectedId&&activeVoiceRoom.channelId===ch.id&&voiceParticipants.length
                  ?voiceParticipants:(voiceRooms[ch.id]??[]);
                return <div key={ch.id} className="mb-1">
                  <button type="button" onClick={()=>{
                      setMediaPicker(null);setChannelId(ch.id);setChannelOpen(true);setError('');setUnlockPassword('');setUnlockError('');
                      if(!ch.hasPassword||ch.unlocked)openVoiceRoom({communityId:selectedId!,channelId:ch.id,communityName:community.name,channelName:ch.name,kind:ch.kind as 'voice'|'meeting'});
                    }}
                    className={cn('flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm hover:bg-secondary',channelId===ch.id&&channelOpen&&'bg-secondary font-semibold')}>
                    {ch.kind==='meeting'?<Video className={cn('size-4 shrink-0',occupants.length?'text-emerald-500':'text-muted-foreground')}/>:<Volume2 className={cn('size-4 shrink-0',occupants.length?'text-emerald-500':'text-muted-foreground')}/>}
                    <span className="min-w-0 flex-1 truncate">{ch.name}</span>{(ch.hasPassword||ch.accessMode==='restricted')&&<LockKeyhole aria-label={pt?(ch.accessMode==='restricted'?'Canal fechado':'Canal com senha'):(ch.accessMode==='restricted'?'Closed channel':'Password-protected channel')} className="size-3.5 shrink-0 text-primary"/>}
                    {!!unreadChannels[ch.id]&&<span aria-label={unreadChannels[ch.id]+(pt?' mensagens não lidas':' unread messages')}
                      className="grid min-h-5 min-w-5 shrink-0 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                      {unreadChannels[ch.id]>99?'99+':unreadChannels[ch.id]}</span>}
                    {!!occupants.length&&<span aria-label={occupants.length+(pt?' na sala':' in room')}
                      className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">{occupants.length}</span>}
                    {voicePresenceLoading&&!occupants.length&&<Spinner className="size-3.5 text-muted-foreground"/>}
                  </button>
                  {!!occupants.length&&<div className="ml-5 space-y-0.5 border-l border-border/70 py-1 pl-2"
                    aria-label={pt?'Pessoas na sala '+ch.name:'People in '+ch.name}>
                    {occupants.map(person=><div key={person.sessionId}
                      className="flex min-h-9 items-center gap-2 rounded-lg px-2 py-1 text-xs text-muted-foreground"
                      title={person.displayName}>
                      <span className={cn('size-2 shrink-0 rounded-full',person.speaking?'animate-pulse bg-emerald-500':'bg-emerald-500/50')}
                        aria-label={person.speaking?(pt?'Falando':'Speaking'):(pt?'Conectado':'Connected')}/>
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                        {person.displayName}{person.isSelf&&(pt?' (você)':' (you)')}</span>
                      <span title={person.muted?(pt?'Microfone desligado':'Microphone muted'):(pt?'Microfone ligado':'Microphone on')}
                        aria-label={person.muted?(pt?'Microfone desligado':'Microphone muted'):(pt?'Microfone ligado':'Microphone on')}>
                        {person.muted?<MicOff className="size-3.5 shrink-0 text-destructive"/>:
                          <Mic className="size-3.5 shrink-0 text-muted-foreground"/>}
                      </span>
                      <span title={person.deafened?(pt?'Áudio desligado':'Audio off'):(pt?'Áudio ligado':'Audio on')}
                        aria-label={person.deafened?(pt?'Áudio desligado':'Audio off'):(pt?'Áudio ligado':'Audio on')}>
                        {person.deafened?<VolumeX className="size-3.5 shrink-0 text-destructive"/>:
                          <Volume2 className="size-3.5 shrink-0 text-muted-foreground"/>}
                      </span>
                    </div>)}
                  </div>}
                </div>;
              })}
              {voicePresenceFailed&&<p role="status" className="px-2 text-xs text-muted-foreground">
                {pt?'Atualizando a lista de participantes…':'Updating the participant list…'}
              </p>}</section>)}
            {manage(community)&&<section className="space-y-2 border-t border-border pt-3">
              <button type="button" className="flex w-full items-center gap-2 rounded-xl p-2 text-sm text-primary hover:bg-secondary"
                onClick={()=>setNewChannelOpen(v=>!v)}><Plus className="size-4"/>{pt?'Novo canal':'New channel'}</button>
              {newChannelOpen&&<form className="space-y-2" onSubmit={event=>void createChannel(event)}>
                <Input required value={newChannelName} onChange={e=>setNewChannelName(e.target.value)} maxLength={64}
                  className="text-base" placeholder={pt?'Nome do canal':'Channel name'}/>
                <select value={newChannelKind} onChange={e=>setNewChannelKind(e.target.value as 'text'|'voice'|'meeting')}
                  className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm">
                  <option value="text">{pt?'Texto':'Text'}</option><option value="voice">{pt?'Voz':'Voice'}</option><option value="meeting">{pt?'Reunião (áudio e vídeo)':'Meeting (audio and video)'}</option>
                </select>
                <label className="block space-y-1 text-xs font-medium">
                  <span>{pt?'Quem pode acessar':'Who can access'}</span>
                  <select value={newChannelAccessMode} onChange={event=>setNewChannelAccessMode(event.target.value as 'open'|'restricted')}
                    className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm">
                    <option value="open">{pt?'Aberto — todos os membros':'Open — all community members'}</option>
                    <option value="restricted">{pt?'Fechado — somente autorizados':'Closed — authorized members only'}</option>
                  </select>
                </label>
                <p className="text-xs text-muted-foreground">{pt?
                  'Canais de texto, voz e reunião podem compartilhar o nome. No mesmo tipo, o nome deve ser único.':
                  'Text, voice and meeting channels may share a name. Names must be unique within each type.'}</p>
                <Button size="sm" type="submit" loading={busyAction==='createChannel'} disabled={busy||newChannelName.trim().length<2}>{pt?'Criar canal':'Create channel'}</Button>
              </form>}
              <form className="space-y-2 pt-2" onSubmit={event=>void invite(event)}>
                <label className="text-xs font-semibold">{pt?'Convidar pelo @usuário':'Invite by @username'}</label>
                <Input value={inviteHandle} onChange={e=>setInviteHandle(e.target.value)} maxLength={40} className="text-base" placeholder="@usuario"/>
                <Button size="sm" variant="outline" type="submit" loading={busyAction==='inviteUser'} disabled={busy||!inviteHandle.trim()}><UserPlus className="size-4"/>{pt?'Convidar':'Invite'}</Button>
              </form>
              {!!detail?.pendingRequests.length&&<div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs font-semibold">{pt?'Pedidos de entrada':'Join requests'}</p>
                {detail.pendingRequests.map(person=><div key={person.handle} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {person.displayName} (@{person.handle})</span>
                  <Button size="sm" variant="outline" loading={busyAction==='approve:'+person.handle} disabled={busy} onClick={()=>void act(()=>api('/api/v1/communities/'+community.id+'/requests/'+person.handle+'/approve',{method:'POST'}),pt?'Membro aprovado.':'Member approved.',community.id,'approve:'+person.handle)}>
                    <Check className="size-4"/></Button>
                </div>)}
              </div>}
            </section>}
            <div className="space-y-2 border-t border-border pt-3">
              <Button variant="outline" size="sm" className="w-full" loading={shareBusy} onClick={()=>void shareCommunity()}>
                {pt?'Compartilhar comunidade':'Share community'}</Button>
              {shareOpen&&<div className="space-y-2 rounded-xl border border-border p-2">
                {inviteLink?<><p className="break-all text-[11px] text-muted-foreground">{window.location.origin+'/invite/'+inviteLink.id}</p>
                <p className="text-xs text-muted-foreground">{pt?'Toque em Copiar link para copiar o convite.':'Tap Copy link to copy this invitation.'}</p>
                <Button type="button" size="sm" className="w-full gap-2" onClick={()=>void copyInvite()}>
                  {shareCopyState==='copied'?<Check aria-hidden="true" className="size-4"/>:<Copy aria-hidden="true" className="size-4"/>}
                  {shareCopyState==='copied'?(pt?'Copiado!':'Copied!'):(pt?'Copiar link':'Copy link')}
                </Button>
                {manage(community)&&<Button type="button" size="sm" variant="outline" disabled={shareBusy} onClick={()=>{
                  if(!selectedId)return;setShareBusy(true);
                  void api<{link:{id:string;expiresAt:string}}>('/api/v1/communities/'+selectedId+'/share',body({}))
                    .then(data=>{setInviteLink(data.link);setShareNotice(pt?'Novo link criado; o anterior foi revogado.':'New link created; previous link revoked.');})
                    .catch(()=>setShareNotice(pt?'Falha ao renovar.':'Could not rotate invitation.'))
                    .finally(()=>setShareBusy(false));
                }}>{pt?'Gerar novo link':'Rotate invitation link'}</Button>}
                {manage(community)&&<Button type="button" size="sm" variant="ghost" className="w-full" disabled={shareBusy} onClick={()=>{
                  if(!selectedId)return;setShareBusy(true);
                  void api('/api/v1/communities/'+selectedId+'/share',{method:'DELETE'})
                    .then(()=>{setInviteLink(null);setShareNotice(pt?'Link revogado.':'Invitation revoked.');})
                    .catch(()=>setShareNotice(pt?'Falha ao revogar.':'Could not revoke link.'))
                    .finally(()=>setShareBusy(false));
                }}>{pt?'Revogar link':'Revoke link'}</Button>}</>:
                  <p className="text-xs text-muted-foreground">{pt?'Peça a um administrador para gerar o link.':'Ask an administrator to create an invitation link.'}</p>}
              </div>}
              {shareNotice&&<p role="status" className="break-words text-xs text-muted-foreground">{shareNotice}</p>}
            </div>
            {['owner','admin','moderator'].includes(community.myRole??'')&&
              <CommunityModerationPanel id={community.id} role={community.myRole as 'owner'|'admin'|'moderator'|'member'}
                name={community.name} description={community.description} visibility={community.visibility} avatarUrl={community.avatarUrl}
                channels={detail?.channels??[]} onChanged={()=>refresh(community.id)}
                onDeleted={async()=>{closeChannel();setDetail(null);setSelectedId(null);await loadList();}}/>}
            {community.myRole!=='owner'&&<Button variant="ghost" size="sm" className="w-full text-muted-foreground"
              loading={busyAction==='leaveCommunity'} disabled={busy} onClick={()=>void act(async()=>{
                await api('/api/v1/communities/'+community.id+'/membership',{method:'DELETE'});closeChannel();setSelectedId(null);setDetail(null);
              },pt?'Você saiu da comunidade.':'You left the community.',null,'leaveCommunity')}>{pt?'Sair da comunidade':'Leave community'}</Button>}
          </>}
        </div>
      </>}
    </section>

    <section aria-label={pt?'Conteúdo da comunidade':'Community content'}
      className={cn('h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden',channelOpen?'flex':'hidden md:flex')}>
      {community&&memberView(community)&&activeChannel&&!createOpen?<>
        <header data-uorqui-context-header className="relative z-20 flex h-16 min-h-16 shrink-0 items-center gap-3 border-b border-border bg-card/95 px-3 backdrop-blur sm:px-4">
          <Button type="button" size="icon" variant="ghost"
            className={activeChannel.kind!=='text'?'shrink-0':'shrink-0 md:hidden'}
            aria-label={pt?'Voltar aos canais':'Back to channels'} onClick={closeChannel}>
            <ArrowLeft className="size-5"/></Button>
          {activeChannel.kind==='meeting'?<Video className="size-5 text-muted-foreground"/>:activeChannel.kind==='voice'?<Volume2 className="size-5 text-muted-foreground"/>:<Hash className="size-5 text-muted-foreground"/>}
          <div className="min-w-0 flex-1"><h2 className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold">
            <span className="truncate">{activeChannel.name}</span>
            {(activeChannel.hasPassword||activeChannel.accessMode==='restricted')&&<LockKeyhole className="size-3.5 shrink-0 text-muted-foreground" aria-label={pt?(activeChannel.accessMode==='restricted'?'Canal fechado':'Canal com senha'):(activeChannel.accessMode==='restricted'?'Closed channel':'Password-protected channel')}/>} 
          </h2><p className="truncate text-xs text-muted-foreground">{community.name}</p></div>
          <Button type="button" size="sm" variant="ghost" className="shrink-0 gap-2 px-2 sm:px-3"
            aria-label={pt?'Convidar membro da comunidade para o canal':'Invite community member to channel'}
            onClick={()=>{setChannelSettingsOpen(false);setChannelInviteFilter('');setChannelInviteOpen(true);}}>
            <UserPlus className="size-4"/><span className="hidden sm:inline">{pt?'Convidar':'Invite'}</span>
          </Button>
          {manage(community)&&<div ref={channelSettingsRef} className="relative shrink-0">
            <Button type="button" size="sm" variant="ghost" className="gap-2 px-2 sm:px-3"
              aria-expanded={channelSettingsOpen} aria-controls="uorqui-channel-settings"
              aria-label={pt?'Editar nome, acesso e senha do canal':'Edit channel name, access and password'}
              onClick={()=>{
                setChannelSettingsOpen(old=>!old);setChannelSettingsName(activeChannel.name);
                setChannelSettingsPassword('');setChannelSettingsAccessMode(activeChannel.accessMode??'open');setChannelSettingsError('');setChannelRemoveConfirm(false);
              }}>
              <Pencil className="size-4"/><span className="hidden sm:inline">{pt?'Editar canal':'Edit channel'}</span>
            </Button>
            {channelSettingsOpen&&createPortal(<div ref={channelSettingsMenuRef}
              id="uorqui-channel-settings" role="group"
              aria-label={pt?'Configurações do canal':'Channel settings'}
              style={channelSettingsPosition?{top:channelSettingsPosition.top,left:channelSettingsPosition.left}:{visibility:'hidden'}}
              className="fixed z-[250] max-h-[calc(100dvh-6rem)] w-[calc(100vw-1.5rem)] max-w-[22rem] space-y-4 overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">{pt?'Editar canal':'Edit channel'}</h3>
                <Button type="button" size="icon" variant="ghost" aria-label={pt?'Fechar':'Close'}
                  onClick={()=>setChannelSettingsOpen(false)}><X className="size-4"/></Button>
              </div>
              {channelSettingsError&&<p role="alert" className="text-xs text-destructive">{channelSettingsError}</p>}
              <form className="space-y-2" onSubmit={event=>{event.preventDefault();void updateChannelSettings('name');}}>
                <label htmlFor="uorqui-channel-name" className="block text-xs font-medium">{pt?'Nome do canal':'Channel name'}</label>
                <Input id="uorqui-channel-name" type="text" required minLength={2} maxLength={64}
                  className="h-10 text-base" value={channelSettingsName}
                  onChange={event=>setChannelSettingsName(event.target.value)} disabled={channelSettingsBusy!==null}/>
                <Button type="submit" size="sm" className="w-full" loading={channelSettingsBusy==='name'}
                  disabled={channelSettingsBusy!==null||channelSettingsName.trim().length<2||
                    channelSettingsName.trim()===activeChannel.name}>
                  <Check className="size-4"/>{pt?'Salvar nome':'Save name'}</Button>
              </form>
              <div className="space-y-2 border-t border-border pt-3">
                <label htmlFor="uorqui-channel-access" className="block text-xs font-medium">
                  {pt?'Permissão de acesso':'Access permissions'}
                </label>
                <select id="uorqui-channel-access" value={channelSettingsAccessMode}
                  disabled={channelSettingsBusy!==null}
                  onChange={event=>setChannelSettingsAccessMode(event.target.value as 'open'|'restricted')}
                  className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm">
                  <option value="open">{pt?'Aberto — todos os membros':'Open — all members'}</option>
                  <option value="restricted">{pt?'Fechado — só membros autorizados':'Closed — permitted members only'}</option>
                </select>
                {channelSettingsAccessMode==='restricted'&&<p className="text-xs text-muted-foreground">
                  {pt?'Proprietário e administradores têm acesso automático. Autorize os demais usuários em Moderação > Membros.':
                    'Owner and admins have automatic access. Grant other members access in Moderation > Members.'}
                </p>}
                <Button type="button" size="sm" className="w-full"
                  loading={channelSettingsBusy==='access'} disabled={channelSettingsBusy!==null||
                    channelSettingsAccessMode===(activeChannel.accessMode??'open')}
                  onClick={()=>void updateChannelAccessMode()}>
                  <Check className="size-4"/>{pt?'Salvar acesso':'Save access'}
                </Button>
              </div>
              <form className="space-y-2 border-t border-border pt-3"
                onSubmit={event=>{event.preventDefault();void updateChannelSettings('password');}}>
                <label htmlFor="uorqui-channel-password" className="block text-xs font-medium">
                  {activeChannel.hasPassword?(pt?'Alterar senha':'Change password'):(pt?'Definir senha':'Set password')}
                </label>
                <Input id="uorqui-channel-password" type="password" autoComplete="new-password"
                  required minLength={8} maxLength={72} className="h-10 text-base"
                  placeholder={pt?'Mínimo de 8 caracteres':'At least 8 characters'}
                  value={channelSettingsPassword} onChange={event=>setChannelSettingsPassword(event.target.value)}
                  disabled={channelSettingsBusy!==null}/>
                <Button type="submit" size="sm" className="w-full" loading={channelSettingsBusy==='password'}
                  disabled={channelSettingsBusy!==null||channelSettingsPassword.length<8}>
                  <LockKeyhole className="size-4"/>{activeChannel.hasPassword?(pt?'Alterar senha':'Change password'):(pt?'Proteger canal':'Protect channel')}</Button>
              </form>
              {activeChannel.hasPassword&&<div className="space-y-2 border-t border-border pt-3">
                {channelRemoveConfirm&&<p className="text-xs text-muted-foreground">
                  {pt?'O canal ficará acessível sem senha. Confirme para continuar.':
                    'The channel will become accessible without a password. Confirm to continue.'}</p>}
                <Button type="button" size="sm" className="w-full" variant="outline"
                  loading={channelSettingsBusy==='remove'} disabled={channelSettingsBusy!==null}
                  onClick={()=>channelRemoveConfirm?void updateChannelSettings('remove'):setChannelRemoveConfirm(true)}>
                  <LockKeyholeOpen className="size-4"/>
                  {channelRemoveConfirm?(pt?'Confirmar remoção':'Confirm removal'):(pt?'Remover senha':'Remove password')}
                </Button>
                {channelRemoveConfirm&&<Button type="button" size="sm" variant="ghost" className="w-full"
                  onClick={()=>setChannelRemoveConfirm(false)} disabled={channelSettingsBusy!==null}>
                  {pt?'Cancelar':'Cancel'}
                </Button>}
              </div>}
            </div>,document.body)}
          </div>}
        </header>
        {channelLocked?<form className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-5 py-8 text-center" onSubmit={event=>void unlockChannel(event)}>
          <span className="grid size-14 place-items-center rounded-2xl bg-primary/10"><LockKeyhole className="size-7 text-primary"/></span>
          <h3 className="font-semibold">{pt?'Canal protegido por senha':'Password-protected channel'}</h3>
          <p className="max-w-xs text-sm text-muted-foreground">{pt?'Digite a senha do canal para acessar mensagens, arquivos e chamadas.':'Enter the channel password to access messages, files and calls.'}</p>
          <Input type="password" autoComplete="off" required maxLength={72} value={unlockPassword}
            onChange={event=>setUnlockPassword(event.target.value)} className="w-full max-w-xs text-base"
            placeholder={pt?'Senha do canal':'Channel password'} aria-label={pt?'Senha do canal':'Channel password'}/>
          {unlockError&&<p role="alert" className="max-w-xs text-xs text-destructive">{unlockError}</p>}
          <Button type="submit" loading={unlockBusy} disabled={!unlockPassword||unlockBusy}>{pt?'Desbloquear canal':'Unlock channel'}</Button>
        </form>:<div className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
          activeChannel.kind!=='text'&&voiceTextExpanded&&'lg:flex-row')}>
        {activeChannel.kind!=='text'&&(
          <div ref={voiceHostRef} className={cn('relative flex min-h-0 min-w-0 flex-col overflow-hidden',
            voiceTextExpanded?'h-[43%] shrink-0 sm:h-[46%] lg:h-full lg:w-[52%]':'flex-1')}>
            {!voiceInline&&<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4 text-center text-sm text-muted-foreground">
              {activeChannel.kind==='meeting'?<Video className="size-9 text-primary"/>:<Headphones className="size-9 text-primary"/>}
              <p>{activeChannel.kind==='meeting'?(pt?'Entre na reunião com áudio e vídeo.':'Join the meeting with audio and video.'):(pt?'Entre e converse sem sair da comunidade.':'Join the conversation right inside your community.')}</p>
              <Button type="button" variant="outline" onClick={()=>openVoiceRoom({
                communityId:community.id,channelId:activeChannel.id,communityName:community.name,channelName:activeChannel.name,kind:activeChannel.kind as 'voice'|'meeting'
              })}>{activeChannel.kind==='meeting'?(pt?'Abrir reunião':'Open meeting'):(pt?'Abrir sala de voz':'Open voice room')}</Button>
            </div>}
          </div>
        )}
        {activeChannel.kind!=='text'&&voiceTextExpanded&&<div aria-hidden="true"
          className="h-[2px] w-full shrink-0 bg-foreground/35 lg:h-full lg:w-[2px]"/>}
        <div className={cn('flex min-h-0 min-w-0 flex-col overflow-hidden',
          activeChannel.kind!=='text'&&!voiceTextExpanded?'shrink-0':'flex-1')}>
        {activeChannel.kind!=='text'&&<button type="button" onClick={()=>{setVoiceTextExpanded(v=>!v);setMediaPicker(null);}}
          aria-expanded={voiceTextExpanded} aria-controls={voiceTextExpanded?'uorqui-voice-text-panel':undefined}
          className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 text-sm font-medium hover:bg-secondary"
          title={voiceTextExpanded?(pt?'Recolher conversa de texto':'Collapse text chat'):(pt?'Expandir conversa de texto':'Expand text chat')}>
          <span className="flex min-w-0 items-center gap-2"><MessageSquareText className="size-4 shrink-0 text-primary"/>
            {voiceTextExpanded?(pt?'Recolher chat':'Collapse chat'):(pt?'Expandir chat de texto':'Expand text chat')}
            {!voiceTextExpanded&&!!unreadChannels[activeChannel.id]&&<span role="status" className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"><span aria-hidden="true" className="size-1.5 rounded-full bg-primary"/>{pt?'Nova mensagem':'New message'}</span>}
          </span>
          {voiceTextExpanded?<ChevronDown className="size-4 shrink-0"/>:<ChevronUp className="size-4 shrink-0"/>}
        </button>}
        {(activeChannel.kind==='text'||voiceTextExpanded)&&<div id={activeChannel.kind!=='text'?'uorqui-voice-text-panel':undefined}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div key={currentMessageKey} data-uorqui-room-history ref={scrollRef}
            onScroll={event=>{
              const element=event.currentTarget,key=currentMessageKey;
              if(!key||messagesForKey!==key)return;
              const atBottom=element.scrollHeight-element.scrollTop-element.clientHeight<110;
              followBottomRef.current=atBottom;
              if(atBottom)setNewBelow(old=>old?0:old);
            }}
            className="uorqui-kit-content-enter min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-background px-3 py-3 sm:px-5">
            {!messagesLoading&&!visibleMessages.length&&!pendingMessages.some(p=>p.channelId===channelId)&&<div className="mx-auto my-12 max-w-md text-center"><Hash className="mx-auto size-9 text-primary"/>
              <h3 className="mt-3 font-semibold">{pt?'Comece a conversa em #':'Start the conversation in #'}{activeChannel.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{pt?'Compartilhe textos, fotos e links com os membros da sala.':'Share text, photos and links with room members.'}</p>
            </div>}
            {messagesLoading&&!visibleMessages.length&&<WorkspaceContentLoading label={pt?'Carregando mensagens':'Loading messages'} rows={4} className="mb-5"/>}
            {messagesLoadFailed&&!messagesLoading&&<div role="status" className="mb-4 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
              {pt?'As mensagens estão temporariamente indisponíveis. O canal tentará reconectar automaticamente.':
                'Messages are temporarily unavailable. The channel will reconnect automatically.'}
            </div>}
            <div ref={messageContentRef} className="min-w-0 max-w-full space-y-1.5">{renderedMessages.map((message,index)=><div key={message.clientId}
              className={cn('flex min-w-0 gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-accent/20',groupedWithPrevious(renderedMessages,index)&&'py-0.5')}>
              {groupedWithPrevious(renderedMessages,index)?<span aria-hidden="true" className="w-8 shrink-0"/>:
                <UserAvatar name={message.authorName} image={message.authorAvatar} size="sm"/>}
              <div className="min-w-0 flex-1">
                <div className={cn('flex flex-wrap items-baseline gap-2',groupedWithPrevious(renderedMessages,index)&&'sr-only')}>{message.authorHandle?
                  <a href={'/@'+message.authorHandle} onClick={event=>navigateToPublicProfile(event,message.authorHandle)}
                    className="rounded-sm text-sm font-semibold hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                    {message.authorName}</a>:
                  <strong className="text-sm">{message.authorName}</strong>}
                  <span className="text-[11px] text-muted-foreground">@{message.authorHandle}</span>
                  <time className="text-[11px] text-muted-foreground">{new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}).format(new Date(message.createdAt))}</time></div>
                {message.deletedAt?<p className="mt-1 text-sm italic text-muted-foreground">{pt?'Mensagem cancelada':'Message removed'}</p>:
                  editingId===message.id?<form className="mt-2 space-y-2" onSubmit={event=>void updateMessage(event)}>
                    <textarea value={editingBody} onChange={event=>setEditingBody(event.target.value)} maxLength={4000} rows={2}
                      className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={pt?'Editar mensagem':'Edit message'}/>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" loading={busyAction==='editMessage'} disabled={busy||!editingBody.trim()}>{pt?'Salvar':'Save'}</Button>
                      <Button type="button" size="sm" variant="outline" onClick={()=>{setEditingId(null);setEditingBody('');}}>
                        {pt?'Cancelar':'Cancel'}</Button>
                    </div>
                  </form>:isCommunityGifUrl(message.body)?
                    <img src={message.body} alt={pt?'GIF enviado':'Sent GIF'} loading="lazy" decoding="async" referrerPolicy="no-referrer"
                      className="mt-2 block h-auto max-h-64 max-w-full rounded-xl object-contain"/>:
                    <div className="mt-1 min-w-0">
                      <p className="whitespace-pre-wrap wrap-break-word text-sm leading-6"><MessageText text={message.body??''}/></p>
                      {!!message.body&&<LinkPreview text={message.body} locale={locale}/>}
                    </div>}
                {message.attachment&&!message.deletedAt&&selectedId&&channelId&&
                  <CommunityMessageAttachment attachment={message.attachment}
                    src={message.attachmentUrl||('/media/community-attachment/'+selectedId+'/'+channelId+'/'+message.attachment.id)}
                    locale={locale}/>}
                {isPendingMessage(message)&&<div role="status" className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                  {message.pending==='sending'?<><Spinner className="size-3.5"/>{pt?'Enviando…':'Sending…'}</>:
                    <><span className="text-destructive">{pt?'Falha no envio':'Send failed'}</span>
                    <button type="button" className="text-primary underline" onClick={()=>retryPending(message)}>
                      {pt?'Reenviar':'Retry'}</button></>}
                </div>}
                {!message.deletedAt&&message.editedAt&&<span className="mt-1 block text-[11px] text-muted-foreground">{pt?'Editada':'Edited'}</span>}
                {!message.deletedAt&&!isPendingMessage(message)&&<CommunityMessageReactions
                  reactions={message.reactions??[]} canReact={message.canReact}
                  open={reactionPickerId===message.id} busy={reactionBusyId===message.id}
                  pt={pt} onOpen={()=>setReactionPickerId(old=>old===message.id?null:message.id)}
                  onToggle={(emoji,mine)=>void toggleReaction(message,emoji,mine)}/>}
                {!message.deletedAt&&!isPendingMessage(message)&&<div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                  {!message.canEdit&&<button type="button" className="inline-flex items-center gap-1 hover:text-destructive"
                     onClick={()=>setReportMessageId(message.id)}><Flag className="size-3.5"/>{pt?'Denunciar':'Report'}</button>}
                   {message.canEdit&&editingId!==message.id&&<button type="button" className="hover:text-foreground"
                    onClick={()=>{setEditingId(message.id);setEditingBody(message.body??'');setDeletingId(null);}}>
                    {pt?'Editar':'Edit'}</button>}
                  {message.canDelete&&<button type="button" className="inline-flex items-center gap-1 hover:text-destructive" disabled={busy}
                    onClick={()=>void removeMessage(message.id)}>{busyAction==='deleteMessage:'+message.id&&<Spinner className="size-3.5"/>}{deletingId===message.id?
                      (pt?'Confirmar cancelamento':'Confirm removal'):(pt?'Cancelar mensagem':'Remove message')}</button>}
                  {deletingId===message.id&&<button type="button" className="hover:text-foreground" onClick={()=>setDeletingId(null)}>
                    {pt?'Voltar':'Back'}</button>}
                </div>}
              </div>
            </div>)}</div>
          </div>
          {newBelow>0&&<div className="pointer-events-none relative z-10 h-0 shrink-0">
            <button type="button" className="pointer-events-auto absolute bottom-3 right-4 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-lg hover:bg-accent"
              onClick={()=>{scrollRef.current?.scrollTo({top:scrollRef.current.scrollHeight,behavior:'smooth'});setNewBelow(0);}}>
              {newBelow>99?'99+':newBelow} {pt?'novas mensagens ↓':'new messages ↓'}
            </button>
          </div>}
          <div className="relative shrink-0 border-t border-border/70 bg-card/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            {mediaPicker==='gif'&&<CommunityMediaPicker key="gif" tab="gif" pt={pt}
              onClose={()=>setMediaPicker(null)}
              onEmoji={symbol=>{setDraft(old=>old+symbol);setMediaPicker(null);}}
              onGif={url=>{queueText(url);setMediaPicker(null);}}/>}
            <LiveMessageComposer key={selectedId+'/'+channelId} value={draft} onChange={setDraft}
              onSubmit={send} onAttach={sendAttachment}
              onShareLocation={(latitude,longitude,caption)=>{
                enqueueMessage((caption?caption+'\n':'')+'https://www.google.com/maps?q='+latitude+','+longitude);
              }}
              sending={false} locale={locale} textareaRef={composerRef}
              onGif={()=>setMediaPicker(old=>old==='gif'?null:'gif')} gifOpen={mediaPicker==='gif'}/>
          </div>
        </div>}
        </div>
        </div>}
      </>:<div className="flex h-full items-center justify-center p-6 text-center">
        <div className="max-w-xs"><Users className="mx-auto size-11 text-primary"/>
          <h3 className="mt-4 font-semibold">{pt?'Suas comunidades':'Your communities'}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{!owned.length
            ?(pt?'Encontre uma comunidade para conversar, participar de canais e entrar em chamadas.':'Find a community to chat, join channels and take part in calls.')
            :(pt?'Selecione uma comunidade e um canal para começar.':'Choose a community and channel to get started.')}</p>
          {!owned.length&&<p className="mt-3 text-xs text-muted-foreground">
            {pt?'Encontre novas comunidades na aba Descobrir.':'Find new communities in the Discover tab.'}
          </p>}
          <Button className="mt-4 md:hidden" variant="outline" onClick={closeChannel}>{pt?'Voltar':'Back'}</Button>
        </div>
      </div>}
    </section>
    {activeVoiceRoom&&createPortal(
      <VoicePortalShell floating={!voiceInline} anchorRef={voiceHostRef} pt={pt}>
        <CommunityVoiceRoom key={activeVoiceRoom.communityId+'/'+activeVoiceRoom.channelId}
          {...activeVoiceRoom} mode={voiceInline?'expanded':'floating'}
          onParticipantsChange={setVoiceParticipants} onPhaseChange={setVoicePhase}
          onMinimize={()=>{
            if(voicePhase==='joined')closeChannel();
            else{setActiveVoiceRoom(null);setVoiceMinimized(true);}
          }}
          onRestore={()=>{
            // Restore both the main navigation and the selected voice room.
            // The community view stays mounted while the call floats over other tabs.
            onRestoreNavigation?.();
            setSelectedId(activeVoiceRoom.communityId);
            setChannelId(activeVoiceRoom.channelId);setChannelOpen(true);
            setVoiceMinimized(false);
          }}
          onLeave={()=>{setActiveVoiceRoom(null);setVoiceParticipants([]);setVoicePhase('idle');}}/>
      </VoicePortalShell>,document.body)}
    <Dialog.Root open={channelInviteOpen} onOpenChange={next=>{
      if(channelInviteSending)return;
      setChannelInviteOpen(next);
      if(!next){setChannelInviteFilter('');setChannelInviteError('');setChannelInviteSuccess('');}
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[310] bg-black/65"/>
        <Dialog.Content aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[315] flex max-h-[min(85dvh,650px)] w-[min(92vw,470px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl outline-none">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold">{pt?'Convidar membro para o canal':'Invite member to channel'}</Dialog.Title>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {activeChannel?.name} · {community?.name}
              </p>
            </div>
            <Dialog.Close asChild><Button variant="ghost" size="icon" disabled={!!channelInviteSending}
              aria-label={pt?'Fechar':'Close'}><X className="size-5"/></Button></Dialog.Close>
          </div>
          <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain p-4">
            <p className="text-sm text-muted-foreground">{pt?
              'Selecione alguém que já participa da comunidade para enviar o link direto do canal pelo chat.':
              'Select someone who is already in this community to send the direct channel link by chat.'}</p>
            {activeChannel?.accessMode==='restricted'&&<p className="text-xs text-muted-foreground">
              {pt?'Canais fechados exigem autorização do administrador.':'Restricted channels require admin authorization.'}
            </p>}
            {activeChannel?.hasPassword&&<p className="text-xs text-muted-foreground">
              {pt?'O destinatário precisará da senha para acessar.':'The recipient will need the channel password.'}
            </p>}
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"/>
              <Input value={channelInviteFilter} onChange={event=>setChannelInviteFilter(event.target.value)}
                className="h-10 pl-9 text-base" placeholder={pt?'Pesquisar membro':'Search member'}/>
            </div>
            {channelInviteError&&<p role="alert" className="text-xs text-destructive">{channelInviteError}</p>}
            {channelInviteSuccess&&<p role="status" className="text-xs text-primary">{channelInviteSuccess}</p>}
            {channelInviteLoading?<WorkspaceContentLoading label={pt?'Carregando membros':'Loading members'} rows={3}/>:channelInviteContacts.length===0?
              <p className="rounded-lg border border-border p-4 text-center text-sm text-muted-foreground">
                {pt?'Não há outros membros desta comunidade para convidar.':'No other members of this community are available to invite.'}
              </p>:<div className="space-y-1">
              {channelInviteContacts.filter(person=>(person.displayName+' '+person.handle).toLocaleLowerCase(locale)
                .includes(channelInviteFilter.trim().toLocaleLowerCase(locale))).map(person=>
                <div key={person.handle} className="flex min-h-14 items-center gap-2 rounded-xl px-2 hover:bg-secondary/70">
                  <UserAvatar name={person.displayName} image={person.avatarUrl} size="sm"/>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{person.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">@{person.handle}</p></div>
                  <Button type="button" size="sm" variant="outline" disabled={!!channelInviteSending}
                    loading={channelInviteSending===person.handle}
                    onClick={()=>void inviteContactToChannel(person.handle)}>
                    <MessageCircle className="size-4"/>{pt?'Enviar':'Send'}
                  </Button>
                </div>)}
              </div>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <ContentReportDialog target={reportMessageId?{targetKind:'community_message',targetId:reportMessageId}:null}
      locale={locale} onClose={()=>setReportMessageId(null)}/>
    {shareToast&&createPortal(
      <div role={shareToast.kind==='error'?'alert':'status'} aria-live={shareToast.kind==='error'?'assertive':'polite'}
        className="pointer-events-none fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-[300] flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-popover px-4 py-3 text-sm font-medium text-popover-foreground shadow-2xl">
        {shareToast.kind==='success'?<Check aria-hidden="true" className="size-5 shrink-0 text-primary"/>:<X aria-hidden="true" className="size-5 shrink-0 text-destructive"/>}
        <span>{shareToast.message}</span>
      </div>,document.body)}
    {(error||notice)&&<div role={error?'alert':'status'}
      className={cn('pointer-events-auto absolute bottom-20 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl border border-border bg-popover px-4 py-3 text-center text-xs shadow-xl',error?'text-destructive':'text-primary')}>
      {error||notice}<button type="button" className="ml-3 underline" onClick={()=>{setError('');setNotice('');}}>{pt?'Fechar':'Close'}</button>
    </div>}
  </div>;
}
