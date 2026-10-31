import { useCallback, useEffect, useState } from 'react';
import { ShieldBan, UserRoundX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clearProfileImageCache } from './profileImageCache';
import { useUorquiPreferences } from './UorquiPreferences';
type Blocked={handle:string;displayName:string;blockedAt:string};
export function BlockedAccountsPanel(){
  const {locale}=useUorquiPreferences();const pt=locale==='pt-BR';
  const [blocked,setBlocked]=useState<Blocked[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState('');
  const refresh=useCallback(async()=>{
    const r=await fetch('/api/v1/blocks',{credentials:'same-origin',cache:'no-store'});
    if(!r.ok)throw Error('BLOCKS');
    const data=await r.json() as {blocked:Blocked[]};
    setBlocked(data.blocked);setLoading(false);
  },[]);
  useEffect(()=>{
    let active=true;
    void refresh().catch(()=>{if(active){setLoading(false);setError(pt?'Não foi possível carregar os bloqueios.':'Could not load blocked accounts.');}});
    const changed=()=>void refresh().catch(()=>{});
    window.addEventListener('uorqui:blocks-updated',changed);
    return ()=>{active=false;window.removeEventListener('uorqui:blocks-updated',changed);};
  },[refresh,pt]);
  async function unblock(handle:string){
    if(busy)return;
    setBusy(handle);setError('');
    try{
      const r=await fetch('/api/v1/blocks/'+encodeURIComponent(handle),{method:'DELETE',credentials:'same-origin',cache:'no-store'});
      if(!r.ok)throw Error('UNBLOCK');
      clearProfileImageCache();await refresh();
      window.dispatchEvent(new Event('uorqui:blocks-updated'));
      window.dispatchEvent(new Event('uorqui:friends-updated'));
    }catch{setError(pt?'Não foi possível desbloquear.':'Could not unblock.');}
    finally{setBusy(null);}
  }
  return <div className="space-y-3 px-2 py-2">
    <div className="flex items-start gap-2"><ShieldBan className="mt-0.5 size-5 shrink-0 text-muted-foreground"/>
      <div><h3 className="text-sm font-semibold">{pt?'Contas bloqueadas':'Blocked accounts'}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{pt?'Fotos e capas ocultas. Desbloquear não restaura a amizade.':'Photos and covers hidden. Unblocking does not restore friendship.'}</p></div></div>
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {loading&&<p role="status" className="text-xs text-muted-foreground">{pt?'Carregando…':'Loading…'}</p>}
    {!loading&&!blocked.length&&<p className="py-8 text-center text-xs text-muted-foreground">{pt?'Nenhuma conta bloqueada.':'No blocked accounts.'}</p>}
    {blocked.map(person=><div key={person.handle} className="flex min-h-16 items-center gap-3 rounded-xl border border-border px-3 py-2">
      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary"><UserRoundX className="size-5 text-muted-foreground"/></div>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{person.displayName}</span><span className="block truncate text-xs text-muted-foreground">@{person.handle}</span></span>
      <Button size="sm" variant="outline" disabled={!!busy} onClick={()=>void unblock(person.handle)}>{pt?'Desbloquear':'Unblock'}</Button>
    </div>)}
  </div>;
}
