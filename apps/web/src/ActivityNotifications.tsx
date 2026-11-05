
import {useEffect,useState} from 'react';
import {Bell,Check,CheckCheck,Hash,Headphones,Settings,UserPlus,UserRoundCheck,Users,Video,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {UserAvatar} from './UserProfiles';
import {NotificationSettings} from './NotificationSettings';
import {useUorquiPreferences} from './UorquiPreferences';
import type {ActivityNotification} from './useActivityNotifications';
import type {UnreadLocation,CommunityInviteAlert} from './useCommunityUnread';
import { WorkspaceContentLoading } from './ui-kit/WorkspaceContentLoading';

type Props={items:ActivityNotification[];unread:number;loading:boolean;error:boolean;accountId:string;
  channelAlerts:UnreadLocation[];communityInvites:CommunityInviteAlert[];
  onOpenChannel:(communityId:string,channelId:string)=>void;onOpenCommunity:(communityId:string)=>void;
  onRefresh:()=>void;onReadAll:()=>Promise<void>;onDelete:(id:string)=>Promise<void>;onOpen:(item:ActivityNotification)=>void};
export function ActivityNotifications({items,unread,loading,error,accountId,channelAlerts,communityInvites,onOpenChannel,onOpenCommunity,onRefresh,onReadAll,onDelete,onOpen}:Props){
  const {locale}=useUorquiPreferences(),pt=locale==='pt-BR';
  const [settingsOpen,setSettingsOpen]=useState(false);
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
    friend_request:pt?'enviou uma solicitação de amizade':'sent you a friend request',
    friend_accepted:pt?'aceitou sua solicitação de amizade':'accepted your friend request',
    community_join_request:pt?'solicitou entrada em uma comunidade':'requested to join a community',
    meeting_join_request:pt?'solicitou participar de uma reunião':'requested to join a meeting'
  };
  const icons={friend_request:UserPlus,friend_accepted:UserRoundCheck,community_join_request:UserPlus,meeting_join_request:Users};
  const all=async()=>{setBusy(true);setActionError(false);
    try{await onReadAll();}catch{setActionError(true);}finally{setBusy(false);}};
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
      {unread>0&&<div className="mb-4 flex justify-end"><Button size="sm" variant="ghost" disabled={busy} onClick={()=>void all()}>
        {busy?<Spinner className="size-4"/>:<CheckCheck className="size-4"/>}
        {pt?'Marcar todas como lidas':'Mark all read'}</Button></div>}
      {actionError&&<p role="alert" className="mb-3 text-sm text-destructive">
        {pt?'Não foi possível atualizar as notificações.':'Could not update notifications.'}</p>}
      {error&&<div className="mb-4 rounded-xl border border-border p-3 text-sm">
        {pt?'Não foi possível carregar as notificações.':'Could not load notifications.'}
        <Button variant="ghost" size="sm" onClick={onRefresh}>{pt?'Tentar novamente':'Retry'}</Button></div>}
      {communityInvites.length>0&&<section aria-label={pt?'Convites para comunidades':'Community invitations'} className="mb-5 space-y-2">
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
      {channelAlerts.length>0&&<section aria-label={pt?'Canais com mensagens não lidas':'Channels with unread messages'}
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
      {loading&&!items.length?<WorkspaceContentLoading label={pt?'Carregando notificações':'Loading notifications'} rows={4} className="py-4"/>:
      !items.length&&!error&&!channelAlerts.length&&!communityInvites.length?<div className="flex flex-col items-center gap-2 rounded-xl border border-border p-8 text-center text-muted-foreground">
        <Bell className="size-9"/><p className="text-sm">{pt?'Ainda não há notificações.':'No notifications yet.'}</p></div>:
      <div className="space-y-1">{items.map(item=>{
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
              {friendDone[item.id]==='accept'?(pt?'Amizade aceita':'Friend request accepted'):(pt?'Solicitação recusada':'Request declined')}
            </span>:<>
              <Button type="button" size="sm" disabled={!!friendBusy} onClick={()=>void respondToFriend(item,'accept')}
                aria-label={pt?'Aceitar amizade de '+item.actorName:'Accept friend request from '+item.actorName}>
                {friendBusy===item.id?<Spinner className="size-3.5"/>:<Check className="size-3.5"/>}{pt?'Aceitar':'Accept'}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={!!friendBusy} onClick={()=>void respondToFriend(item,'decline')}
                aria-label={pt?'Recusar amizade de '+item.actorName:'Decline friend request from '+item.actorName}>
                <X className="size-3.5"/>{pt?'Recusar':'Decline'}
              </Button>
            </>}
            {friendError===item.id&&<span role="alert" className="text-xs text-destructive">{pt?'Pedido indisponível':'Request unavailable'}</span>}
          </div>}
        </div>;
      })}</div>}
    </div>
  </div>;
}
