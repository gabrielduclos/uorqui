
import {useEffect,useState} from 'react';
import {AtSign,Bell,Check,CheckCheck,Hash,Headphones,Mail,MessageCircle,Settings,UserPlus,UserRoundCheck,Users,Video,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {UserAvatar} from './UserProfiles';
import {NotificationSettings} from './NotificationSettings';
import {useUorquiPreferences} from './UorquiPreferences';
import type {ActivityNotification} from './useActivityNotifications';
import type {UnreadLocation,CommunityInviteAlert} from './useCommunityUnread';
import { WorkspaceContentLoading } from './ui-kit/WorkspaceContentLoading';

type InboxEvent={id:string;kind:'mention'|'email';createdAt:string;readAt:string|null;
  communityId:string|null;communityName:string|null;channelId:string|null;channelName:string|null;
  communityMessageId:string|null;actorHandle:string|null;actorName:string|null;actorAvatar:string|null;
  mailAccountId:string|null;mailMessageId:string|null;mailAddress:string|null;sender:string|null;subject:string|null};
type DirectUnread={id:string;peerHandle:string;peerName:string;peerAvatarUrl:string|null;
  unreadCount:number;lastBody:string|null;lastAt:string|null;archived:boolean};
type Tab='all'|'messages'|'mentions'|'email'|'invites'|'contacts';
type Props={items:ActivityNotification[];unread:number;loading:boolean;error:boolean;accountId:string;
  channelAlerts:UnreadLocation[];communityInvites:CommunityInviteAlert[];
  unreadMailCount:number;onOpenEmailInbox:()=>void;
  onOpenDm:(conversationId:string)=>void;onOpenMail:(accountId:string,messageId:string)=>void;
  onOpenChannel:(communityId:string,channelId:string)=>void;onOpenCommunity:(communityId:string)=>void;
  onRefresh:()=>void;onReadAll:()=>Promise<void>;onDelete:(id:string)=>Promise<void>;onOpen:(item:ActivityNotification)=>void};
export function ActivityNotifications({items,unread,loading,error,accountId,channelAlerts,communityInvites,unreadMailCount,
  onOpenEmailInbox,onOpenDm,onOpenMail,onOpenChannel,onOpenCommunity,onRefresh,onReadAll,onDelete,onOpen}:Props){
  const {locale}=useUorquiPreferences(),pt=locale==='pt-BR';
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [activeTab,setActiveTab]=useState<Tab>('all');
  const [inboxEvents,setInboxEvents]=useState<InboxEvent[]>([]);
  const [inboxLoading,setInboxLoading]=useState(true);
  const [inboxError,setInboxError]=useState(false);
  const [directUnread,setDirectUnread]=useState<DirectUnread[]>([]);
  const [directLoading,setDirectLoading]=useState(true);
  useEffect(()=>{
    let alive=true;
    const refresh=()=>{
      void fetch('/api/v1/notifications/inbox-events',{credentials:'same-origin',cache:'no-store'})
        .then(async response=>{if(!response.ok)throw Error('INBOX_UNAVAILABLE');
          return response.json() as Promise<{events:InboxEvent[]}>;})
        .then(body=>{if(alive){setInboxEvents(body.events);setInboxError(false);}})
        .catch(()=>{if(alive)setInboxError(true);})
        .finally(()=>{if(alive)setInboxLoading(false);});
    };
    setInboxEvents([]);setInboxLoading(true);refresh();
    const interval=window.setInterval(()=>{if(document.visibilityState==='visible')refresh();},30000);
    window.addEventListener('uorqui:activity-update',refresh);
    window.addEventListener('uorqui:mail-unread-refresh',refresh);
    window.addEventListener('focus',refresh);
    return()=>{alive=false;window.clearInterval(interval);
      window.removeEventListener('uorqui:activity-update',refresh);
      window.removeEventListener('uorqui:mail-unread-refresh',refresh);
      window.removeEventListener('focus',refresh);
    };
  },[accountId]);
  useEffect(()=>{
    let alive=true;
    const refresh=()=>{
      void fetch('/api/v1/dm/conversations',{credentials:'same-origin',cache:'no-store'})
        .then(async response=>{if(!response.ok)throw Error('DM_UNAVAILABLE');
          return response.json() as Promise<{conversations:DirectUnread[]}>;})
        .then(body=>{if(alive)setDirectUnread(body.conversations.filter(item=>!item.archived&&item.unreadCount>0));})
        .catch(()=>{})
        .finally(()=>{if(alive)setDirectLoading(false);});
    };
    setDirectUnread([]);setDirectLoading(true);refresh();
    const interval=window.setInterval(()=>{if(document.visibilityState==='visible')refresh();},30000);
    const messageRefresh=()=>refresh();
    window.addEventListener('uorqui:dm-unread-count',messageRefresh);
    window.addEventListener('focus',messageRefresh);
    return()=>{alive=false;window.clearInterval(interval);
      window.removeEventListener('uorqui:dm-unread-count',messageRefresh);
      window.removeEventListener('focus',messageRefresh);};
  },[accountId]);
  const mentions=inboxEvents.filter(item=>item.kind==='mention');
  const emails=inboxEvents.filter(item=>item.kind==='email');
  const contactActivities=items.filter(item=>item.kind==='friend_request'||item.kind==='friend_accepted');
  const inviteActivities=items.filter(item=>item.kind==='community_join_request'||item.kind==='meeting_join_request');
  const allTab=activeTab==='all';
  const showMessages=allTab||activeTab==='messages';
  const showMentions=allTab||activeTab==='mentions';
  const showEmail=allTab||activeTab==='email';
  const showInvites=allTab||activeTab==='invites';
  const showContacts=allTab||activeTab==='contacts';
  const visibleActivities=[...(showInvites?inviteActivities:[]),...(showContacts?contactActivities:[])]
    .sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  const hasContent=Boolean(
    (showMessages&&(directUnread.length||channelAlerts.length))||
    (showMentions&&mentions.length)||(showEmail&&(emails.length||unreadMailCount))||
    (showInvites&&communityInvites.length)||visibleActivities.length);

  const tabs:{key:Tab;pt:string;en:string;icon:typeof Bell;count:number}[]=[
    {key:'all',pt:'Todas',en:'All',icon:Bell,count:0},
    {key:'messages',pt:'Mensagens',en:'Messages',icon:MessageCircle,count:directUnread.length+channelAlerts.length},
    {key:'mentions',pt:'Menções',en:'Mentions',icon:AtSign,count:mentions.filter(x=>!x.readAt).length},
    {key:'email',pt:'E-mail',en:'Email',icon:Mail,count:Math.max(unreadMailCount,emails.filter(x=>!x.readAt).length)},
    {key:'invites',pt:'Convites',en:'Invites',icon:Users,count:communityInvites.length+inviteActivities.filter(x=>!x.readAt).length},
    {key:'contacts',pt:'Contatos',en:'Contacts',icon:UserPlus,count:contactActivities.filter(x=>!x.readAt).length}
  ];
  const eventRead=async(id:string)=>{
    const event=inboxEvents.find(item=>item.id===id);
    if(!event||event.readAt)return;
    setInboxEvents(old=>old.map(item=>item.id===id?{...item,readAt:new Date().toISOString()}:item));
    try{
      const response=await fetch('/api/v1/notifications/inbox-events/'+id+'/read',{method:'PATCH',credentials:'same-origin'});
      if(!response.ok)throw Error('UNAVAILABLE');
    }catch{setInboxEvents(old=>old.map(item=>item.id===id?{...item,readAt:null}:item));}
  };
  const eventDelete=async(id:string)=>{
    setDeletingId(id);setDeleteError(null);
    try{
      const response=await fetch('/api/v1/notifications/inbox-events/'+id,{method:'DELETE',credentials:'same-origin'});
      if(!response.ok)throw Error('UNAVAILABLE');
      setInboxEvents(old=>old.filter(item=>item.id!==id));
    }catch{setDeleteError(id);}
    finally{setDeletingId(null);}
  };
  const [busy,setBusy]=useState(false);
  const [actionError,setActionError]=useState(false);
  const [deletingId,setDeletingId]=useState<string|null>(null);
  const [deleteError,setDeleteError]=useState<string|null>(null);
  async function deleteNotification(id:string){
    if(deletingId)return;
    setDeletingId(id);setDeleteError(null);
    try{await onDelete(id);}
    catch{setDeleteError(id);}
    finally{setDeletingId(null);}
  }
  const [friendBusy,setFriendBusy]=useState<string|null>(null);
  const [friendDone,setFriendDone]=useState<Record<string,'accept'|'decline'>>({});
  const [friendError,setFriendError]=useState<string|null>(null);
  const [pendingFriendHandles,setPendingFriendHandles]=useState<Set<string>>(new Set());
  useEffect(()=>{
    let active=true;
    const check=()=>void fetch('/api/v1/friends',{credentials:'same-origin',cache:'no-store'})
      .then(async response=>response.ok?response.json() as Promise<{received:{handle:string}[]}>:null)
      .then(result=>{if(active&&result)setPendingFriendHandles(new Set(result.received.map(person=>person.handle)));})
      .catch(()=>{});
    check();
    window.addEventListener('uorqui:friends-updated',check);
    return()=>{active=false;window.removeEventListener('uorqui:friends-updated',check);};
  },[accountId]);
  async function respondToFriend(item:ActivityNotification,action:'accept'|'decline'){
    if(friendBusy||!/^[a-z][a-z0-9_]{2,31}$/.test(item.actorHandle))return;
    setFriendBusy(item.id);setFriendError(null);
    try{
      const response=await fetch('/api/v1/friends/requests/'+encodeURIComponent(item.actorHandle)+'/'+action,{
        method:'POST',credentials:'same-origin',cache:'no-store'
      });
      if(!response.ok)throw Error('FAILED');
      setFriendDone(previous=>({...previous,[item.id]:action}));
      setPendingFriendHandles(previous=>{const next=new Set(previous);next.delete(item.actorHandle);return next;});
      window.dispatchEvent(new Event('uorqui:friends-updated'));
      onRefresh();
    }catch{setFriendError(item.id);}
    finally{setFriendBusy(null);}
  }
  const verbs={
    friend_request:pt?'enviou uma solicitação de contato':'sent you a contact request',
    friend_accepted:pt?'aceitou sua solicitação de contato':'accepted your contact request',
    community_join_request:pt?'solicitou entrada em uma comunidade':'requested to join a community',
    meeting_join_request:pt?'solicitou participar de uma reunião':'requested to join a meeting'
  };
  const icons={friend_request:UserPlus,friend_accepted:UserRoundCheck,community_join_request:UserPlus,meeting_join_request:Users};
  const all=async()=>{setBusy(true);setActionError(false);
    try{
      const result=await Promise.allSettled([
        onReadAll(),
        fetch('/api/v1/notifications/inbox-events/read-all',{method:'POST',credentials:'same-origin'})
          .then(response=>{if(!response.ok)throw Error('UNAVAILABLE');})
      ]);
      if(result.some(item=>item.status==='rejected'))throw Error('UNAVAILABLE');
      setInboxEvents(old=>old.map(item=>({...item,readAt:item.readAt??new Date().toISOString()})));
    }catch{setActionError(true);}finally{setBusy(false);}};
  if(settingsOpen)return <div className="uorqui-kit-content-enter h-full min-h-0"><NotificationSettings accountId={accountId} onBack={()=>setSettingsOpen(false)}/></div>;
  return <div className="uorqui-kit-content-enter h-full min-h-0 overflow-y-auto overscroll-contain bg-background">
    <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
      <div className="mb-5 flex items-center justify-between gap-2">
        <div><h2 className="text-lg font-semibold">{pt?'Notificações':'Notifications'}</h2>
          <p className="text-xs text-muted-foreground">
            {unread>0?(pt?unread+' atividade'+(unread===1?'':'s')+' não lida'+(unread===1?'':'s'):unread+' unread activities'):(pt?'Atividades em dia':'Activity caught up')}
            {channelAlerts.length>0?' · '+channelAlerts.length+(pt?' canal'+(channelAlerts.length===1?'':'is')+' com mensagens novas':' channels with new messages'):''}
            {communityInvites.length>0?' · '+communityInvites.length+(pt?' convite'+(communityInvites.length===1?'':'s')+' pendente'+(communityInvites.length===1?'':'s'):' pending invitations'):''}
          </p></div>
        <Button type="button" size="sm" variant="outline" onClick={()=>setSettingsOpen(true)} className="gap-2">
          <Settings className="size-4"/>{pt?'Ajustes':'Settings'}</Button>
      </div>
      <div role="tablist" aria-label={pt?'Filtrar notificações por tipo':'Filter notifications by type'}
        className="-mx-4 mb-5 flex gap-1.5 overflow-x-auto border-b border-border px-4 pb-3 [scrollbar-width:thin] sm:mx-0 sm:px-0"
        onKeyDown={event=>{
          const current=tabs.findIndex(tab=>tab.key===activeTab);
          let nextIndex:number;
          if(event.key==='ArrowRight')nextIndex=(current+1)%tabs.length;
          else if(event.key==='ArrowLeft')nextIndex=(current-1+tabs.length)%tabs.length;
          else if(event.key==='Home')nextIndex=0;
          else if(event.key==='End')nextIndex=tabs.length-1;
          else return;
          event.preventDefault();
          setActiveTab(tabs[nextIndex].key);
          event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
        }}>
        {tabs.map(tab=>{
          const Icon=tab.icon,selected=activeTab===tab.key;
          return <button key={tab.key} type="button" role="tab" aria-selected={selected}
            tabIndex={selected?0:-1} onClick={()=>setActiveTab(tab.key)}
            className={'inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring '+
              (selected?'border-primary bg-primary/10 text-foreground':'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground')}>
            <Icon aria-hidden="true" className="size-4"/>
            {pt?tab.pt:tab.en}
            {tab.count>0&&<span className={'rounded-full px-1.5 py-0.5 text-[11px] tabular-nums '+
              (selected?'bg-primary text-primary-foreground':'bg-secondary text-foreground')}>
              {tab.count>99?'99+':tab.count}</span>}
          </button>;
        })}
      </div>
      {allTab&&(unread>0||inboxEvents.some(event=>!event.readAt))&&
        <div className="mb-4 flex justify-end"><Button size="sm" variant="ghost" disabled={busy} onClick={()=>void all()}>
          {busy?<Spinner className="size-4"/>:<CheckCheck className="size-4"/>}
          {pt?'Marcar atividades como lidas':'Mark activity as read'}</Button></div>}
      {actionError&&<p role="alert" className="mb-3 text-sm text-destructive">
        {pt?'Não foi possível atualizar as notificações.':'Could not update notifications.'}</p>}
      {error&&<div className="mb-4 rounded-xl border border-border p-3 text-sm">
        {pt?'Não foi possível carregar as notificações.':'Could not load notifications.'}
        <Button variant="ghost" size="sm" onClick={onRefresh}>{pt?'Tentar novamente':'Retry'}</Button></div>}
      {showInvites&&communityInvites.length>0&&<section aria-label={pt?'Convites para comunidades':'Community invitations'} className="mb-5 space-y-2">
        <h3 className="text-sm font-semibold">{pt?'Convites para comunidades':'Community invitations'}</h3>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {communityInvites.map(invite=><button type="button" key={invite.communityId}
            onClick={()=>onOpenCommunity(invite.communityId)}
            className="flex min-h-14 w-full items-center gap-3 border-b border-border/70 px-3 py-2.5 text-left last:border-0 hover:bg-secondary/70">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary"><Users className="size-4"/></span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-sm">{invite.communityName}</strong>
              <span className="block text-xs text-muted-foreground">{pt?'Convite pendente — abrir para aceitar ou recusar':'Pending invitation — open to accept or decline'}</span>
            </span>
          </button>)}
        </div>
      </section>}
      {showMessages&&channelAlerts.length>0&&<section aria-label={pt?'Canais com mensagens não lidas':'Channels with unread messages'}
        className="mb-5 space-y-2">
        <h3 className="text-sm font-semibold">{pt?'Mensagens das comunidades e canais':'Community and channel messages'}</h3>
        <p className="text-xs text-muted-foreground">{pt?
          'Aparecem somente canais que sua conta pode acessar. Ao abrir um canal, as mensagens podem ser marcadas como lidas.':
          'Only channels your account can access are shown. Opening a channel lets you read its messages.'}</p>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {channelAlerts.map(alert=>{
            const Icon=alert.channelKind==='voice'?Headphones:alert.channelKind==='meeting'?Video:Hash;
            return <button key={alert.channelId} type="button"
              onClick={()=>onOpenChannel(alert.communityId,alert.channelId)}
              aria-label={(pt?'Abrir canal ':'Open channel ')+alert.channelName+' · '+alert.communityName}
              className="flex min-h-14 w-full items-center gap-3 border-b border-border/70 px-3 py-2.5 text-left last:border-0 hover:bg-secondary/70">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-foreground">
                <Icon aria-hidden="true" className="size-4"/>
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm">{alert.channelName}</strong>
                <span className="block truncate text-xs text-muted-foreground">{alert.communityName}</span>
              </span>
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                {alert.count>99?'99+':alert.count}
              </span>
            </button>;
          })}
        </div>
      </section>}
      {showMessages&&directUnread.length>0&&<section aria-label={pt?'Mensagens privadas não lidas':'Unread private messages'}
        className="mb-5 space-y-2">
        <h3 className="text-sm font-semibold">{pt?'Mensagens privadas':'Private messages'}</h3>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {directUnread.map(chat=><button key={chat.id} type="button" onClick={()=>onOpenDm(chat.id)}
            className="flex min-h-14 w-full min-w-0 items-center gap-3 border-b border-border/70 px-3 py-2.5 text-left last:border-0 hover:bg-secondary/70">
            <UserAvatar name={chat.peerName} image={chat.peerAvatarUrl} size="sm"/>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-sm">{chat.peerName}</strong>
              <span className="block truncate text-xs text-muted-foreground">{chat.lastBody||'@'+chat.peerHandle}</span>
            </span>
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              {chat.unreadCount>99?'99+':chat.unreadCount}</span>
          </button>)}
        </div>
      </section>}
      {showMentions&&mentions.length>0&&<section aria-label={pt?'Menções a você':'Mentions of you'}
        className="mb-5 space-y-2">
        <h3 className="text-sm font-semibold">{pt?'Menções a você':'Mentions of you'}</h3>
        <div className="space-y-1">{mentions.map(event=><div key={event.id}
          className={'flex min-h-16 items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors hover:bg-secondary/70 '+
            (event.readAt?'border-border':'border-primary/25 bg-primary/5')}>
          <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left"
            onClick={()=>{
              void eventRead(event.id);
              if(event.communityId&&event.channelId)onOpenChannel(event.communityId,event.channelId);
            }}>
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
              <AtSign className="size-4"/></span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-sm">@{event.actorHandle||'usuario'}</strong>
              <span className="block truncate text-xs text-muted-foreground">
                {pt?'Mencionou você em ':'Mentioned you in '}#{event.channelName} · {event.communityName}
              </span>
              <span className="text-[11px] text-muted-foreground">{new Intl.DateTimeFormat(locale,
                {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(event.createdAt))}</span>
            </span>{!event.readAt&&<span className="size-2 shrink-0 rounded-full bg-primary"/>}
          </button>
          <button type="button" aria-label={pt?'Excluir menção':'Dismiss mention'} disabled={!!deletingId}
            onClick={()=>void eventDelete(event.id)}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
            {deletingId===event.id?<Spinner className="size-4"/>:<X className="size-4"/>}</button>
        </div>)}</div>
      </section>}
      {showEmail&&(emails.length>0||unreadMailCount>0)&&<section aria-label={pt?'Notificações de e-mail':'Email notifications'}
        className="mb-5 space-y-2">
        <h3 className="text-sm font-semibold">{pt?'E-mails':'Email'}</h3>
        {unreadMailCount>0&&<button type="button" onClick={onOpenEmailInbox}
          className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left hover:bg-secondary/70">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary"><Mail className="size-4"/></span>
          <span className="min-w-0 flex-1 text-sm font-medium">{pt?
            unreadMailCount+' e-mail'+(unreadMailCount===1?'':'s')+' não lido'+(unreadMailCount===1?'':'s')+' nas contas conectadas':
            unreadMailCount+' unread email'+(unreadMailCount===1?'':'s')+' in linked mailboxes'}</span>
        </button>}
        <div className="space-y-1">{emails.map(event=><div key={event.id}
          className={'flex min-h-16 items-center gap-2 rounded-xl border px-3 py-2.5 hover:bg-secondary/70 '+
            (event.readAt?'border-border':'border-primary/25 bg-primary/5')}>
          <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left"
            onClick={()=>{
              void eventRead(event.id);
              if(event.mailAccountId&&event.mailMessageId)onOpenMail(event.mailAccountId,event.mailMessageId);
            }}>
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary"><Mail className="size-4"/></span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-sm">{event.subject|| (pt?'(Sem assunto)':'(No subject)')}</strong>
              <span className="block truncate text-xs text-muted-foreground">
                {event.sender||event.mailAddress||''}{event.mailAddress?' · '+event.mailAddress:''}
              </span>
              <span className="text-[11px] text-muted-foreground">{new Intl.DateTimeFormat(locale,
                {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(event.createdAt))}</span>
            </span>{!event.readAt&&<span className="size-2 shrink-0 rounded-full bg-primary"/>}
          </button>
          <button type="button" aria-label={pt?'Excluir aviso de e-mail':'Dismiss email notification'} disabled={!!deletingId}
            onClick={()=>void eventDelete(event.id)}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
            {deletingId===event.id?<Spinner className="size-4"/>:<X className="size-4"/>}</button>
        </div>)}</div>
      </section>}
      {visibleActivities.length>0&&<section aria-label={pt?'Atividades':'Activity'} className="mb-5 space-y-2">
        <h3 className="text-sm font-semibold">{activeTab==='contacts'?(pt?'Contatos':'Contacts'):
          activeTab==='invites'?(pt?'Solicitações e convites':'Requests and invitations'):
          (pt?'Outras atividades':'Other activity')}</h3>
        <div className="space-y-1">{visibleActivities.map(item=>{
        const Icon=icons[item.kind]??Bell;
        const isCommunityRequest=item.kind==='community_join_request'||item.kind==='meeting_join_request';
        const destination=isCommunityRequest&&item.communityName
          ?item.kind==='meeting_join_request'&&item.meetingName
            ?item.communityName+' · '+item.meetingName:item.communityName
          :null;
        return <div key={item.id} className={'flex min-h-18 flex-wrap items-center gap-2 rounded-xl border px-3 py-3 transition-colors hover:bg-secondary/70 '+(item.readAt?'border-transparent':'border-primary/20 bg-primary/5')}>
          <button type="button" onClick={()=>onOpen(item)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            aria-label={item.actorName+' '+verbs[item.kind]+(destination?' · '+destination:'')+(!item.readAt?(pt?', não lida':', unread'):'')}>
            <UserAvatar name={item.actorName} image={item.actorAvatar} size="sm"/>
            <span className="min-w-0 flex-1"><span className="block text-sm"><strong>{item.actorName}</strong> {verbs[item.kind]}</span>
              {destination&&<span className="mt-1 block truncate text-xs font-semibold text-primary" title={destination}>
                <Users className="mr-1 inline size-3.5" aria-hidden="true"/>{destination}
              </span>}
              <span className="mt-1 block text-xs text-muted-foreground">
                {new Intl.DateTimeFormat(locale,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(item.createdAt))}
              </span></span>
            <span className="flex shrink-0 items-center gap-2"><Icon aria-hidden="true" className="size-4 text-primary"/>
              {!item.readAt&&<span aria-hidden="true" className="size-2 rounded-full bg-primary"/>}</span>
          </button>
          <button type="button" disabled={!!deletingId} onClick={()=>void deleteNotification(item.id)}
            aria-label={pt?'Excluir notificação de '+item.actorName:'Delete notification from '+item.actorName}
            title={pt?'Excluir notificação':'Delete notification'}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40">
            {deletingId===item.id?<Spinner className="size-4"/>:<X className="size-4"/>}
          </button>
          {deleteError===item.id&&<p role="alert" className="w-full pl-12 text-xs text-destructive">
            {pt?'Não foi possível excluir a notificação.':'Could not delete notification.'}
          </p>}
          {item.kind==='friend_request'&&(pendingFriendHandles.has(item.actorHandle)||!!friendDone[item.id])&&<div className="flex w-full items-center justify-end gap-2 pl-12">
            {friendDone[item.id]?<span role="status" className="text-xs text-muted-foreground">
              {friendDone[item.id]==='accept'?(pt?'Contato adicionado':'Contact request accepted'):(pt?'Solicitação recusada':'Request declined')}
            </span>:<>
              <Button type="button" size="sm" disabled={!!friendBusy} onClick={()=>void respondToFriend(item,'accept')}
                aria-label={pt?'Aceitar contato de '+item.actorName:'Accept contact request from '+item.actorName}>
                {friendBusy===item.id?<Spinner className="size-3.5"/>:<Check className="size-3.5"/>}{pt?'Aceitar':'Accept'}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={!!friendBusy} onClick={()=>void respondToFriend(item,'decline')}
                aria-label={pt?'Recusar contato de '+item.actorName:'Decline contact request from '+item.actorName}>
                <X className="size-3.5"/>{pt?'Recusar':'Decline'}
              </Button>
            </>}
            {friendError===item.id&&<span role="alert" className="text-xs text-destructive">{pt?'Pedido indisponível':'Request unavailable'}</span>}
          </div>}
        </div>;
      })}</div>
      </section>}
      {(loading||inboxLoading||directLoading)&&!hasContent&&
        <WorkspaceContentLoading label={pt?'Carregando notificações':'Loading notifications'} rows={3} className="py-4"/>}
      {inboxError&&<p role="alert" className="mb-3 rounded-lg border border-border p-3 text-xs text-muted-foreground">
        {pt?'Não foi possível carregar as menções e os avisos de e-mail.':'Could not load mentions and email notifications.'}</p>}
      {!loading&&!inboxLoading&&!directLoading&&!hasContent&&!error&&!inboxError&&
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border p-8 text-center text-muted-foreground">
          <Bell className="size-9"/><p className="text-sm">{pt?
            (activeTab==='all'?'Todas as notificações estão em dia.': 'Nenhuma notificação nesta categoria.'):
            (activeTab==='all'?'You’re all caught up.':'No notifications in this category.')}</p>
        </div>}
    </div>
  </div>;
}
