
import {useState} from 'react';
import {Bell,CheckCheck,Heart,MessageCircle,UserPlus,UserRoundCheck,UserRoundPlus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {UserAvatar} from './UserProfiles';
import {PushPreferences} from './PushPreferences';
import {useUorquiPreferences} from './UorquiPreferences';
import type {ActivityNotification} from './useActivityNotifications';

type Props={items:ActivityNotification[];unread:number;loading:boolean;error:boolean;accountId:string;
  onRefresh:()=>void;onReadAll:()=>Promise<void>;onOpen:(item:ActivityNotification)=>void};
export function ActivityNotifications({items,unread,loading,error,accountId,onRefresh,onReadAll,onOpen}:Props){
  const {locale}=useUorquiPreferences(),pt=locale==='pt-BR';
  const [busy,setBusy]=useState(false);
  const [actionError,setActionError]=useState(false);
  const verbs={
    post_like:pt?'curtiu sua publicação':'liked your post',
    post_comment:pt?'comentou na sua publicação':'commented on your post',
    friend_request:pt?'enviou uma solicitação de amizade':'sent you a friend request',
    friend_accepted:pt?'aceitou sua solicitação de amizade':'accepted your friend request',
    follow:pt?'começou a seguir você':'started following you'
  };
  const icons={post_like:Heart,post_comment:MessageCircle,friend_request:UserPlus,
    friend_accepted:UserRoundCheck,follow:UserRoundPlus};
  const all=async()=>{setBusy(true);setActionError(false);
    try{await onReadAll();}catch{setActionError(true);}finally{setBusy(false);}};
  return <div className="h-full min-h-0 overflow-y-auto overscroll-contain bg-background">
    <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
      <div className="mb-5 flex items-center justify-between gap-2">
        <div><h2 className="text-lg font-semibold">{pt?'Notificações':'Notifications'}</h2>
          <p className="text-xs text-muted-foreground">{unread>0?
            (pt?unread+' não lida'+(unread===1?'':'s'):unread+' unread'):
            (pt?'Tudo em dia':'All caught up')}</p></div>
        {unread>0&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void all()}>
          {busy?<Spinner className="size-4"/>:<CheckCheck className="size-4"/>}
          {pt?'Marcar todas como lidas':'Mark all read'}</Button>}
      </div>
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
        return <button type="button" key={item.id} onClick={()=>onOpen(item)}
          className={'flex min-h-18 w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors hover:bg-secondary/70 '+(item.readAt?'border-transparent':'border-primary/20 bg-primary/5')}
          aria-label={item.actorName+' '+verbs[item.kind]+(!item.readAt?(pt?', não lida':', unread'):'')}>
          <UserAvatar name={item.actorName} image={item.actorAvatar} size="sm"/>
          <span className="min-w-0 flex-1"><span className="block text-sm"><strong>{item.actorName}</strong> {verbs[item.kind]}</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {new Intl.DateTimeFormat(locale,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(item.createdAt))}
          </span></span>
          <span className="flex shrink-0 items-center gap-2"><Icon aria-hidden="true" className="size-4 text-primary"/>
            {!item.readAt&&<span aria-hidden="true" className="size-2 rounded-full bg-primary"/>}</span>
        </button>;
      })}</div>}
      <div className="mt-6 border-t border-border pt-2"><PushPreferences accountId={accountId}/></div>
    </div>
  </div>;
}
