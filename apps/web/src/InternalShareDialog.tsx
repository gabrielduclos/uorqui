import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, MessageCircle, Search, Share2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from './UserProfiles';
import { useUorquiPreferences } from './UorquiPreferences';

type Peer={handle:string;displayName:string;avatarUrl:string|null};
type Thread={id:string;peerHandle:string;peerName:string;peerAvatarUrl:string|null;canMessage:boolean};
export type InternalShareSource=
  |{kind:'post';postId:string;video:boolean}
  |{kind:'message';messageId:string;conversationId:string;body:string;
      attachment?:{id:string;name:string;type:string;size:number}|null};
type Recipient=Peer & {conversationId?:string;canMessage:boolean};

function handleError(pt:boolean,status:number){
  if(status===403)return pt?'O destinatário não aceita mensagens desta conta.':'This recipient cannot receive your messages.';
  if(status===404)return pt?'Conteúdo ou contato indisponível.':'Content or recipient unavailable.';
  return pt?'Não foi possível compartilhar. Tente novamente.':'Could not share. Please retry.';
}
async function request(path:string,options?:RequestInit){
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});
  if(!response.ok)throw Object.assign(new Error('SHARE_FAILED'),{status:response.status});
  return response;
}
const json=(data:unknown):RequestInit=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
const postUrl=(postId:string)=>window.location.origin+'/?post='+postId;

/** Uses a per-destination authorized upload for private media; R2 files are never
 * shared by copying a source-conversation URL into another conversation. */
async function sendToRecipient(source:InternalShareSource,targetId:string,clientId:string){
  if(source.kind==='post'){
    await request('/api/v1/dm/conversations/'+targetId+'/messages',
      json({body:postUrl(source.postId),clientId}));
  }else if(source.attachment){
    const media='/media/dm/'+source.conversationId+'/'+source.attachment.id;
    const original=await request(media);
    const blob=await original.blob();
    if(blob.size!==source.attachment.size||blob.size>50*1024*1024)
      throw new Error('INVALID_MEDIA');
    const upload=await request('/api/media/dm/'+targetId,{
      method:'POST',
      headers:{
        'Content-Type':source.attachment.type,
        'x-uorqui-client-id':clientId,
        'x-uorqui-filename':encodeURIComponent(source.attachment.name),
        ...(source.body?{'x-uorqui-caption':encodeURIComponent(source.body)}:{}),
      },body:blob,
    });
    if(!upload.ok)throw new Error('UPLOAD_FAILED');
  }else{
    await request('/api/v1/dm/conversations/'+source.conversationId+'/messages/'+source.messageId+'/forward',
      json({targetConversationId:targetId,clientId}));
  }
}

export function InternalShareDialog({source,onClose,onSent}:{source:InternalShareSource|null;onClose:()=>void;onSent?:(name:string)=>void}){
  const {locale}=useUorquiPreferences(),pt=locale==='pt-BR';
  const [threads,setThreads]=useState<Thread[]>([]);
  const [friends,setFriends]=useState<Peer[]>([]);
  const [search,setSearch]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [completed,setCompleted]=useState<string[]>([]);
  const [outboundBusy,setOutboundBusy]=useState(false);
  const [clientIds]=useState(()=>new Map<string,string>());
  useEffect(()=>{
    if(!source)return;
    let mounted=true;
    setLoading(true);setError('');setCompleted([]);setSearch('');clientIds.clear();
    void Promise.all([
      request('/api/v1/dm/conversations').then(r=>r.json() as Promise<{conversations:Thread[]}>),
      request('/api/v1/friends').then(r=>r.json() as Promise<{friends:Peer[]}>),
    ]).then(([a,b])=>{if(mounted){setThreads(a.conversations);setFriends(b.friends);}})
      .catch(()=>{if(mounted)setError(pt?'Não foi possível carregar os contatos.':'Could not load contacts.');})
      .finally(()=>{if(mounted)setLoading(false);});
    return ()=>{mounted=false;};
  },[source?.kind,source?.kind==='post'?source.postId:source?.messageId,pt]);
  useEffect(()=>{
    if(!source)return;
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy){event.preventDefault();onClose();}};
    window.addEventListener('keydown',escape);
    return ()=>window.removeEventListener('keydown',escape);
  },[source,onClose,busy]);
  if(!source||typeof document==='undefined')return null;
  const destinations=new Map<string,Recipient>();
  for(const t of threads){
    if(source.kind==='message'&&t.id===source.conversationId)continue;
    destinations.set(t.peerHandle,{handle:t.peerHandle,displayName:t.peerName,
      avatarUrl:t.peerAvatarUrl,conversationId:t.id,canMessage:t.canMessage});
  }
  for(const friend of friends){
    if(!destinations.has(friend.handle))destinations.set(friend.handle,{...friend,canMessage:true});
  }
  const recipients=[...destinations.values()].filter(p=>(p.handle+' '+p.displayName).toLocaleLowerCase(locale).includes(search.toLocaleLowerCase(locale)))
    .sort((a,b)=>a.displayName.localeCompare(b.displayName,locale));
  async function select(person:Recipient){
    if(busy||!person.canMessage||completed.includes(person.handle))return;
    setBusy(person.handle);setError('');
    try{
      let targetId=person.conversationId;
      if(!targetId){
        const created=await request('/api/v1/dm/conversations',json({handle:person.handle}));
        targetId=(await created.json() as {id:string}).id;
      }
      let id=clientIds.get(person.handle);
      if(!id){id=crypto.randomUUID();clientIds.set(person.handle,id);}
      await sendToRecipient(source!,targetId,id);
      setCompleted(old=>[...old,person.handle]);
      onSent?.(person.displayName);
      window.dispatchEvent(new Event('uorqui:shared-to-chat'));
    }catch(e){
      const status=(e as {status?:number}).status??0;
      setError(handleError(pt,status));
    }finally{setBusy('');}
  }
  async function external(){
    if(source?.kind!=='post')return;
    setOutboundBusy(true);setError('');
    const url=postUrl(source.postId);
    try{
      if(navigator.share)await navigator.share({url});
      else{await navigator.clipboard.writeText(url);}
    }catch(e){
      if((e as {name?:string}).name!=='AbortError')
        setError(pt?'Não foi possível compartilhar o link.':'Could not share link.');
    }finally{setOutboundBusy(false);}
  }
  async function copy(){
    if(source?.kind!=='post')return;
    setOutboundBusy(true);setError('');
    try{await navigator.clipboard.writeText(postUrl(source.postId));}
    catch{setError(pt?'Não foi possível copiar o link.':'Could not copy link.');}
    finally{setOutboundBusy(false);}
  }
  return createPortal(<div className="fixed inset-0 z-[170] flex items-end justify-center bg-black/60 p-0 backdrop-blur-[3px] sm:items-center sm:p-4"
    onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
    <section role="dialog" aria-modal="true" aria-label={pt?'Compartilhar no Uorqui':'Share on Uorqui'}
      className="flex max-h-[min(85dvh,680px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-border bg-card text-foreground shadow-2xl sm:rounded-2xl">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0"><h2 className="font-semibold">{pt?'Compartilhar':'Share'}</h2>
          <p className="text-xs text-muted-foreground">{source.kind==='post'
            ?(source.video?(pt?'Vídeo do feed':'Feed video'):(pt?'Publicação do feed':'Feed post'))
            :(pt?'Mensagem ou mídia do chat':'Chat message or media')}</p></div>
        <button type="button" disabled={!!busy} aria-label={pt?'Fechar':'Close'} onClick={onClose}
          className="grid size-10 shrink-0 place-items-center rounded-lg hover:bg-muted"><X className="size-5"/></button>
      </header>
      {source.kind==='post'&&<div className="grid grid-cols-2 gap-2 border-b border-border p-3">
        <Button variant="outline" disabled={outboundBusy} onClick={()=>void external()}><Share2 className="size-4"/>{pt?'Outros apps':'Other apps'}</Button>
        <Button variant="outline" disabled={outboundBusy} onClick={()=>void copy()}><Copy className="size-4"/>{pt?'Copiar link':'Copy link'}</Button>
      </div>}
      <div className="px-4 pt-3"><label className="mb-2 block text-xs font-medium text-muted-foreground">{pt?'Compartilhar com contatos e conversas':'Share with contacts and chats'}</label>
        <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
          <Input value={search} onChange={e=>setSearch(e.target.value)} autoComplete="off" placeholder={pt?'Buscar contato ou conversa':'Search contacts or chats'}
            className="h-11 rounded-lg pl-9 text-base"/></div>
      </div>
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-3 pb-4" role="list">
        {loading&&<p role="status" className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Spinner className="size-4"/>{pt?'Carregando contatos…':'Loading contacts…'}</p>}
        {!loading&&!recipients.length&&<p className="p-5 text-center text-sm text-muted-foreground">{pt?'Nenhum contato ou conversa disponível.':'No contacts or chats available.'}</p>}
        {recipients.map(person=><button type="button" role="listitem" key={person.handle}
          onClick={()=>void select(person)} disabled={!!busy||!person.canMessage||completed.includes(person.handle)}
          className="flex min-h-14 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-muted disabled:opacity-65">
          <UserAvatar name={person.displayName} image={person.avatarUrl} size="sm"/>
          <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{person.displayName}</strong>
            <span className="block truncate text-xs text-muted-foreground">@{person.handle}{person.conversationId?' · '+(pt?'Conversa':'Chat'):''}</span>
          </span>
          {busy===person.handle?<Spinner className="size-4"/>:completed.includes(person.handle)?
            <Check className="size-5 text-primary"/>:person.canMessage?<MessageCircle className="size-4 text-muted-foreground"/>:null}
        </button>)}
      </div>
      {error&&<p role="alert" className="border-t border-border px-4 py-2 text-sm text-destructive">{error}</p>}
      {!!completed.length&&<p role="status" className="border-t border-border px-4 py-2 text-sm text-primary">
        {pt?completed.length+' compartilhamento(s) enviado(s).':completed.length+' share(s) sent.'}</p>}
      <footer className="shrink-0 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button type="button" variant="outline" className="w-full" disabled={!!busy} onClick={onClose}>
          {pt?'Concluir':'Done'}
        </Button>
      </footer>
    </section>
  </div>,document.body);
}
