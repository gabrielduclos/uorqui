import {useEffect,useState} from 'react';
import {ArrowLeft,Bell,BellOff,Check,Heart,MessageCircle,Users,UserPlus,UserRoundCheck,UserRoundPlus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {PushPreferences} from './PushPreferences';
import {useUorquiPreferences} from './UorquiPreferences';

export type PushKind='direct_message'|'community_message'|'post_like'|'post_comment'|'friend_request'|'friend_accepted'|'follow';
export type PushSettings=Record<PushKind,boolean>;
const initial:PushSettings={direct_message:true,community_message:true,post_like:true,post_comment:true,
  friend_request:true,friend_accepted:true,follow:true};
const options=[
  {key:'direct_message',pt:'Mensagens privadas',en:'Direct messages',icon:MessageCircle},
  {key:'community_message',pt:'Mensagens em comunidades',en:'Community messages',icon:Users},
  {key:'post_like',pt:'Curtidas nas publicações',en:'Post likes',icon:Heart},
  {key:'post_comment',pt:'Comentários nas publicações',en:'Post comments',icon:MessageCircle},
  {key:'friend_request',pt:'Solicitações de amizade',en:'Friend requests',icon:UserPlus},
  {key:'friend_accepted',pt:'Amizades aceitas',en:'Accepted friend requests',icon:UserRoundCheck},
  {key:'follow',pt:'Novos seguidores',en:'New followers',icon:UserRoundPlus}
] as const;

export function NotificationSettings({accountId,onBack}:{accountId:string;onBack:()=>void}){
  const {locale}=useUorquiPreferences(),pt=locale==='pt-BR';
  const [preferences,setPreferences]=useState<PushSettings>(initial);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setError('');
    void fetch('/api/v1/notifications/preferences',{credentials:'same-origin',cache:'no-store',signal:controller.signal})
      .then(async response=>{if(!response.ok)throw Error('UNAVAILABLE');return response.json() as Promise<{preferences:PushSettings}>;})
      .then(body=>{if(!controller.signal.aborted)setPreferences(body.preferences);})
      .catch(()=>{if(!controller.signal.aborted)setError(pt?'Não foi possível carregar os ajustes.':'Could not load settings.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[accountId,pt]);
  const save=async(next:PushSettings)=>{
    if(saving||loading)return;
    setSaving(true);setError('');
    try{
      const response=await fetch('/api/v1/notifications/preferences',{
        method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(next)});
      if(!response.ok)throw Error('UNAVAILABLE');
      const body=await response.json() as {preferences:PushSettings};
      setPreferences(body.preferences);
    }catch{setError(pt?'Não foi possível salvar. Tente novamente.':'Could not save. Try again.');}
    finally{setSaving(false);}
  };
  const allOn=options.every(option=>preferences[option.key]);
  const allOff=options.every(option=>!preferences[option.key]);
  return <div className="h-full min-h-0 overflow-y-auto overscroll-contain bg-background">
    <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
      <div className="mb-5 flex items-center gap-2">
        <Button type="button" variant="ghost" size="icon" onClick={onBack}
          aria-label={pt?'Voltar às notificações':'Back to notifications'}><ArrowLeft className="size-5"/></Button>
        <div><h2 className="text-lg font-semibold">{pt?'Ajustes de notificações':'Notification settings'}</h2>
          <p className="text-xs text-muted-foreground">{pt?'Escolha quais avisos push deseja receber.':'Choose which push alerts you receive.'}</p></div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={loading||saving||allOn} onClick={()=>void save(Object.fromEntries(options.map(o=>[o.key,true])) as PushSettings)}>
          <Check className="size-4"/>{pt?'Ativar todas':'Enable all'}</Button>
        <Button size="sm" variant="outline" disabled={loading||saving||allOff} onClick={()=>void save(Object.fromEntries(options.map(o=>[o.key,false])) as PushSettings)}>
          <BellOff className="size-4"/>{pt?'Desativar todas':'Disable all'}</Button>
        {saving&&<Spinner className="size-4"/>}
      </div>
      {error&&<div role="alert" className="mb-4 rounded-xl border border-destructive/40 p-3 text-sm text-destructive">
        {error}</div>}
      {loading?<p role="status" className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
        <Spinner className="size-4"/>{pt?'Carregando ajustes…':'Loading settings…'}</p>:
      <section aria-label={pt?'Tipos de notificações push':'Push notification types'}
        className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {options.map(option=>{
          const Icon=option.icon,checked=preferences[option.key];
          return <label key={option.key} className="flex min-h-16 cursor-pointer items-center gap-3 px-4 py-3">
            <Icon aria-hidden="true" className="size-5 shrink-0 text-primary"/>
            <span className="min-w-0 flex-1 text-sm font-medium">{pt?option.pt:option.en}</span>
            <input type="checkbox" role="switch" aria-label={pt?option.pt:option.en}
              checked={checked} disabled={saving} onChange={()=>void save({...preferences,[option.key]:!checked})}
              className="peer sr-only"/>
            <span aria-hidden="true" className={'relative h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring '+(checked?'bg-primary':'bg-muted-foreground/35')}>
              <span className={'absolute top-1 size-5 rounded-full bg-white shadow transition-transform '+(checked?'translate-x-6':'translate-x-1')}/>
            </span>
          </label>;
        })}
      </section>}
      <p className="mt-3 text-xs text-muted-foreground">{pt?
        'Essas opções controlam apenas o push. As atividades continuam disponíveis na central de notificações.':
        'These options control push only. Activities remain in your notification inbox.'}</p>
      <div className="mt-6 border-t border-border pt-4">
        <div className="mb-2 flex items-center gap-2"><Bell className="size-4 text-primary"/>
          <h3 className="text-sm font-semibold">{pt?'Permissão neste dispositivo':'Permission on this device'}</h3></div>
        <PushPreferences accountId={accountId}/>
      </div>
    </div>
  </div>;
}
