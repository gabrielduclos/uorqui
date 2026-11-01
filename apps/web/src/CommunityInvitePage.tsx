import {useEffect,useState} from 'react';
import {ArrowRight, Users, Link2, LoaderCircle, ShieldAlert} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Skeleton} from '@/components/ui/skeleton';
import AuthPanel,{type Account} from './AuthPanel';
import {PreferencesControls} from './PreferencesControls';
import {useUorquiPreferences} from './UorquiPreferences';

type Preview={communityId:string;name:string;description:string|null;visibility:'public'|'approval'|'private';expiresAt:string};
export default function CommunityInvitePage({token,account,onAuthenticated,onJoined}:{
  token:string;account:Account|null;onAuthenticated:(a:Account)=>void;onJoined:(communityId:string)=>void;
}){
  const {locale}=useUorquiPreferences(),pt=locale==='pt-BR';
  const [preview,setPreview]=useState<Preview|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [joining,setJoining]=useState(false);
  useEffect(()=>{
    let active=true;
    setLoading(true);setError('');
    void fetch('/api/v1/invites/'+token,{cache:'no-store'}).then(async r=>{
      if(!r.ok)throw Error(r.status===404?'INVITE_UNAVAILABLE':'NETWORK');
      return r.json() as Promise<{community:Preview}>;
    }).then(d=>{if(active)setPreview(d.community);}).catch(e=>{
      if(active)setError(e instanceof Error&&e.message==='INVITE_UNAVAILABLE'?
        (pt?'Este convite expirou ou foi revogado.':'This invite expired or was revoked.'):
        (pt?'Não foi possível carregar o convite.':'Could not load invitation.'));
    }).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[token,pt]);
  useEffect(()=>{
    if(!preview||!account?.profile||joining)return;
    let active=true;setJoining(true);setError('');
    void fetch('/api/v1/invites/'+token+'/accept',{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json'},body:'{}'
    }).then(async r=>{
      if(!r.ok){const data=await r.json().catch(()=>({})) as {error?:string};throw Error(data.error??'HTTP_'+r.status);}
      return r.json() as Promise<{communityId:string}>;
    }).then(result=>{if(active)onJoined(result.communityId);}).catch(e=>{
      if(active)setError(e instanceof Error&&e.message==='COMMUNITY_BANNED'?
        (pt?'Você foi banido desta comunidade.':'You are banned from this community.'):
        (pt?'Não foi possível entrar. O convite pode estar expirado ou revogado.':'Could not join. The invitation may have expired or been revoked.'));
    }).finally(()=>{if(active)setJoining(false);});
    return()=>{active=false;};
    // Only attempt once for the current token/account. The retry button uses a page reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[token,preview?.communityId,account?.profile?.handle]);
  return <main className="min-h-[100dvh] bg-background text-foreground">
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
      <a className="text-2xl font-bold" href="/">uorqui<span className="text-primary">.</span></a>
      <PreferencesControls/>
    </header>
    <div className="mx-auto grid max-w-5xl gap-7 px-5 py-12 lg:grid-cols-2">
      <section className="space-y-5">
        <div className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary"><Users className="size-8"/></div>
        <h1 className="text-2xl font-semibold">{pt?'Você recebeu um convite!':'You have been invited!'}</h1>
        {loading?<div className="space-y-3"><Skeleton className="h-9 w-3/4"/><Skeleton className="h-5 w-full"/><Skeleton className="h-5 w-2/3"/></div>:
          preview?<div className="space-y-3 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-xl font-semibold">{preview.name}</h2>
            {preview.description&&<p className="text-sm text-muted-foreground">{preview.description}</p>}
            <p className="text-xs text-muted-foreground"><Link2 className="mr-1 inline size-4"/>
              {pt?'Convite válido até ':'Invitation valid until '}{new Date(preview.expiresAt).toLocaleDateString(locale)}
            </p>
          </div>:<div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
            <ShieldAlert className="size-5 shrink-0"/>{error}</div>}
        {preview&&<p className="text-sm leading-6 text-muted-foreground">{pt?
          'Entre com sua conta ou cadastre-se. Após confirmar o e-mail e criar seu perfil, você será encaminhado automaticamente à comunidade.':
          'Sign in or create an account. After email verification and profile setup, you will automatically join this community.'}</p>}
        {account?.profile&&preview&&<div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin"/>{pt?'Entrando na comunidade…':'Joining community…'}</div>}
        {account?.profile&&preview&&error&&<div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">{error}</p>
          <Button variant="outline" onClick={()=>window.location.reload()}><ArrowRight className="size-4"/>{pt?'Tentar novamente':'Try again'}</Button>
        </div>}
      </section>
      {!account?.profile&&preview&&<div>
        <AuthPanel onAuthenticated={onAuthenticated}/>
      </div>}
    </div>
  </main>;
}
