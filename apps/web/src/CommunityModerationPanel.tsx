import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Dialog, Tabs } from 'radix-ui';
import { Ban, Camera, Check, Hash, LockKeyhole, Settings, Shield, Trash2, UserMinus, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useUorquiPreferences } from './UorquiPreferences';
import { navigateToPublicProfile } from './publicProfileNavigation';

type Role='owner'|'admin'|'moderator'|'member';
type Visibility='public'|'approval'|'private';
type ModerationTab='members'|'bans'|'channels'|'settings'|'danger';
type Member={handle:string;displayName:string;role:Role;joinedAt:string;restrictedChannelIds?:string[]};
type BanEntry={handle:string;reason:string|null;bannedAt:string};
type Channel={id:string;name:string;kind:'text'|'voice'|'meeting';hasPassword?:boolean;accessMode?:'open'|'restricted'};
type Data={members:Member[];bans:BanEntry[];myRole:Role};
const weight:Record<Role,number>={owner:4,admin:3,moderator:2,member:1};
const api=async(path:string,init?:RequestInit)=>{
  const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...init});
  if(!r.ok){const data=await r.json().catch(()=>null) as {error?:string}|null;throw Error(data?.error??'HTTP_'+r.status);}
  return r.status===204?undefined:r.json();
};

export default function CommunityModerationPanel({id,role,channels,name,description,visibility,avatarUrl,onChanged,onDeleted}:{
  id:string;role:Role;channels:Channel[];name:string;description:string|null;visibility:Visibility;avatarUrl:string|null;
  onChanged:()=>Promise<void>;onDeleted:()=>Promise<void>;
}){
  const {locale}=useUorquiPreferences();const pt=locale==='pt-BR';
  const [open,setOpen]=useState(false);
  const [tab,setTab]=useState<ModerationTab>('members');
  const [data,setData]=useState<Data|null>(null);
  const [busyKey,setBusyKey]=useState<string|null>(null);
  const busy=busyKey!==null;
  const [confirm,setConfirm]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [handle,setHandle]=useState('');
  const [reason,setReason]=useState('');
  const [groupName,setGroupName]=useState(name);
  const [groupDescription,setGroupDescription]=useState(description??'');
  const [groupVisibility,setGroupVisibility]=useState<Visibility>(visibility);
  const [photo,setPhoto]=useState(avatarUrl);
  const [confirmDeleteText,setConfirmDeleteText]=useState('');
  const [channelDrafts,setChannelDrafts]=useState<Record<string,{name:string;accessMode:'open'|'restricted';password:string}>>({});
  useEffect(()=>{setGroupName(name);setGroupDescription(description??'');setGroupVisibility(visibility);setPhoto(avatarUrl);},[name,description,visibility,avatarUrl]);
  useEffect(()=>{
    setChannelDrafts(Object.fromEntries(channels.map(channel=>[channel.id,{
      name:channel.name,accessMode:channel.accessMode??'open',password:''
    }])));
  },[channels]);
  const base='/api/v1/communities/'+id;
  const canAdmin=weight[role]>=3;
  const load=useCallback(async()=>{
    const result=await api(base+'/moderation') as Data;
    setData(result);
  },[base]);
  useEffect(()=>{
    if(!open){setData(null);return;}
    void load().catch(()=>setError(pt?'Não foi possível carregar a moderação.':'Could not load moderation.'));
  },[load,open,pt]);
  async function action(key:string,call:()=>Promise<unknown>,success:string){
    if(busy)return;
    setBusyKey(key);setError('');setNotice('');
    try{await call();await load();await onChanged();setNotice(success);setConfirm(null);setHandle('');setReason('');}
    catch(e){
      const code=e instanceof Error?e.message:'';
      setError(code==='LAST_TEXT_CHANNEL'?(pt?'É necessário manter pelo menos um canal de texto.':'At least one text channel must remain.'):
        code==='ROLE_NOT_ALLOWED'?(pt?'Seu cargo não permite essa ação.':'Your role cannot perform this action.'):
        code==='CHANNEL_EXISTS'?(pt?'Esse nome já está em uso.':'This name is already taken.'):
        (pt?'Não foi possível concluir a ação.':'Could not complete action.'));
    }finally{setBusyKey(null);}
  }
  function request(key:string,run:()=>Promise<unknown>,success:string,label:string){
    if(confirm!==key){
      setConfirm(key);setNotice(pt?'Confirme: '+label:'Confirm: '+label);return;
    }
    void action(key,run,success);
  }
  const opts=(person:Member):Role[]=>{
    if(weight[role]<=weight[person.role]||person.role==='owner')return [];
    return (role==='owner'?['admin','moderator','member']:role==='admin'?['moderator','member']:[]) as Role[];
  };
  const requestBody=(v:unknown)=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)} as RequestInit);
  const bodyFor=(method:'PATCH'|'PUT',v:unknown)=>({
    method,headers:{'Content-Type':'application/json'},body:JSON.stringify(v)
  } as RequestInit);
  function updateChannelDraft(channelId:string,change:Partial<{name:string;accessMode:'open'|'restricted';password:string}>){
    setChannelDrafts(old=>({...old,[channelId]:{
      name:old[channelId]?.name??channels.find(ch=>ch.id===channelId)?.name??'',
      accessMode:old[channelId]?.accessMode??'open',
      password:old[channelId]?.password??'',
      ...change
    }}));
  }

  return <Dialog.Root open={open} onOpenChange={next=>{
    if(busy)return;
    setOpen(next);if(next)setTab('members');setError('');setNotice('');setConfirm(null);
  }}>
    <Dialog.Trigger asChild>
      <button type="button"
        className="flex min-h-10 w-full items-center gap-2 rounded-lg p-2 text-left text-sm font-medium text-primary hover:bg-secondary">
        <Shield className="size-4"/><span className="min-w-0 flex-1">{pt?'Moderação':'Moderation'}</span>
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[290] bg-black/70 backdrop-blur-[2px]"/>
      <Dialog.Content aria-describedby={undefined}
        onEscapeKeyDown={event=>{if(busy)event.preventDefault();}}
        onPointerDownOutside={event=>{if(busy)event.preventDefault();}}
        className="fixed inset-0 z-[300] flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-card text-card-foreground shadow-2xl outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(90dvh,850px)] sm:w-[min(92vw,850px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-border">
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 sm:pt-4">
          <Shield className="size-5 shrink-0 text-primary" aria-hidden="true"/>
          <div className="min-w-0 flex-1">
            <Dialog.Title className="truncate text-base font-semibold">{pt?'Moderação da comunidade':'Community moderation'}</Dialog.Title>
            <p className="truncate text-xs text-muted-foreground">{name}</p>
          </div>
          <Dialog.Close asChild>
            <Button type="button" variant="ghost" size="icon" disabled={busy}
              aria-label={pt?'Fechar moderação':'Close moderation'}>
              <X className="size-5"/>
            </Button>
          </Dialog.Close>
        </header>
        <Tabs.Root value={tab} onValueChange={value=>{
          if(busy)return;
          setTab(value as ModerationTab);setConfirm(null);setNotice('');setError('');
        }} className="flex min-h-0 flex-1 flex-col">
          <Tabs.List aria-label={pt?'Seções da moderação':'Moderation sections'}
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-card px-3 py-2 sm:px-5">
            <Tabs.Trigger value="members" disabled={busy} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-primary/10 data-[state=active]:text-primary disabled:opacity-50">
              <Users className="size-4"/>{pt?'Membros':'Members'}{data&&<span className="text-xs opacity-70">({data.members.length})</span>}
            </Tabs.Trigger>
            <Tabs.Trigger value="bans" disabled={busy} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-primary/10 data-[state=active]:text-primary disabled:opacity-50">
              <Ban className="size-4"/>{pt?'Banimentos':'Bans'}
            </Tabs.Trigger>
            {canAdmin&&<Tabs.Trigger value="channels" disabled={busy} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-primary/10 data-[state=active]:text-primary disabled:opacity-50">
              <Hash className="size-4"/>{pt?'Canais':'Channels'}
            </Tabs.Trigger>}
            {canAdmin&&<Tabs.Trigger value="settings" disabled={busy} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-primary/10 data-[state=active]:text-primary disabled:opacity-50">
              <Settings className="size-4"/>{pt?'Configurações':'Settings'}
            </Tabs.Trigger>}
            {role==='owner'&&<Tabs.Trigger value="danger" disabled={busy} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-destructive/85 outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-destructive/10 data-[state=active]:text-destructive disabled:opacity-50">
              <Trash2 className="size-4"/>{pt?'Exclusão':'Delete'}
            </Tabs.Trigger>}
          </Tabs.List>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
      {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
      {notice&&<p role="status" className="text-xs text-primary">{notice}</p>}
      {confirm&&<div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 p-2">
        <p className="text-xs text-muted-foreground">{pt?'Clique novamente na ação para confirmar.':'Click the action again to confirm.'}</p>
        <Button type="button" size="icon" variant="ghost" aria-label={pt?'Cancelar':'Cancel'} onClick={()=>{setConfirm(null);setNotice('');}}><X className="size-4"/></Button></div>}
      {canAdmin&&<Tabs.Content value="settings" className="space-y-3 outline-none">
        <h4 className="text-xs font-semibold">{pt?'Configurações da comunidade':'Community settings'}</h4>
        <div className="flex items-center gap-3">
          {photo?<div className="size-16 shrink-0 overflow-hidden rounded-2xl"><img src={photo} alt="" className="block size-full object-cover"/></div>:
            <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-primary/10 text-lg font-semibold text-primary">{name[0]?.toUpperCase()}</div>}
          <div className="min-w-0 flex-1 space-y-2">
            <label className="relative inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-xs hover:bg-secondary">
              {busyKey==='photo'?<Spinner className="size-4"/>:<Camera className="size-4"/>}
              {pt?'Alterar foto':'Change photo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={event=>{
                const file=event.target.files?.[0];event.target.value='';
                if(!file)return;
                if(file.size>10*1024*1024){setError(pt?'Imagem limitada a 10 MB.':'Maximum image size is 10 MB.');return;}
                void action('photo',async()=>{
                  const res=await fetch('/api/media/community/'+id,{method:'POST',body:file,headers:{'Content-Type':file.type}});
                  if(!res.ok)throw Error('PHOTO_UPLOAD');
                  const data=await res.json() as {url:string};setPhoto(data.url);
                },pt?'Foto atualizada.':'Photo updated.');
              }}/>
            </label>
            {photo&&<Button size="sm" variant="ghost" disabled={busy} loading={busyKey==='photo-remove'}
              onClick={()=>void action('photo-remove',async()=>{
                await api('/api/media/community/'+id,{method:'DELETE'});setPhoto(null);
              },pt?'Foto removida.':'Photo removed.')}>{pt?'Remover foto':'Remove photo'}</Button>}
          </div>
        </div>
        <form className="space-y-2" onSubmit={event=>{
          event.preventDefault();
          void action('settings',()=>api(base,{
            method:'PATCH',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({name:groupName.trim(),description:groupDescription.trim(),visibility:groupVisibility})
          }),pt?'Comunidade atualizada.':'Community updated.');
        }}>
          <label className="block text-xs">{pt?'Nome da comunidade':'Community name'}
            <Input className="mt-1 text-base" maxLength={120} minLength={2} required value={groupName} onChange={e=>setGroupName(e.target.value)}/></label>
          <label className="block text-xs">{pt?'Descrição':'Description'}
            <textarea className="mt-1 min-h-20 w-full rounded-lg border border-input bg-background p-2 text-base" maxLength={500}
              value={groupDescription} onChange={e=>setGroupDescription(e.target.value)}/></label>
          <label className="block text-xs">{pt?'Privacidade da comunidade':'Community privacy'}
            <select value={groupVisibility} disabled={busy} onChange={e=>setGroupVisibility(e.target.value as Visibility)}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-2 text-base">
              <option value="public">{pt?'Pública — entrada livre':'Public — open join'}</option>
              <option value="approval">{pt?'Por aprovação':'Approval required'}</option>
              <option value="private">{pt?'Privada — somente convite':'Private — invitation only'}</option>
            </select></label>
          {groupVisibility!==visibility&&<p className="text-xs text-muted-foreground">{pt?
            'Os membros atuais permanecem. Solicitações de entrada pendentes serão canceladas ao mudar para pública ou privada.':
            'Existing members stay. Pending join requests will be cleared when switching to public or private.'}</p>}
          <Button type="submit" size="sm" loading={busyKey==='settings'} disabled={busy||groupName.trim().length<2}>
            <Check className="size-4"/>{pt?'Salvar alterações':'Save changes'}</Button>
        </form>
      </Tabs.Content>}
      <Tabs.Content value="members" className="space-y-3 outline-none">
        {!data?<SkeletonRows rows={4}/>:<div className="space-y-2">
          <h4 className="text-xs font-semibold">{pt?'Membros':'Members'} ({data.members.length})</h4>
          {data.members.map(person=><div key={person.handle} className="space-y-2 rounded-lg border border-border/70 p-2">
            <a href={'/@'+person.handle}
              onClick={event=>{
                if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
                navigateToPublicProfile(event,person.handle);
                setOpen(false);
              }}
              aria-label={pt?'Ver perfil de '+person.displayName:'View profile of '+person.displayName}
              className="flex min-h-12 min-w-0 items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring">
              <div className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold">{person.displayName.charAt(0).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{person.displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">@{person.handle} · {person.role}</span>
              </div>
              <span className="shrink-0 text-[11px] font-medium text-primary">{pt?'Ver perfil':'View profile'}</span>
            </a>
            {canAdmin&&role!==undefined&& !(['owner','admin'] as Role[]).includes(person.role)&&
              channels.some(ch=>ch.accessMode==='restricted')&&<details className="rounded-lg border border-border/70 p-2">
              <summary className="cursor-pointer text-xs font-medium text-primary">
                {pt?'Acesso aos canais fechados':'Closed channel access'}
                {' · '}{channels.filter(ch=>ch.accessMode==='restricted'&&(person.restrictedChannelIds??[]).includes(ch.id)).length}
                {' / '}{channels.filter(ch=>ch.accessMode==='restricted').length}
              </summary>
              <p className="my-2 text-xs text-muted-foreground">
                {pt?'Selecione os canais que este membro pode visualizar e acessar.':'Select the channels this member can see and access.'}
              </p>
              <div className="space-y-2">
                {channels.filter(ch=>ch.accessMode==='restricted').map(ch=><label key={ch.id}
                  className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-1 text-xs hover:bg-secondary">
                  <input type="checkbox" className="size-4 shrink-0 accent-primary"
                    checked={(person.restrictedChannelIds??[]).includes(ch.id)} disabled={busy}
                    onChange={event=>void action('channel:access:'+person.handle+':'+ch.id,
                      ()=>api(base+'/members/'+encodeURIComponent(person.handle)+'/channels/'+ch.id+'/access',{
                        method:'PUT',headers:{'Content-Type':'application/json'},
                        body:JSON.stringify({allowed:event.target.checked})
                      }),pt?'Permissão atualizada.':'Access updated.')}/>
                  <span className="min-w-0 flex-1 truncate">
                    {ch.kind==='text'?'#':ch.kind==='meeting'?'▣':'◉'} {ch.name}
                  </span>
                  {busyKey==='channel:access:'+person.handle+':'+ch.id&&<Spinner className="size-4"/>}
                </label>)}
              </div>
            </details>}
            {weight[role]>weight[person.role]&&<div className="flex flex-wrap items-center gap-2">
              {opts(person).length>0&&<select aria-label={pt?'Alterar cargo de '+person.handle:'Change role of '+person.handle}
                className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-1 text-xs"
                key={person.role} defaultValue={person.role} disabled={busy} onChange={event=>{
                  const newRole=event.target.value;void action('role:'+person.handle,
                    ()=>api(base+'/members/'+person.handle+'/role',requestBody({role:newRole})),
                    pt?'Cargo atualizado.':'Role updated.');
                }}>
                {[...new Set([person.role,...opts(person)])].map(r=><option key={r} value={r}>{r}</option>)}
              </select>}
              {busyKey==='role:'+person.handle&&<Spinner className="size-4"/>}
              <Button size="sm" variant="outline" disabled={busy} loading={busyKey==='kick:'+person.handle} className="h-9" onClick={()=>request('kick:'+person.handle,
                ()=>api(base+'/members/'+person.handle,{method:'DELETE'}),pt?'Membro removido.':'Member removed.',
                pt?'remover @'+person.handle:'remove @'+person.handle)}>
                <UserMinus className="size-3.5"/>{pt?'Remover':'Remove'}</Button>
              <Button size="sm" variant="outline" disabled={busy} loading={busyKey==='ban:'+person.handle} className="h-9" onClick={()=>request('ban:'+person.handle,
                ()=>api(base+'/bans',requestBody({handle:person.handle})),pt?'Membro banido.':'Member banned.',
                pt?'banir @'+person.handle:'ban @'+person.handle)}>
                <Ban className="size-3.5"/>{pt?'Banir':'Ban'}</Button>
            </div>}
          </div>)}
        </div>}
      </Tabs.Content>
      <Tabs.Content value="bans" className="space-y-4 outline-none">
        {!data?<SkeletonRows rows={4}/>:<>
        <form className="space-y-2" onSubmit={event=>{
          event.preventDefault();const clean=handle.trim().replace(/^@/,'').toLowerCase();
          if(!/^[a-z][a-z0-9_]{2,31}$/.test(clean))return;
          request('ban:new:'+clean,()=>api(base+'/bans',requestBody({handle:clean,reason})),
            pt?'Conta banida.':'Account banned.',pt?'banir @'+clean:'ban @'+clean);
        }}>
          <p className="text-xs font-semibold">{pt?'Banir por @usuário':'Ban by @username'}</p>
          <Input value={handle} onChange={e=>setHandle(e.target.value)} maxLength={40} className="h-9 text-base" placeholder="@usuario"/>
          <Input value={reason} onChange={e=>setReason(e.target.value)} maxLength={300} className="h-9 text-base"
            placeholder={pt?'Motivo (opcional)':'Reason (optional)'}/>
          <Button type="submit" size="sm" variant="outline" loading={busyKey?.startsWith('ban:new:')??false} disabled={busy||!handle.trim()}><Ban className="size-4"/>{pt?'Banir conta':'Ban account'}</Button>
        </form>
        {!!data.bans.length?<div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-semibold">{pt?'Contas banidas':'Banned accounts'}</p>
          {data.bans.map(person=><div key={person.handle} className="flex min-w-0 items-center gap-2 rounded-lg border border-border/70 px-2 py-2">
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">@{person.handle}</p>
              {person.reason&&<p className="break-words text-[11px] text-muted-foreground">{person.reason}</p>}</div>
            {canAdmin&&<Button type="button" size="sm" variant="outline" disabled={busy} loading={busyKey==='unban:'+person.handle} onClick={()=>request('unban:'+person.handle,
              ()=>api(base+'/bans/'+person.handle,{method:'DELETE'}),pt?'Banimento retirado.':'Ban removed.',
              pt?'desbanir @'+person.handle:'unban @'+person.handle)}>
              <Check className="size-3.5"/>{pt?'Desbanir':'Unban'}</Button>}
          </div>)}
        </div>:<p className="rounded-lg border border-border/70 p-4 text-sm text-muted-foreground">{pt?'Nenhuma conta banida nesta comunidade.':'No accounts are banned in this community.'}</p>}
        </>}
      </Tabs.Content>
      {canAdmin&&<Tabs.Content value="channels" className="space-y-3 outline-none">
          <p className="text-xs font-semibold">{pt?'Gerenciar canais':'Manage channels'}</p>
          <p className="text-xs text-muted-foreground">{pt?
            'Nome, acesso e senha são alterações independentes. Somente administradores podem editar.':
            'Name, access and password can be changed separately by administrators.'}</p>
          {channels.map(ch=>{
            const draft=channelDrafts[ch.id]??{name:ch.name,accessMode:ch.accessMode??'open',password:''};
            const endpoint=base+'/channels/'+ch.id;
            const changedName=draft.name.trim();
            return <section key={ch.id} className="space-y-3 rounded-lg border border-border/70 p-3">
              <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                {ch.kind==='text'?'#':ch.kind==='meeting'?'▣':'◉'} {ch.name}
                {ch.hasPassword&&<LockKeyhole className="size-3.5 text-primary"/>}
                {ch.accessMode==='restricted'&&
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{pt?'Fechado':'Restricted'}</span>}
              </p>
              <form className="flex flex-wrap items-end gap-2" onSubmit={event=>{
                event.preventDefault();
                if(changedName.length<2||changedName.length>64||changedName===ch.name)return;
                void action('channel:name:'+ch.id,()=>api(endpoint,bodyFor('PATCH',{name:changedName})),
                  pt?'Nome do canal atualizado.':'Channel renamed.');
              }}>
                <label className="min-w-[160px] flex-1 text-xs">{pt?'Nome do canal':'Channel name'}
                  <Input value={draft.name} onChange={event=>updateChannelDraft(ch.id,{name:event.target.value})}
                    minLength={2} maxLength={64} required disabled={busy} className="mt-1 h-9 text-base"/>
                </label>
                <Button type="submit" size="sm" variant="outline" className="h-9"
                  disabled={busy||changedName.length<2||changedName===ch.name}
                  loading={busyKey==='channel:name:'+ch.id}>
                  <Check className="size-3.5"/>{pt?'Salvar nome':'Save name'}
                </Button>
              </form>
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-[170px] flex-1 text-xs">{pt?'Acesso ao canal':'Channel access'}
                  <select value={draft.accessMode} disabled={busy}
                    onChange={event=>updateChannelDraft(ch.id,{accessMode:event.target.value as 'open'|'restricted'})}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-base">
                    <option value="open">{pt?'Aberto aos membros':'Open to members'}</option>
                    <option value="restricted">{pt?'Restrito — por permissão':'Restricted — granted members'}</option>
                  </select>
                </label>
                <Button type="button" size="sm" variant="outline" className="h-9"
                  loading={busyKey==='channel:access:'+ch.id}
                  disabled={busy||draft.accessMode===(ch.accessMode??'open')}
                  onClick={()=>void action('channel:access:'+ch.id,
                    ()=>api(endpoint+'/access',bodyFor('PUT',{accessMode:draft.accessMode})),
                    draft.accessMode==='restricted'?(pt?'Acesso restrito ativado.':'Restricted access enabled.'):
                      (pt?'Canal aberto para membros.':'Channel opened to members.'))}>
                  <Check className="size-3.5"/>{pt?'Salvar acesso':'Save access'}
                </Button>
              </div>
              {draft.accessMode==='restricted'&&<button type="button" disabled={busy}
                className="text-left text-xs text-primary underline underline-offset-2"
                onClick={()=>{setTab('members');setConfirm(null);}}>
                {pt?'Gerenciar permissões dos membros':'Manage member access permissions'}
              </button>}
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-[170px] flex-1 text-xs">{ch.hasPassword?(pt?'Substituir senha':'Replace password'):(pt?'Proteger com senha':'Set password')}
                  <Input type="password" autoComplete="new-password" value={draft.password} minLength={8} maxLength={72}
                    disabled={busy} onChange={event=>updateChannelDraft(ch.id,{password:event.target.value})}
                    placeholder={pt?'Mínimo de 8 caracteres':'At least 8 characters'} className="mt-1 h-9 text-base"/>
                </label>
                <Button type="button" size="sm" variant="outline" className="h-9"
                  disabled={busy||draft.password.length<8||draft.password.length>72}
                  loading={busyKey==='channel:password:'+ch.id}
                  onClick={()=>void action('channel:password:'+ch.id,
                    ()=>api(endpoint+'/password',bodyFor('PUT',{password:draft.password})),
                    pt?'Senha do canal atualizada.':'Channel password updated.')}>
                  <LockKeyhole className="size-3.5"/>{pt?'Salvar senha':'Save password'}
                </Button>
                {ch.hasPassword&&<Button type="button" size="sm" variant="outline" className="h-9"
                  disabled={busy} loading={busyKey==='channel:password-remove:'+ch.id}
                  onClick={()=>request('channel:password-remove:'+ch.id,
                    ()=>api(endpoint+'/password',bodyFor('PUT',{password:null})),
                    pt?'Senha removida.':'Password removed.',
                    pt?'remover proteção por senha':'remove password protection')}>
                  <X className="size-3.5"/>{pt?'Remover senha':'Remove password'}
                </Button>}
              </div>
              <div className="flex justify-end border-t border-border/70 pt-3">
                <Button size="sm" variant="outline" className="h-9 text-destructive" disabled={busy}
                  loading={busyKey==='channel:delete:'+ch.id}
                  onClick={()=>request('channel:delete:'+ch.id,
                    ()=>api(endpoint,{method:'DELETE'}),pt?'Canal excluído.':'Channel deleted.',
                    pt?'excluir canal '+ch.name:'delete channel '+ch.name)}>
                  <Trash2 className="size-3.5"/>{pt?'Excluir canal':'Delete channel'}
                </Button>
              </div>
            </section>;
          })}
        </Tabs.Content>}
        {role==='owner'&&<Tabs.Content value="danger" className="space-y-3 outline-none">
          <h4 className="text-xs font-semibold text-destructive">{pt?'Excluir comunidade permanentemente':'Permanently delete community'}</h4>
          <p className="text-xs text-muted-foreground">{pt?'Esta ação exclui canais, mensagens e membros. Não pode ser desfeita.':'This deletes channels, messages and memberships. It cannot be undone.'}</p>
          <label className="block text-xs">{pt?'Digite o nome exato para confirmar':'Type the exact community name to confirm'}
            <Input value={confirmDeleteText} className="mt-1 text-base" onChange={e=>setConfirmDeleteText(e.target.value)}/></label>
          <Button type="button" variant="destructive" size="sm" disabled={busy||confirmDeleteText!==name}
            loading={busyKey==='delete-community'} onClick={()=>{
              if(confirm!=='delete-community'){
                setConfirm('delete-community');return;
              }
              if(busy)return;
              setBusyKey('delete-community');setError('');
              void api('/api/media/community/'+id+'/delete',{method:'DELETE'}).then(()=>onDeleted())
                .catch(()=>setError(pt?'Não foi possível excluir a comunidade.':'Could not delete community.'))
                .finally(()=>setBusyKey(null));
            }}><Trash2 className="size-4"/>
            {confirm==='delete-community'?(pt?'Confirmar exclusão definitiva':'Confirm permanent deletion'):(pt?'Excluir comunidade':'Delete community')}
          </Button>
        </Tabs.Content>}
          </div>
        </Tabs.Root>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
