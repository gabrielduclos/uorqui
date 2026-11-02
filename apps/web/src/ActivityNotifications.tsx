
import {useEffect,useState} from 'react';
import {Bell,Check,CheckCheck,Settings,UserPlus,UserRoundCheck,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {UserAvatar} from './UserProfiles';
import {NotificationSettings} from './NotificationSettings';
import {useUorquiPreferences} from './UorquiPreferences';
import type {ActivityNotification} from './useActivityNotifications';

type Props={items:ActivityNotification[];unread:number;loading:boolean;error:boolean;accountId:string;
  onRefresh:()=>void;onReadAll:()=>Promise<void>;onOpen:(item:ActivityNotification)=>void};
export function ActivityNotifications({items,unread,loading,error,accountId,onRefresh,onReadAll,onOpen}:Props){
  const {locale}=useUorquiPreferences(),pt=locale==='pt-BR';
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [actionError,setActionError]=useState(false);
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
  if(settingsOpen)return <NotificationSettings accountId={accountId} onBack={()=>setSettingsOpen(false)}/>;
  return <div className="h-full min-h-0 overflow-y-auto overscroll-contain bg-background">
    <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
      <div className="mb-5 flex items-center justify-between gap-2">
        <div><h2 className="text-lg font-semibold">{pt?'Notificações':'Notifications'}</h2>
          <p className="text-xs text-muted-foreground">{unread>0?
            (pt?unread+' não lida'+(unread===1?'':'s'):unread+' unread'):
            (pt?'Tudo em dia':'All caught up')}</p></div>
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
      {loading&&!items.length?<p role="status" className="flex items-center gap-3 py-7 text-sm text-muted-foreground">
        <Spinner className="size-4"/>{pt?'Carregando notificações…':'Loading notifications…'}</p>:
      !items.length&&!error?<div className="flex flex-col items-center gap-2 rounded-xl border border-border p-8 text-center text-muted-foreground">
        <Bell className="size-9"/><p className="text-sm">{pt?'Ainda não há notificações.':'No notifications yet.'}</p></div>:
      <div className="space-y-1">{items.map(item=>{
        const Icon=icons[item.kind]??Bell;
        return <div key={item.id} className={'flex min-h-18 flex-wrap items-center gap-2 rounded-xl border px-3 py-3 transition-colors hover:bg-secondary/70 '+(item.readAt?'border-transparent':'border-primary/20 bg-primary/5')}>
          <button type="button" onClick={()=>onOpen(item)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            aria-label={item.actorName+' '+verbs[item.kind]+(!item.readAt?(pt?', não lida':', unread'):'')}>
            <UserAvatar name={item.actorName} image={item.actorAvatar} size="sm"/>
            <span className="min-w-0 flex-1"><span className="block text-sm"><strong>{item.actorName}</strong> {verbs[item.kind]}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {new Intl.DateTimeFormat(locale,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(item.createdAt))}
              </span></span>
            <span className="flex shrink-0 items-center gap-2"><Icon aria-hidden="true" className="size-4 text-primary"/>
              {!item.readAt&&<span aria-hidden="true" className="size-2 rounded-full bg-primary"/>}</span>
          </button>
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
