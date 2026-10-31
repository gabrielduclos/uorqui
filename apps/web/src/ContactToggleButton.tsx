import { useCallback, useEffect, useState } from 'react';
import { Check, UserMinus, UserPlus, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUorquiPreferences } from './UorquiPreferences';

type Relation = 'none' | 'sent' | 'received' | 'friends' | 'blocked';

export function ContactToggleButton({ handle }: { handle: string }) {
  const {locale}=useUorquiPreferences();
  const pt=locale==='pt-BR';
  const [status,setStatus]=useState<Relation|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  const refresh=useCallback(async(signal?:AbortSignal)=>{
    const r=await fetch('/api/v1/friends/relationship/'+encodeURIComponent(handle),{credentials:'same-origin',cache:'no-store',signal});
    if(!r.ok)throw new Error('FAILED');
    const body=await r.json() as {status:Relation};
    if(!signal?.aborted)setStatus(body.status);
  },[handle]);
  useEffect(()=>{
    const ctrl=new AbortController();
    void refresh(ctrl.signal).catch(()=>{if(!ctrl.signal.aborted)setError(pt?'Solicitações indisponíveis.':'Friend requests unavailable.');});
    const changed=()=>void refresh(ctrl.signal).catch(()=>{});
    window.addEventListener('uorqui:friends-updated',changed);
    return ()=>{ctrl.abort();window.removeEventListener('uorqui:friends-updated',changed);};
  },[refresh,pt]);

  async function action(){
    if(status===null||status==='blocked'||busy)return;
    const path=status==='none'?'/api/v1/friends/requests'
      :status==='received'?'/api/v1/friends/requests/'+encodeURIComponent(handle)+'/accept'
      :'/api/v1/friends/'+encodeURIComponent(handle);
    const opt:RequestInit=status==='sent'||status==='friends'?{method:'DELETE'}
      :status==='none'?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle})}
      :{method:'POST'};
    setBusy(true);setError('');
    try{
      const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...opt});
      if(!r.ok)throw new Error('HTTP_'+r.status);
      await refresh();
      window.dispatchEvent(new Event('uorqui:friends-updated'));
    }catch(e){
      setError(e instanceof Error&&e.message==='HTTP_429'
        ?(pt?'Aguarde antes de enviar outra solicitação.':'Please wait before requesting again.')
        :(pt?'Não foi possível atualizar a amizade.':'Could not update friendship.'));
    }finally{setBusy(false);}
  }

  const label=status==='none'?(pt?'Adicionar amigo':'Add friend')
    :status==='sent'?(pt?'Cancelar pedido':'Cancel request')
    :status==='received'?(pt?'Aceitar pedido':'Accept request')
    :status==='friends'?(pt?'Desfazer amizade':'Unfriend')
    :status==='blocked'?(pt?'Conta bloqueada':'Blocked account'):(pt?'Carregando…':'Loading…');
  const Icon=status==='friends'?UserMinus:status==='sent'?X:status==='received'?Check:status===null?Clock:UserPlus;

  return <div className="flex flex-col gap-1">
    <Button type="button" variant="outline" disabled={status===null||status==='blocked'||busy} onClick={()=>void action()}>
      <Icon className="size-4"/>{label}
    </Button>
    {error&&<span role="alert" className="max-w-52 text-xs text-destructive">{error}</span>}
  </div>;
}
