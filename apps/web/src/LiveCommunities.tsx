import { compactUserName } from './userDisplayName';
import { apiRequest as api } from './lib/apiClient';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Dialog } from 'radix-ui';
import { VoicePortalShell } from './VoicePortalShell';
import { ArrowLeft, Check, ChevronDown, ChevronUp, Copy, Compass, Hash, Headphones, LockKeyhole, MessageCircle, MessageSquareText, Mic, MicOff, Flag, Plus, Search, UserPlus, Users, Pencil, Video, Volume2, VolumeX, X } from 'lucide-react';
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
import { ReplyReference, ReplyComposerPreview } from './ReplyReference';
import { LinkPreview } from './LinkPreview';
import {clearReadPush} from './readPushNotifications';
import { CommunityMessageAttachment, type CommunityAttachment } from './CommunityMessageAttachment';
import { invalidateChatMedia, invalidateCommunityMedia } from './chatMediaCache';
import { ContentReportDialog } from './ContentReportDialog';
import { navigateToPublicProfile } from './publicProfileNavigation';
import { forgetCommunityMessages, peekCommunityMessages, putCommunityMessages, reconcileCommunityMessages } from './communityMessageCache';
import { ChannelScrollBehavior } from './channelScrollBehavior';
import { formatMessageTimestamp, useLocalDayKey } from './messageTimestamp';
import { buildMeetingLink } from './meetingLink';

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
type Channel={id:string;name:string;description:string|null;kind:'text'|'voice'|'meeting';createdAt:string;hasPassword?:boolean;unlocked?:boolean;accessMode?:'open'|'restricted'};
type Pending={handle:string;displayName:string;requestedAt:string};
type Detail={community:Community;channels:Channel[];pendingRequests:Pending[]};
type Message={id:string;clientId:string;body:string|null;replyToId?:string|null;replyTo?:{id:string;body:string|null;authorHandle:string;deleted:boolean}|null;createdAt:string;authorHandle:string;authorName:string;authorAvatar:string|null;editedAt:string|null;deletedAt:string|null;canEdit:boolean;canDelete:boolean;canReact:boolean;reactions:CommunityReaction[];attachment?:CommunityAttachment|null;attachmentUrl?:string|null};
type PendingMessage=Message & {channelId:string;pending:'sending'|'failed'};
function isPendingMessage(value:Message|PendingMessage):value is PendingMessage { return 'pending' in value; }
const hidden='min-h-0 flex-1 overflow-y-auto overscroll-contain';
const allowedSlug=/^[a-z][a-z0-9-]{2,63}$/;

function body(value:unknown):RequestInit{
  return {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)};
}
function memberView(community:Community){return !!community.myRole;}
function manage(community:Community){return community.myRole==='owner'||community.myRole==='admin';}
function mayInviteRestricted(community:Community){return community.myRole==='owner'||community.myRole==='admin'||community.myRole==='moderator';}

export default function LiveCommunities({myId,myName,myHandle,myAvatar,onMobileOpenChange,onRestoreNavigation,initialCommunityId,requestedDestination,unreadChannels,unreadCommunities,active}:{
  myId:string;myName:string;myHandle:string;myAvatar:string|null;onMobileOpenChange?:(value:boolean)=>void;onRestoreNavigation?:()=>void;initialCommunityId?:string|null;
  requestedDestination?:{communityId:string;channelId:string|null;meeting?:boolean;nonce:number}|null;
  unreadChannels:Record<string,number>;unreadCommunities:Record<string,number>;active:boolean;
}){
  const {locale}=useUorquiPreferences(),pt=locale==='pt-BR';
  const todayKey=useLocalDayKey();
  const lastCommunityKey='uorqui:last-community:'+myId;
  const [list,setList]=useState<Community[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(initialCommunityId??null);
  const [directory, setDirectory] = useState(false);
  const [communitySearch, setCommunitySearch] = useState('');
  const [detail,setDetail]=useState<Detail|null>(null);
  const [channelId,setChannelId]=useState<string|null>(null);
  const requestedChannel=useRef<{communityId:string;channelId:string}|null>(null);
  const requestedMeeting=useRef<{communityId:string;channelId:string}|null>(null);
  const externalSelection=useRef(false);
  const [channelOpen,setChannelOpen]=useState(false);
  // On desktop the first text channel is rendered even if the mobile
  // "channelOpen" flag has not been set. Anchor that visible history too.
  const [desktopChannelVisible,setDesktopChannelVisible]=useState(
    ()=>typeof window!=='undefined'&&window.matchMedia('(min-width: 768px)').matches
  );
  useEffect(()=>{
    const media=window.matchMedia('(min-width: 768px)');
    const sync=()=>setDesktopChannelVisible(media.matches);
    media.addEventListener('change',sync);
    return ()=>media.removeEventListener('change',sync);
  },[]);
  const channelHistoryVisible=channelOpen||desktopChannelVisible;
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
  const [channelInviteOpen,setChannelInviteOpen]=useState(false);
  const [meetingShare,setMeetingShare]=useState<{url:string;name:string}|null>(null);
  const [meetingShareCopied,setMeetingShareCopied]=useState(false);
  const [meetingShareError,setMeetingShareError]=useState('');
  const [channelInviteLink,setChannelInviteLink]=useState('');
  const [channelInviteToken,setChannelInviteToken]=useState<string|null>(null);
  const [channelInviteHandle,setChannelInviteHandle]=useState('');
  const [channelInviteLoading,setChannelInviteLoading]=useState(false);
  const [channelInviteSending,setChannelInviteSending]=useState(false);
  const [channelInviteError,setChannelInviteError]=useState('');
  const [channelInviteSuccess,setChannelInviteSuccess]=useState('');
  const [newChannelOpen,setNewChannelOpen]=useState(false);
  const [newChannelName,setNewChannelName]=useState('');
  const [newChannelNameEdited,setNewChannelNameEdited]=useState(false);
  const [newChannelDescription,setNewChannelDescription]=useState('');
  const [descriptionExpanded,setDescriptionExpanded]=useState(false);
  const [editChannelId,setEditChannelId]=useState<string|null>(null);
  const [newChannelKind,setNewChannelKind]=useState<'text'|'voice'|'meeting'>('text');
  const [newChannelAccessMode,setNewChannelAccessMode]=useState<'open'|'restricted'>('open');
  const [unlockPassword,setUnlockPassword]=useState('');
  const [unlockBusy,setUnlockBusy]=useState(false);
  const [unlockError,setUnlockError]=useState('');
  const [messages,setMessages]=useState<Message[]>([]);
  const [messagesForKey,setMessagesForKey]=useState<string|null>(null);
  const [newBelow,setNewBelow]=useState(0);
  const [pendingMessages,setPendingMessages]=useState<PendingMessage[]>([]);
  const [messagesLoading,setMessagesLoading]=useState(false);
  const [messagesLoadFailed,setMessagesLoadFailed]=useState(false);
  const [detailLoading,setDetailLoading]=useState(false);
  const [draft,setDraft]=useState('');
  const [replySource,setReplySource]=useState<Message|null>(null);
  const [inspectReaction,setInspectReaction]=useState<{messageId:string;emoji:string;users:{handle:string;name:string;avatarUrl:string|null}[];loading:boolean;error:string}|null>(null);
  const [mentionMembers,setMentionMembers]=useState<{handle:string;displayName:string;avatarUrl:string|null}[]>([]);
  const [mentionAt,setMentionAt]=useState<{start:number;end:number;query:string}|null>(null);
  const [mentionIndex,setMentionIndex]=useState(0);
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
  const channelScrollRef=useRef(new ChannelScrollBehavior());
  const composerRef=useRef<HTMLTextAreaElement>(null);
  const pendingFiles=useRef(new Map<string,File>());
  const pendingBlobUrls=useRef(new Map<string,string>());
  const previousLastMessage=useRef<string|null>(null);
  const previousMessageCount=useRef(0);
  const activeScrollKey=useRef<string|null>(null);
  const acknowledged=useRef(new Map<string,string>());
  useEffect(()=>()=>{for(const url of pendingBlobUrls.current.values())URL.revokeObjectURL(url);pendingBlobUrls.current.clear();pendingFiles.current.clear();},[]);
  const activeChannel=detail?.channels.find(x=>x.id===channelId)??null;
  // Opening a channel (or expanding a voice room's text panel) must start
  // at the latest message. User-directed history scrolling wins afterwards.
  useEffect(()=>{
    if(!channelHistoryVisible || !active || (activeChannel?.kind!=='text' && !voiceTextExpanded)){
      activeScrollKey.current=null;
      channelScrollRef.current.reset();
    }
  },[channelHistoryVisible,active,activeChannel?.kind,voiceTextExpanded]);
  const channelDescription=activeChannel?.description?.trim()??'';
  function suggestedChannelName(kind:Channel['kind']){
    const base=kind==='text'?'Sala de texto':kind==='voice'?'Sala de voz':'Sala de reunião';
    const taken=new Set((detail?.channels??[]).filter(ch=>ch.kind===kind)
      .map(ch=>ch.name.trim().toLocaleLowerCase(locale)));
    for(let number=1;number<=100;number++){
      const proposal=base+' '+number;
      if(!taken.has(proposal.toLocaleLowerCase(locale)))return proposal;
    }
    return base+' 101';
  }
  const descriptionNeedsMore=channelDescription.length>180||channelDescription.split('\n').length>3;
  useEffect(()=>setDescriptionExpanded(false),[channelId,selectedId]);
  const channelLocked=Boolean(activeChannel?.hasPassword&&!activeChannel?.unlocked);
  const mentionOptions=mentionAt?mentionMembers.filter(member=>
    (member.handle+' '+member.displayName).toLowerCase().includes(mentionAt.query.toLowerCase())).slice(0,7):[];
  function mentionChanged(value:string){
    setDraft(value);
    const caret=composerRef.current?.selectionStart??value.length;
    const preceding=value.slice(0,caret);
    const found=/(?:^|[\\s(])@([a-zA-Z0-9_]{0,31})$/.exec(preceding);
    setMentionAt(found?{start:caret-found[1].length-1,end:caret,query:found[1]}:null);
    setMentionIndex(0);
  }
  function insertMention(handle:string){
    if(!mentionAt)return;
    const next=draft.slice(0,mentionAt.start)+'@'+handle+' '+draft.slice(mentionAt.end);
    const caret=mentionAt.start+handle.length+2;
    setDraft(next);setMentionAt(null);setMentionIndex(0);
    requestAnimationFrame(()=>{
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(caret,caret);
    });
  }
  useEffect(()=>{
    if(!selectedId||!channelId||channelLocked){setMentionMembers([]);return;}
    let live=true;
    void api<{members:{handle:string;displayName:string;avatarUrl:string|null}[]}>(
      '/api/v1/communities/'+selectedId+'/invitable-members'
    ).then(data=>{if(live)setMentionMembers(data.members);})
      .catch(()=>{if(live)setMentionMembers([]);});
    return ()=>{live=false;};
  },[selectedId,channelId,channelLocked]);
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
      const target=(event as CustomEvent<{communityId?:string;channelId?:string;meeting?:boolean}>).detail;
      if(!target||typeof target.communityId!=='string'||!/^[0-9a-f-]{36}$/i.test(target.communityId))return;
      const selectedChannel=typeof target.channelId==='string'&&/^[0-9a-f-]{36}$/i.test(target.channelId)
        ?target.channelId:null;
      externalSelection.current=true;
      requestedChannel.current=selectedChannel?{communityId:target.communityId,channelId:selectedChannel}:null;
      requestedMeeting.current=target.meeting&&selectedChannel?{communityId:target.communityId,channelId:selectedChannel}:null;
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
      detail:{communityId:requestedDestination.communityId,channelId:requestedDestination.channelId,meeting:requestedDestination.meeting}
    }));
  },[requestedDestination]);

  // Wait for a verified channel list before opening the WebRTC meeting view.
  // A meeting link never bypasses membership, channel ACL or password checks.
  useEffect(()=>{
    const target=requestedMeeting.current;
    if(!target||selectedId!==target.communityId||detail?.community.id!==target.communityId)return;
    requestedMeeting.current=null;
    const channel=detail.channels.find(ch=>ch.id===target.channelId&&ch.kind==='meeting');
    if(!channel||!detail.community.myRole){
      setNotice(pt?'Você precisa de autorização para acessar esta reunião.':'You need permission to access this meeting.');
      return;
    }
    setChannelId(channel.id);setChannelOpen(true);
    if(channel.hasPassword&&!channel.unlocked){
      setNotice(pt?'Desbloqueie o canal para acessar a reunião.':'Unlock the channel to access the meeting.');
      return;
    }
    openVoiceRoom({communityId:target.communityId,channelId:channel.id,
      communityName:detail.community.name,channelName:channel.name,kind:'meeting'});
  },[detail,selectedId,pt]);
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

  async function openChannelInvite(){
    if(!selectedId||!activeChannel||!community?.myRole)return;
    if(activeChannel.accessMode==='restricted'&&!mayInviteRestricted(community))return;
    setChannelInviteOpen(true);setChannelInviteLoading(true);
    setChannelInviteLink('');setChannelInviteToken(null);
    setChannelInviteHandle('');setChannelInviteError('');setChannelInviteSuccess('');
    try{
      if(activeChannel.accessMode==='restricted'){
        // Each link is a 24-hour, single-use capability. A targeted DM invite
        // gets its OWN account-bound token instead of reusing this generic link.
        const created=await api<{token:string}>(
          '/api/v1/communities/'+selectedId+'/channels/'+activeChannel.id+'/invites',body({}));
        const link=new URL('/channel-invite',window.location.origin);
        link.hash=new URLSearchParams({token:created.token}).toString();
        setChannelInviteToken(created.token);
        setChannelInviteLink(link.toString());
      }else{
        const existing=await api<{link:{id:string}|null}>('/api/v1/communities/'+selectedId+'/share');
        let token=existing.link?.id;
        if(!token&&manage(community)){
          const created=await api<{link:{id:string}}>('/api/v1/communities/'+selectedId+'/share',body({}));
          token=created.link.id;
        }
        if(!token)throw new Error('INVITE_LINK_UNAVAILABLE');
        const link=new URL('/invite/'+encodeURIComponent(token),window.location.origin);
        link.searchParams.set('channel',activeChannel.id);
        setChannelInviteLink(link.toString());
      }
    }catch{
      setChannelInviteError(pt?
        'Não foi possível gerar o link deste canal. Confira suas permissões ou tente novamente.':
        'Could not create this channel invitation. Check permissions or try again.');
    }finally{setChannelInviteLoading(false);}
  }
  async function revokeChannelInvite(){
    if(!channelInviteToken)return;
    setChannelInviteLoading(true);setChannelInviteError('');
    try{
      await api('/api/v1/channel-invites/revoke',body({token:channelInviteToken}));
      setChannelInviteLink('');setChannelInviteToken(null);
      setChannelInviteSuccess(pt?'Convite revogado. O link não pode mais ser utilizado.':
        'Invitation revoked. The link can no longer be used.');
    }catch{
      setChannelInviteError(pt?'Não foi possível revogar o convite. Tente novamente.':
        'Unable to revoke the invitation. Please retry.');
    }finally{setChannelInviteLoading(false);}
  }
  async function copyChannelInvite(){
    if(!channelInviteLink)return;
    try{
      await navigator.clipboard.writeText(channelInviteLink);
      setChannelInviteSuccess(pt?'Link do canal copiado.':'Channel link copied.');
      setChannelInviteError('');
    }catch{setChannelInviteError(pt?'Não foi possível copiar. Selecione o endereço para copiar manualmente.':'Could not copy. Select the address to copy it manually.');}
  }
  async function inviteContactToChannel(event:FormEvent){
    event.preventDefault();
    if(channelInviteSending||!selectedId||!channelId||!activeChannel||!community?.myRole||!channelInviteLink)return;
    const handle=channelInviteHandle.trim().replace(/^@/,'').toLowerCase();
    if(!/^[a-z][a-z0-9_]{2,31}$/.test(handle)){
      setChannelInviteError(pt?'Informe um @usuário válido.':'Enter a valid @username.');return;
    }
    setChannelInviteSending(true);setChannelInviteError('');setChannelInviteSuccess('');
    try{
      let directLink=channelInviteLink,tokenToRevoke:string|null=null;
      if(activeChannel.accessMode==='restricted'){
        const created=await api<{token:string}>(
          '/api/v1/communities/'+selectedId+'/channels/'+activeChannel.id+'/invites',body({handle}));
        tokenToRevoke=created.token;
        const link=new URL('/channel-invite',window.location.origin);
        link.hash=new URLSearchParams({token:created.token}).toString();
        directLink=link.toString();
      }
      try{
        const target=await api<{id:string}>('/api/v1/dm/conversations',body({handle}));
        await api('/api/v1/dm/conversations/'+target.id+'/messages',body({
          clientId:crypto.randomUUID(),
          body:(pt?'Venha para o canal ':'Join the channel ')+
            (activeChannel.kind==='text'?'#':activeChannel.kind==='meeting'?'📹 ':'🔊 ')+
            activeChannel.name+' · '+community.name+'\n'+directLink
        }));
      }catch(error){
        if(tokenToRevoke)void api('/api/v1/channel-invites/revoke',body({token:tokenToRevoke})).catch(()=>{});
        throw error;
      }
      setChannelInviteSuccess(pt?'Convite enviado para @'+handle+' pelo chat.':'Invitation sent to @'+handle+' via chat.');
      setChannelInviteHandle('');
    }catch{
      setChannelInviteError(pt?'Não foi possível enviar. Confira o @usuário e as permissões de mensagens.':
        'Could not send. Check the username and direct-message permissions.');
    }finally{setChannelInviteSending(false);}
  }
  const closeChannel=()=>{setReplySource(null);setInspectReaction(null);setMentionAt(null);setChannelInviteOpen(false);if(voicePhase==='idle')setActiveVoiceRoom(null);setVoiceMinimized(true);setChannelOpen(false);setReactionPickerId(null);setMediaPicker(null);setDraft('');setVoiceParticipants([]);setEditingId(null);setDeletingId(null);};

  useEffect(()=>{
    if(!selectedId||!channelId||!activeChannel||!community?.myRole||
       (activeChannel.hasPassword&&!activeChannel.unlocked)){
      setMessagesForKey(null);setMessages([]);setMessagesLoadFailed(false);return;
    }
    const communityId=selectedId,roomId=channelId,roomKey=communityId+'/'+roomId;
    let mounted=true,inFlight=false,repeat=false,lastRefresh=0;
    const cached=peekCommunityMessages<Message>(myId,communityId,roomId);
    setReactionPickerId(null);setReplySource(null);setInspectReaction(null);setMessagesForKey(roomKey);
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
    if(!active||!channelHistoryVisible||!element||!key||messagesForKey!==key||messagesLoading)return;
    const latest=messages.at(-1)?.id??null;
    if(channelScrollRef.current.open(key)){
      activeScrollKey.current=key;
      previousLastMessage.current=latest;
      previousMessageCount.current=messages.length;
      setNewBelow(0);
      // Start from the newest message; opening ignores intermediate scroll
      // events caused by browser restoration or asynchronous layout.
      element.scrollTop=element.scrollHeight;
      const frame=window.requestAnimationFrame(()=>{
        if(scrollRef.current===element&&activeScrollKey.current===key)
          element.scrollTop=element.scrollHeight;
      });
      return ()=>window.cancelAnimationFrame(frame);
    }
    if(latest&&latest!==previousLastMessage.current){
      const distance=element.scrollHeight-element.scrollTop-element.clientHeight;
      if(channelScrollRef.current.shouldFollow(key)||distance<180){
        element.scrollTo({top:element.scrollHeight,
          behavior:previousLastMessage.current&&!channelScrollRef.current.isOpening(key)?'smooth':'instant'});
      }else if(previousLastMessage.current){
        setNewBelow(old=>old+Math.max(1,messages.length-previousMessageCount.current));
      }
    }
    previousLastMessage.current=latest;
    previousMessageCount.current=messages.length;
  },[active,channelHistoryVisible,messages,selectedId,channelId,messagesForKey,messagesLoading,currentMessageKey]);

  // Image previews and GIFs may expand after channel data is painted. Keep
  // the bottom anchored only while the reader has not scrolled away.
  useLayoutEffect(()=>{
    const element=scrollRef.current,content=messageContentRef.current;
    const key=currentMessageKey;
    if(!active||!channelHistoryVisible||!element||!content||!key||messagesForKey!==key||messagesLoading)return;
    let previousHeight=element.scrollHeight;
    let frame=0;
    const pin=()=>{
      const height=element.scrollHeight;
      const grew=height>previousHeight;
      const wasNearBottom=previousHeight-element.scrollTop-element.clientHeight<110;
      previousHeight=height;
      if(!channelScrollRef.current.shouldPinOnResize(key,grew,wasNearBottom))return;
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
  },[active,channelHistoryVisible,currentMessageKey,messagesForKey,messagesLoading,voiceTextExpanded]);
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
  async function createChannel(event:FormEvent){
    event.preventDefault();
    if(!selectedId||!newChannelName.trim())return;
    const created=await act(()=>api('/api/v1/communities/'+selectedId+'/channels',body({name:newChannelName.trim(),kind:newChannelKind,accessMode:newChannelAccessMode,description:newChannelDescription.trim()})),
      pt?'Canal criado.':'Channel created.',selectedId,'createChannel');
    if(created){setNewChannelOpen(false);setNewChannelName('');setNewChannelNameEdited(false);setNewChannelDescription('');setNewChannelAccessMode('open');}
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
            ...(p.body?{'x-uorqui-caption':encodeURIComponent(p.body)}:{}),
             ...(p.replyToId?{'x-uorqui-reply-to-id':p.replyToId}:{})
          },body:file
        });
        if(!response.ok)throw Error('UPLOAD_'+response.status);
      }else{
        await api('/api/v1/communities/'+currentCommunity+'/channels/'+p.channelId+'/messages',
          body({clientId:p.clientId,body:p.body,...(p.replyToId?{replyToId:p.replyToId}:{})}));
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
    const source=replySource;
     const pending:PendingMessage={id:clientId,clientId,channelId:selected,body:text.trim(),createdAt:now,
       replyToId:source?.id??null,
       replyTo:source?{id:source.id,body:source.body,authorHandle:source.authorHandle,deleted:false}:null,
      authorHandle:myHandle,authorName:myName,authorAvatar:myAvatar,editedAt:null,deletedAt:null,
      canEdit:false,canDelete:false,canReact:false,reactions:[],pending:'sending',
      attachment:attachment?{id:clientId,name:attachment.name,type:attachment.type||'application/octet-stream',size:attachment.size}:null,
      attachmentUrl:preview};
    setPendingMessages(old=>[...old,pending]);
    setReplySource(null);setMentionAt(null);
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
  async function inspectReactors(message:Message,emoji:string){
    if(!selectedId||!channelId)return;
    setInspectReaction({messageId:message.id,emoji,users:[],loading:true,error:''});
    try{
      const result=await api<{users:{handle:string;name:string;avatarUrl:string|null}[]}>(
        '/api/v1/communities/'+selectedId+'/channels/'+channelId+'/messages/'+message.id+
        '/reactors?emoji='+encodeURIComponent(emoji));
      setInspectReaction(old=>old?.messageId===message.id&&old.emoji===emoji?{...old,users:result.users,loading:false}:old);
    }catch{
      setInspectReaction(old=>old?.messageId===message.id&&old.emoji===emoji?
        {...old,loading:false,error:pt?'Não foi possível carregar as reações.':'Could not load reactions.'}:old);
    }
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
        aria-label={pt?'Descobrir':'Discover'} title={pt?'Descobrir':'Discover'}
        className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-secondary"><Compass className="size-5"/></button>
    </nav>

    <section data-uorqui-channel-nav aria-label={pt?'Comunidades e canais':'Communities and channels'}
      className={cn('h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-r border-border bg-card/25 md:flex md:w-64 md:shrink-0',channelOpen?'hidden':'flex')}>
      {createOpen||!selectedId?<div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 space-y-3 border-b border-border bg-card/95 p-4">
          <h2 className="text-lg font-semibold tracking-tight">{createOpen?(pt?'Criar comunidade':'Create community'):(pt?'Comunidades':'Communities')}</h2>
          {!createOpen&&<><div className="uorqui-inbox-filters flex gap-1" role="group" aria-label={pt?'Filtrar comunidades':'Filter communities'}>
            <button type="button" aria-pressed={!directory} onClick={()=>setDirectory(false)} className="min-h-10 rounded-md px-3 text-xs">{pt?'Suas comunidades':'Your communities'}</button>
            <button type="button" aria-pressed={directory} onClick={()=>setDirectory(true)} className="min-h-10 rounded-md px-3 text-xs">{pt?'Descobrir':'Discover'}</button>
          </div><Input value={communitySearch} onChange={event=>setCommunitySearch(event.target.value)} aria-label={pt?'Buscar comunidades':'Search communities'} placeholder={pt?'Buscar comunidades…':'Search communities…'} className="h-10 text-base md:text-sm"/></>}
          <Button className="w-full" size="sm" variant={createOpen?'outline':'secondary'}
            onClick={()=>{setCreateOpen(v=>!v);setError('');}}>{createOpen?<X className="size-4"/>:<Plus className="size-4"/>}
            {createOpen?(pt?'Fechar formulário':'Close form'):(pt?'Nova comunidade':'New community')}</Button>
        </div>
        <div className={hidden+' p-3'}>
          {!loading&&!owned.length&&!createOpen&&<section className="mb-4 space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <h3 className="text-sm font-semibold">{pt?'Comece por uma comunidade':'Start with a community'}</h3>
            <p className="text-xs leading-5 text-muted-foreground">{pt?'Encontre uma comunidade para participar ou crie a sua.':'Find a community to join or create your own.'}</p>
            <p className="text-xs text-muted-foreground">{pt?'Abra Descobrir para encontrar uma comunidade ou entre por um convite.':'Open Discover to find a community or join through an invitation.'}</p>
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
              {pt?'Nenhuma comunidade encontrada. Abra Descobrir ou crie a sua.':'No communities found. Open Discover or create your own.'}
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
                      title={compactUserName(person.displayName)}>
                      <span className={cn('size-2 shrink-0 rounded-full',person.speaking?'animate-pulse bg-emerald-500':'bg-emerald-500/50')}
                        aria-label={person.speaking?(pt?'Falando':'Speaking'):(pt?'Conectado':'Connected')}/>
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                        {compactUserName(person.displayName)}{person.isSelf&&(pt?' (você)':' (you)')}</span>
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
                onClick={()=>{
                  const opening=!newChannelOpen;setNewChannelOpen(opening);
                  if(opening){setNewChannelKind('text');setNewChannelName(suggestedChannelName('text'));setNewChannelNameEdited(false);setNewChannelDescription('');}
                }}><Plus className="size-4"/>{pt?'Novo canal':'New channel'}</button>
              {newChannelOpen&&<form className="space-y-2" onSubmit={event=>void createChannel(event)}>
                <Input required value={newChannelName} onChange={e=>{setNewChannelName(e.target.value);setNewChannelNameEdited(true);}} maxLength={64}
                  className="text-base" placeholder={pt?'Nome do canal':'Channel name'}/>
                <label className="block space-y-1 text-xs font-medium">
                  <span>{pt?'Descrição ou regras (opcional)':'Description or rules (optional)'}</span>
                  <textarea value={newChannelDescription} onChange={e=>setNewChannelDescription(e.target.value)}
                    maxLength={4000} rows={3} className="w-full resize-y rounded-lg border border-input bg-background p-2 text-base"
                    placeholder={pt?'Orientações fixadas neste canal…':'Pinned guidelines for this channel…'}/>
                </label>
                <select value={newChannelKind} onChange={e=>{
                    const next=e.target.value as Channel['kind'];
                    setNewChannelKind(next);
                    if(!newChannelNameEdited)setNewChannelName(suggestedChannelName(next));
                  }}
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
              {!!detail?.pendingRequests.length&&<div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs font-semibold">{pt?'Pedidos de entrada':'Join requests'}</p>
                {detail.pendingRequests.map(person=><div key={person.handle} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {compactUserName(person.displayName)} (@{person.handle})</span>
                  <Button size="sm" variant="outline" loading={busyAction==='approve:'+person.handle} disabled={busy} onClick={()=>void act(()=>api('/api/v1/communities/'+community.id+'/requests/'+person.handle+'/approve',{method:'POST'}),pt?'Membro aprovado.':'Member approved.',community.id,'approve:'+person.handle)}>
                    <Check className="size-4"/></Button>
                </div>)}
              </div>}
            </section>}
            {['owner','admin','moderator'].includes(community.myRole??'')&&
              <CommunityModerationPanel id={community.id} role={community.myRole as 'owner'|'admin'|'moderator'|'member'}
                name={community.name} description={community.description} visibility={community.visibility} avatarUrl={community.avatarUrl}
                channels={detail?.channels??[]} onChanged={()=>refresh(community.id)}
                editChannelId={editChannelId} onChannelEditorClosed={()=>setEditChannelId(null)}
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
          {['owner','admin'].includes(community.myRole??'')&&<Button type="button" size="sm" variant="ghost"
            className="shrink-0 gap-1 px-2 sm:px-3" aria-label={pt?'Editar canal':'Edit channel'}
            title={pt?'Editar canal':'Edit channel'} onClick={()=>setEditChannelId(activeChannel.id)}>
            <Pencil className="size-4"/><span className="hidden sm:inline">{pt?'Editar':'Edit'}</span>
          </Button>}
          {(activeChannel.accessMode!=='restricted'||mayInviteRestricted(community))&&<Button type="button" size="sm" variant="ghost" className="shrink-0 gap-2 px-2 sm:px-3"
            aria-label={pt?'Convidar para este canal':'Invite to this channel'}
            onClick={()=>void openChannelInvite()}>
            <UserPlus className="size-4"/><span className="hidden sm:inline">{pt?'Convidar':'Invite'}</span>
          </Button>}
        </header>
        {!channelLocked&&channelDescription&&<section aria-label={pt?'Descrição fixa do canal':'Pinned channel description'}
          className="z-10 shrink-0 border-b border-border bg-card/80 px-4 py-2 sm:px-5">
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {pt?'Sobre este canal':'About this channel'}
              </p>
              <p className={cn('whitespace-pre-wrap wrap-break-word text-xs leading-5 text-foreground/90',
                !descriptionExpanded&&descriptionNeedsMore&&'line-clamp-3',
                descriptionExpanded&&'max-h-[35dvh] overflow-y-auto overscroll-contain')}>{channelDescription}</p>
            </div>
            {descriptionNeedsMore&&<Button type="button" variant="ghost" size="sm"
              aria-expanded={descriptionExpanded}
              className="h-8 shrink-0 px-2 text-xs" onClick={()=>setDescriptionExpanded(old=>!old)}>
              {descriptionExpanded?(pt?'Mostrar menos':'Show less'):(pt?'Ler mais':'Read more')}
            </Button>}
          </div>
        </section>}
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
            onWheel={event=>{if(event.deltaY<0&&currentMessageKey)channelScrollRef.current.interrupt(currentMessageKey);}}
            onTouchStart={()=>{if(currentMessageKey)channelScrollRef.current.interrupt(currentMessageKey);}}
            onPointerDown={()=>{if(currentMessageKey)channelScrollRef.current.interrupt(currentMessageKey);}}
            onKeyDown={event=>{
              if(currentMessageKey&&['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))
                channelScrollRef.current.interrupt(currentMessageKey);
            }}
            onScroll={event=>{
              const element=event.currentTarget,key=currentMessageKey;
              if(!key||messagesForKey!==key)return;
              const atBottom=element.scrollHeight-element.scrollTop-element.clientHeight<110;
              channelScrollRef.current.onScroll(key,atBottom);
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
            <div ref={messageContentRef} className="min-w-0 max-w-full space-y-1.5">{renderedMessages.map(message=><div id={'community-msg-'+message.id} key={message.clientId}
              className="flex min-w-0 gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-accent/20">
              <UserAvatar name={compactUserName(message.authorName)} image={message.authorAvatar} size="sm"/>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">{message.authorHandle?
                  <a href={'/@'+message.authorHandle} onClick={event=>navigateToPublicProfile(event,message.authorHandle)}
                    className="rounded-sm text-sm font-semibold hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                    {compactUserName(message.authorName)}</a>:
                  <strong className="text-sm">{compactUserName(message.authorName)}</strong>}
                  <span className="text-[11px] text-muted-foreground">@{message.authorHandle}</span>
                  <time dateTime={message.createdAt} className="text-[11px] text-muted-foreground">{formatMessageTimestamp(message.createdAt,locale,todayKey)}</time></div>
                {message.replyToId&&!message.deletedAt&&<ReplyReference
                  author={compactUserName(renderedMessages.find(source=>source.id===message.replyToId)?.authorName??message.replyTo?.authorHandle??(pt?'Mensagem':'Message'))}
                  body={message.replyTo?.body} deleted={message.replyTo?.deleted}
                  locale={locale}
                  onJump={()=>{if(currentMessageKey)channelScrollRef.current.interrupt(currentMessageKey);
                     document.getElementById('community-msg-'+message.replyToId)?.scrollIntoView({block:'center',behavior:'smooth'});}}/>}
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
                      <p className="whitespace-pre-wrap wrap-break-word text-sm leading-6"><MessageText text={message.body??''} mentions/></p>
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
                  onToggle={(emoji,mine)=>void toggleReaction(message,emoji,mine)}
                  onInspect={emoji=>void inspectReactors(message,emoji)}/>}
                {!message.deletedAt&&!isPendingMessage(message)&&<div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                  <button type="button" className="hover:text-primary"
                    onClick={()=>{setReplySource(message);setEditingId(null);composerRef.current?.focus();}}>
                    {pt?'Responder':'Reply'}</button>
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
            {replySource&&<ReplyComposerPreview key={replySource.id} author={compactUserName(replySource.authorName)||'@'+replySource.authorHandle}
              body={replySource.body||replySource.attachment?.name} locale={locale}
              onCancel={()=>setReplySource(null)}/>}
            {mediaPicker==='gif'&&<CommunityMediaPicker key="gif" tab="gif" pt={pt}
              onClose={()=>setMediaPicker(null)}
              onEmoji={symbol=>{setDraft(old=>old+symbol);setMediaPicker(null);}}
              onGif={url=>{queueText(url);setMediaPicker(null);}}/>}
            {!!mentionOptions.length&&<div role="listbox" aria-label={pt?'Mencionar membro':'Mention member'}
              className="absolute bottom-full left-3 z-40 mb-2 max-h-[min(42dvh,290px)] w-[min(350px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-xl">
              {mentionOptions.map((member,index)=><button type="button" key={member.handle}
                role="option" aria-selected={mentionIndex===index}
                onPointerDown={event=>event.preventDefault()}
                onClick={()=>insertMention(member.handle)}
                className={cn('flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-secondary',
                  mentionIndex===index&&'bg-secondary')}>
                <UserAvatar name={compactUserName(member.displayName)} image={member.avatarUrl} size="sm"/>
                <span className="min-w-0 flex-1 truncate text-xs"><strong>@{member.handle}</strong>
                  <span className="ml-2 text-muted-foreground">{compactUserName(member.displayName)}</span></span>
              </button>)}
            </div>}
            <div onKeyDownCapture={event=>{
              if(!mentionAt||!mentionOptions.length)return;
              if(event.key==='ArrowDown'){event.preventDefault();event.stopPropagation();setMentionIndex(old=>(old+1)%mentionOptions.length);}
              if(event.key==='ArrowUp'){event.preventDefault();event.stopPropagation();setMentionIndex(old=>(old-1+mentionOptions.length)%mentionOptions.length);}
              if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();event.stopPropagation();insertMention(mentionOptions[mentionIndex]?.handle??mentionOptions[0].handle);}
              if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setMentionAt(null);}
            }}>
            <LiveMessageComposer key={selectedId+'/'+channelId} value={draft} onChange={mentionChanged}
              onSubmit={send} onAttach={sendAttachment}
              onShareLocation={(latitude,longitude,caption)=>{
                enqueueMessage((caption?caption+'\n':'')+'https://www.google.com/maps?q='+latitude+','+longitude);
              }}
              sending={false} locale={locale} textareaRef={composerRef}
              onGif={()=>setMediaPicker(old=>old==='gif'?null:'gif')} gifOpen={mediaPicker==='gif'}/>
            </div>
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
          onShareMeeting={()=>{
             const room=activeVoiceRoom;
             if(!room||room.kind!=='meeting')return;
             setMeetingShare({url:buildMeetingLink(window.location.origin,room.communityId,room.channelId),name:room.channelName});
             setMeetingShareCopied(false);setMeetingShareError('');
           }}
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
    <Dialog.Root open={Boolean(meetingShare)} onOpenChange={next=>{if(!next){setMeetingShare(null);setMeetingShareError('');}}}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[310] bg-black/65"/>
        <Dialog.Content aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[315] w-[min(92vw,470px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl outline-none">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold">{pt?'Link da reunião':'Meeting link'}</Dialog.Title>
              <p className="mt-1 truncate text-xs text-muted-foreground">{meetingShare?.name}</p>
            </div>
            <Dialog.Close asChild><Button type="button" size="icon" variant="ghost" aria-label={pt?'Fechar':'Close'}><X className="size-5"/></Button></Dialog.Close>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">{pt?
            'Este link pode ser usado por várias pessoas que já têm acesso ao canal. Ele não é um convite, não concede permissões e respeita as aprovações da reunião.':
            'This reusable link works for anyone already authorized in the channel. It is not an invitation, grants no permissions and respects meeting approval.'}</p>
          <label htmlFor="uorqui-meeting-share-url" className="mb-1 block text-xs font-semibold">{pt?'Endereço da reunião':'Meeting URL'}</label>
          <Input id="uorqui-meeting-share-url" readOnly value={meetingShare?.url??''}
            onFocus={event=>event.currentTarget.select()} className="h-10 text-xs"/>
          <Button type="button" className="mt-3 w-full gap-2" variant="outline"
            disabled={!meetingShare} onClick={async()=>{
              if(!meetingShare)return;
              try{await navigator.clipboard.writeText(meetingShare.url);setMeetingShareCopied(true);setMeetingShareError('');}
              catch{setMeetingShareError(pt?'Selecione e copie o endereço manualmente.':'Select and copy the address manually.');}
            }}>
            {meetingShareCopied?<Check className="size-4"/>:<Copy className="size-4"/>}
            {meetingShareCopied?(pt?'Link copiado':'Link copied'):(pt?'Copiar link da reunião':'Copy meeting link')}
          </Button>
          {meetingShareError&&<p role="alert" className="mt-2 text-xs text-destructive">{meetingShareError}</p>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <Dialog.Root open={channelInviteOpen} onOpenChange={next=>{
      if(channelInviteSending)return;
      setChannelInviteOpen(next);
      if(!next){setChannelInviteLink('');setChannelInviteHandle('');setChannelInviteError('');setChannelInviteSuccess('');}
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[310] bg-black/65"/>
        <Dialog.Content aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[315] flex max-h-[min(85dvh,650px)] w-[min(92vw,470px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl outline-none">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold">{pt?'Convidar para o canal':'Invite to channel'}</Dialog.Title>
              <p className="mt-1 truncate text-xs text-muted-foreground">{activeChannel?.name} · {community?.name}</p>
            </div>
            <Dialog.Close asChild><Button variant="ghost" size="icon" disabled={channelInviteSending}
              aria-label={pt?'Fechar':'Close'}><X className="size-5"/></Button></Dialog.Close>
          </div>
          <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4">
            <p className="text-sm text-muted-foreground">{pt?
              'Um único convite leva ao canal escolhido e também permite entrar na comunidade.':
              'One invitation opens this channel and also grants community membership.'}</p>
            {activeChannel?.kind==='meeting'&&<p className="text-xs text-muted-foreground">{pt?
              'O convite concede acesso ao canal. O link reutilizável da reunião fica disponível dentro da sala e não concede autorização.':
              'This invitation grants channel access. The reusable meeting link is available inside the meeting room and grants no permissions.'}</p>}
            {activeChannel?.accessMode==='restricted'&&<p className="text-xs text-muted-foreground">{pt?
              'Link exclusivo: expira em 24 horas, funciona uma vez e concede acesso ao canal após o aceite. Somente dono, admin ou moderador autorizado pode gerar.':
              'Single-use link: expires in 24 hours and grants channel access after acceptance. Only the owner, admin, or an authorized moderator can create one.'}</p>}
            {activeChannel?.hasPassword&&<p className="text-xs text-muted-foreground">{pt?
              'O convidado precisará da senha do canal.':'The invitee will need the channel password.'}</p>}
            {channelInviteLoading?<WorkspaceContentLoading label={pt?'Gerando convite':'Preparing invitation'} rows={2}/>:
              channelInviteLink&&<div className="space-y-2">
                <label className="block text-xs font-semibold" htmlFor="uorqui-channel-invite-url">{pt?'Link direto do canal':'Direct channel link'}</label>
                <Input id="uorqui-channel-invite-url" value={channelInviteLink} readOnly
                  onFocus={event=>event.currentTarget.select()} className="h-10 text-xs"/>
                <Button type="button" size="sm" variant="outline" className="w-full" onClick={()=>void copyChannelInvite()}>
                  <Copy className="size-4"/>{pt?'Copiar link':'Copy link'}
                </Button>
                {channelInviteToken&&<Button type="button" size="sm" variant="ghost"
                  className="w-full text-destructive" disabled={channelInviteLoading}
                  onClick={()=>void revokeChannelInvite()}>
                  <X className="size-4"/>{pt?'Revogar este convite':'Revoke this invitation'}
                </Button>}
              </div>}
            {channelInviteLink&&<form className="space-y-2 border-t border-border pt-3" onSubmit={event=>void inviteContactToChannel(event)}>
              <label className="block text-xs font-semibold" htmlFor="uorqui-channel-invite-handle">{pt?'Enviar pelo Uorqui':'Send in Uorqui'}</label>
              <div className="flex flex-wrap gap-2">
                <Input id="uorqui-channel-invite-handle" value={channelInviteHandle}
                  onChange={event=>setChannelInviteHandle(event.target.value)} maxLength={33} autoComplete="off"
                  placeholder="@usuario" className="h-10 min-w-36 flex-1 text-base"/>
                <Button type="submit" size="sm" disabled={channelInviteSending||!channelInviteHandle.trim()} loading={channelInviteSending}>
                  <MessageCircle className="size-4"/>{pt?'Enviar':'Send'}
                </Button>
              </div>
            </form>}
            {channelInviteError&&<p role="alert" className="text-xs text-destructive">{channelInviteError}</p>}
            {channelInviteSuccess&&<p role="status" className="text-xs text-primary">{channelInviteSuccess}</p>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <Dialog.Root open={Boolean(inspectReaction)} onOpenChange={open=>{if(!open)setInspectReaction(null);}}>
      <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[310] bg-black/65"/>
      <Dialog.Content aria-describedby={undefined}
        className="fixed left-1/2 top-1/2 z-[315] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Dialog.Title className="font-semibold">{pt?'Quem reagiu':'Who reacted'} {inspectReaction?.emoji}</Dialog.Title>
          <Dialog.Close asChild><Button type="button" variant="ghost" size="icon" aria-label={pt?'Fechar':'Close'}>
            <X className="size-4"/></Button></Dialog.Close>
        </div>
        <div className="max-h-[60dvh] space-y-1 overflow-y-auto">
          {inspectReaction?.loading&&<WorkspaceContentLoading label={pt?'Carregando reações':'Loading reactions'} rows={2}/>}
          {inspectReaction?.error&&<p role="alert" className="text-sm text-destructive">{inspectReaction.error}</p>}
          {!inspectReaction?.loading&&!inspectReaction?.error&&!inspectReaction?.users.length&&
            <p className="text-sm text-muted-foreground">{pt?'Nenhuma reação disponível.':'No reactions available.'}</p>}
          {inspectReaction?.users.map(user=><a key={user.handle} href={'/@'+user.handle}
            onClick={event=>{navigateToPublicProfile(event,user.handle);setInspectReaction(null);}}
            className="flex min-h-12 items-center gap-3 rounded-lg px-2 hover:bg-secondary">
            <UserAvatar name={compactUserName(user.name)} image={user.avatarUrl} size="sm"/>
            <span className="min-w-0"><strong className="block truncate text-sm">{compactUserName(user.name)}</strong>
              <span className="text-xs text-muted-foreground">@{user.handle}</span></span>
          </a>)}
        </div>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
    <ContentReportDialog target={reportMessageId?{targetKind:'community_message',targetId:reportMessageId}:null}
      locale={locale} onClose={()=>setReportMessageId(null)}/>
    {(error||notice)&&<div role={error?'alert':'status'}
      className={cn('pointer-events-auto absolute bottom-20 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl border border-border bg-popover px-4 py-3 text-center text-xs shadow-xl',error?'text-destructive':'text-primary')}>
      {error||notice}<button type="button" className="ml-3 underline" onClick={()=>{setError('');setNotice('');}}>{pt?'Fechar':'Close'}</button>
    </div>}
  </div>;
}
