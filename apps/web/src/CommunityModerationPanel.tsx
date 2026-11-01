import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Ban, Check, ChevronDown, ChevronUp, Pencil, Shield, Trash2, UserMinus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUorquiPreferences } from './UorquiPreferences';

type Role='owner'|'admin'|'moderator'|'member';
type Member={handle:string;displayName:string;role:Role;joinedAt:string};
type BanEntry={handle:string;reason:string|null;bannedAt:string};
type Channel={id:string;name:string;kind:'text'|'voice'};
type Data={members:Member[];bans:BanEntry[];myRole:Role};
const weight:Record<Role,number>={owner:4,admin:3,moderator:2,member:1};
const api=async(path:string,init?:RequestInit)=>{
  const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...init});
  if(!r.ok){const data=await r.json().catch(()=>null) as {error?:string}|null;throw Error(data?.error??'HTTP_'+r.status);}
  return r.status===204?undefined:r.json();
};

export default function CommunityModerationPanel({id,role,channels,onChanged}:{
  id:string;role:Role;channels:Channel[];onChanged:()=>Promise<void>;
}){
  const {locale}=useUorquiPreferences();const pt=locale==='pt-BR';
  const [open,setOpen]=useState(false);
  const [data,setData]=useState<Data|null>(null);
  const [busy,setBusy]=useState(false);
  const [confirm,setConfirm]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [handle,setHandle]=useState('');
  const [reason,setReason]=useState('');
  const [rename,setRename]=useState<string|null>(null);
  const [newName,setNewName]=useState('');
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
    setBusy(true);setError('');setNotice('');
    try{await call();await load();await onChanged();setNotice(success);setConfirm(null);setRename(null);setHandle('');setReason('');}
    catch(e){
      const code=e instanceof Error?e.message:'';
      setError(code==='LAST_TEXT_CHANNEL'?(pt?'É necessário manter pelo menos um canal de texto.':'At least one text channel must remain.'):
        code==='ROLE_NOT_ALLOWED'?(pt?'Seu cargo não permite essa ação.':'Your role cannot perform this action.'):
        code==='CHANNEL_EXISTS'?(pt?'Esse nome já está em uso.':'This name is already taken.'):
        (pt?'Não foi possível concluir a ação.':'Could not complete action.'));
    }finally{setBusy(false);}
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

  return <section className="space-y-3 border-t border-border pt-3">
    <button type="button" aria-expanded={open} onClick={()=>{setOpen(v=>!v);setError('');}}
      className="flex min-h-10 w-full items-center gap-2 rounded-lg p-2 text-left text-sm font-medium text-primary hover:bg-secondary">
      <Shield className="size-4"/><span className="min-w-0 flex-1">{pt?'Moderação':'Moderation'}</span>
      {open?<ChevronUp className="size-4"/>:<ChevronDown className="size-4"/>}
    </button>
    {open&&<div className="space-y-4 rounded-xl border border-border bg-card/70 p-3">
      {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
      {notice&&<p role="status" className="text-xs text-primary">{notice}</p>}
      {confirm&&<div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 p-2">
        <p className="text-xs text-muted-foreground">{pt?'Clique novamente na ação para confirmar.':'Click the action again to confirm.'}</p>
        <Button type="button" size="icon" variant="ghost" aria-label={pt?'Cancelar':'Cancel'} onClick={()=>{setConfirm(null);setNotice('');}}><X className="size-4"/></Button></div>}
      {!data?<p className="text-xs text-muted-foreground">{pt?'Carregando…':'Loading…'}</p>:<>
        <div className="space-y-2">
          <h4 className="text-xs font-semibold">{pt?'Membros':'Members'} ({data.members.length})</h4>
          {data.members.map(person=><div key={person.handle} className="space-y-2 rounded-lg border border-border/70 p-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold">{person.displayName.charAt(0).toUpperCase()}</div>
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{person.displayName}</p>
                <p className="truncate text-[11px] text-muted-foreground">@{person.handle} · {person.role}</p></div>
            </div>
            {weight[role]>weight[person.role]&&<div className="flex flex-wrap items-center gap-2">
              {opts(person).length>0&&<select aria-label={pt?'Alterar cargo de '+person.handle:'Change role of '+person.handle}
                className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-1 text-xs"
                defaultValue={person.role} disabled={busy} onChange={event=>{
                  const newRole=event.target.value;void action('role:'+person.handle,
                    ()=>api(base+'/members/'+person.handle+'/role',requestBody({role:newRole})),
                    pt?'Cargo atualizado.':'Role updated.');
                }}>
                {[...new Set([person.role,...opts(person)])].map(r=><option key={r} value={r}>{r}</option>)}
              </select>}
              <Button size="sm" variant="outline" disabled={busy} className="h-9" onClick={()=>request('kick:'+person.handle,
                ()=>api(base+'/members/'+person.handle,{method:'DELETE'}),pt?'Membro removido.':'Member removed.',
                pt?'remover @'+person.handle:'remove @'+person.handle)}>
                <UserMinus className="size-3.5"/>{pt?'Remover':'Remove'}</Button>
              <Button size="sm" variant="outline" disabled={busy} className="h-9" onClick={()=>request('ban:'+person.handle,
                ()=>api(base+'/bans',requestBody({handle:person.handle})),pt?'Membro banido.':'Member banned.',
                pt?'banir @'+person.handle:'ban @'+person.handle)}>
                <Ban className="size-3.5"/>{pt?'Banir':'Ban'}</Button>
            </div>}
          </div>)}
        </div>
        <form className="space-y-2 border-t border-border pt-3" onSubmit={event=>{
          event.preventDefault();const clean=handle.trim().replace(/^@/,'').toLowerCase();
          if(!/^[a-z][a-z0-9_]{2,31}$/.test(clean))return;
          request('ban:new:'+clean,()=>api(base+'/bans',requestBody({handle:clean,reason})),
            pt?'Conta banida.':'Account banned.',pt?'banir @'+clean:'ban @'+clean);
        }}>
          <p className="text-xs font-semibold">{pt?'Banir por @usuário':'Ban by @username'}</p>
          <Input value={handle} onChange={e=>setHandle(e.target.value)} maxLength={40} className="h-9 text-base" placeholder="@usuario"/>
          <Input value={reason} onChange={e=>setReason(e.target.value)} maxLength={300} className="h-9 text-base"
            placeholder={pt?'Motivo (opcional)':'Reason (optional)'}/>
          <Button type="submit" size="sm" variant="outline" disabled={busy||!handle.trim()}><Ban className="size-4"/>{pt?'Banir conta':'Ban account'}</Button>
        </form>
        {!!data.bans.length&&<div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-semibold">{pt?'Contas banidas':'Banned accounts'}</p>
          {data.bans.map(person=><div key={person.handle} className="flex min-w-0 items-center gap-2 rounded-lg border border-border/70 px-2 py-2">
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">@{person.handle}</p>
              {person.reason&&<p className="break-words text-[11px] text-muted-foreground">{person.reason}</p>}</div>
            {canAdmin&&<Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>request('unban:'+person.handle,
              ()=>api(base+'/bans/'+person.handle,{method:'DELETE'}),pt?'Banimento retirado.':'Ban removed.',
              pt?'desbanir @'+person.handle:'unban @'+person.handle)}>
              <Check className="size-3.5"/>{pt?'Desbanir':'Unban'}</Button>}
          </div>)}
        </div>}
        {canAdmin&&<div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-semibold">{pt?'Gerenciar canais':'Manage channels'}</p>
          {channels.map(ch=><div key={ch.id} className="space-y-2 rounded-lg border border-border/70 p-2">
            <p className="truncate text-xs font-medium">{ch.kind==='text'?'#':'◉'} {ch.name}</p>
            {rename===ch.id?<form className="flex gap-1" onSubmit={event=>{
              event.preventDefault();
              void action('channel:name:'+ch.id,()=>api(base+'/channels/'+ch.id,{
                method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:newName.trim()})
              }),pt?'Canal renomeado.':'Channel renamed.');
            }}>
              <Input value={newName} onChange={e=>setNewName(e.target.value)} maxLength={64} className="h-9 min-w-0 text-base"/>
              <Button size="icon" type="submit" disabled={busy||newName.trim().length<2}><Check className="size-4"/></Button>
              <Button size="icon" variant="ghost" type="button" onClick={()=>setRename(null)}><X className="size-4"/></Button>
            </form>:<div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-9" onClick={()=>{setRename(ch.id);setNewName(ch.name);}}>
                <Pencil className="size-3.5"/>{pt?'Renomear':'Rename'}</Button>
              <Button size="sm" variant="outline" className="h-9" disabled={busy} onClick={()=>request('channel:delete:'+ch.id,
                ()=>api(base+'/channels/'+ch.id,{method:'DELETE'}),pt?'Canal excluído.':'Channel deleted.',
                pt?'excluir canal '+ch.name:'delete channel '+ch.name)}>
                <Trash2 className="size-3.5"/>{pt?'Excluir':'Delete'}</Button>
            </div>}
          </div>)}
        </div>}
      </>}
    </div>}
  </section>;
}
