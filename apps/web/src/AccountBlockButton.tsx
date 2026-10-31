import { useEffect, useState } from 'react';
import { ShieldBan, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clearProfileImageCache } from './profileImageCache';
import { useUorquiPreferences } from './UorquiPreferences';

export function AccountBlockButton({handle,onChanged,compact=false}:{handle:string;onChanged?:()=>void;compact?:boolean}){
  const {locale}=useUorquiPreferences();const pt=locale==='pt-BR';
  const [blocked,setBlocked]=useState<boolean|null>(null);
  const [confirm,setConfirm]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    const ctrl=new AbortController();
    void fetch('/api/v1/blocks',{credentials:'same-origin',cache:'no-store',signal:ctrl.signal})
      .then(async r=>{if(!r.ok)throw Error('BLOCKS');return r.json() as Promise<{blocked:{handle:string}[]}>;})
      .then(data=>{if(!ctrl.signal.aborted)setBlocked(data.blocked.some(x=>x.handle===handle));})
      .catch(()=>{if(!ctrl.signal.aborted)setError(pt?'Bloqueios indisponíveis.':'Blocks unavailable.');});
    return ()=>ctrl.abort();
  },[handle,pt]);
  async function change(){
    if(blocked===null||busy)return;
    setBusy(true);setError('');
    try{
      const r=await fetch(blocked?'/api/v1/blocks/'+encodeURIComponent(handle):'/api/v1/blocks',{
        method:blocked?'DELETE':'POST',credentials:'same-origin',cache:'no-store',
        ...(!blocked?{headers:{'Content-Type':'application/json'},body:JSON.stringify({handle})}:{})
      });
      if(!r.ok)throw Error('BLOCK');
      setBlocked(!blocked);setConfirm(false);
      clearProfileImageCache();
      window.dispatchEvent(new Event('uorqui:friends-updated'));
      window.dispatchEvent(new Event('uorqui:blocks-updated'));
      onChanged?.();
    }catch{setError(pt?'Falha ao atualizar o bloqueio.':'Could not update block.');}
    finally{setBusy(false);}
  }
  return <div className="flex flex-col items-start gap-1">
    {!confirm?<Button type="button" size={compact?'sm':'default'} variant="outline" disabled={blocked===null||busy}
      onClick={()=>blocked?void change():setConfirm(true)}>
      {blocked?<ShieldCheck className="size-4"/>:<ShieldBan className="size-4"/>}
      {blocked?(pt?'Desbloquear':'Unblock'):(pt?'Bloquear':'Block')}
    </Button>:<div role="group" aria-label={pt?'Confirmar bloqueio':'Confirm blocking'} className="max-w-64 rounded-xl border border-border bg-card p-3 shadow-lg">
      <p className="text-xs text-muted-foreground">{pt?'Bloquear impede mensagens e pedidos, desfaz a amizade e oculta as fotos e capas entre as contas. O histórico continua disponível.':'Block prevents messages and requests, removes friendship and hides profile photos and covers. Chat history remains.'}</p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="destructive" disabled={busy} onClick={()=>void change()}>{pt?'Bloquear conta':'Block account'}</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={()=>setConfirm(false)}>{pt?'Cancelar':'Cancel'}</Button>
      </div>
    </div>}
    {error&&<span role="alert" className="max-w-52 text-xs text-destructive">{error}</span>}
  </div>;
}
