import { compactUserName } from './userDisplayName';
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
  return <section className="space-y-3" aria-label={pt?'Contas bloqueadas':'Blocked accounts'}>
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
      <ShieldBan className="mt-0.5 size-4 shrink-0 text-muted-foreground"/>
      <div><h2 className="text-sm font-semibold">{pt?'Contas bloqueadas':'Blocked accounts'}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{pt?'Fotos e capas ocultas. Desbloquear não adiciona o contato novamente.':'Photos and covers hidden. Unblocking does not add the contact again.'}</p>
      </div>
    </div>
    {error&&<p role="alert" className="rounded-md border border-destructive/30 p-3 text-xs text-destructive">{error}</p>}
    {loading&&<p role="status" className="px-2 py-3 text-xs text-muted-foreground">{pt?'Carregando…':'Loading…'}</p>}
    {!loading&&!blocked.length&&<p className="rounded-lg border border-border bg-card px-4 py-10 text-center text-xs text-muted-foreground">{pt?'Nenhuma conta bloqueada.':'No blocked accounts.'}</p>}
    {blocked.length>0&&<div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-card">
      {blocked.map(person=><div key={person.handle} className="flex min-h-16 min-w-0 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/60">
        <div className="grid size-9 shrink-0 place-items-center rounded-md bg-secondary"><UserRoundX className="size-4 text-muted-foreground"/></div>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{compactUserName(person.displayName)}</span>
          <span className="block truncate text-xs text-muted-foreground">@{person.handle}</span></span>
        <Button size="sm" variant="outline" disabled={!!busy} className="min-h-9 shrink-0 rounded-md text-xs"
          onClick={()=>void unblock(person.handle)}>{pt?'Desbloquear':'Unblock'}</Button>
      </div>)}
    </div>}
  </section>;
}
