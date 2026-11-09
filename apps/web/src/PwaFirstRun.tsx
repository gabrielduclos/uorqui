import {useEffect,useRef,useState} from 'react';
import {Bell,Download,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {useUorquiPreferences} from './UorquiPreferences';
import {consumePwaInstall,installedPwa,iosBrowser,pendingPwaInstall,subscribePwaInstall,type PwaInstallEvent} from './pwaInstallPrompt';
import {useSocialPush} from './useSocialPush';
function today(){
  const day=new Date();
  return [day.getFullYear(),String(day.getMonth()+1).padStart(2,'0'),String(day.getDate()).padStart(2,'0')].join('-');
}
export function PwaFirstRun({accountId}:{accountId:string}){
  const {locale}=useUorquiPreferences(),pt=locale==='pt-BR';
  const push=useSocialPush(accountId);
  // Browser permission and the account's push subscription are different states:
  // a missing/stale subscription needs reconnection in Settings, not a new
  // permission request when the browser has already granted notifications.
  const canAskBrowserPermission=push.supported&&typeof Notification!=='undefined'&&Notification.permission==='default';
  const [installEvent,setInstallEvent]=useState<PwaInstallEvent|null>(pendingPwaInstall);
  const [installVisible,setInstallVisible]=useState(false);
  const [askPush,setAskPush]=useState(false);
  const [busy,setBusy]=useState(false);
  const pushOfferedThisVisit=useRef(false);
  useEffect(()=>subscribePwaInstall(setInstallEvent),[]);
  useEffect(()=>{
    const installed=()=>setInstallVisible(false);
    window.addEventListener('appinstalled',installed);
    return()=>window.removeEventListener('appinstalled',installed);
  },[]);
  useEffect(()=>{
    if(!accountId||installedPwa()){setInstallVisible(false);return;}
    const desktop=!iosBrowser()&&window.matchMedia('(min-width: 768px)').matches;
    let pushAskedToday=false;
    try{pushAskedToday=localStorage.getItem('uorqui:social:push-ask:'+accountId)===today();}catch{}
    // Desktop browsers support push without installing the PWA. Offer push first,
    // then offer installation on a later visit (never stack prompts together).
    // Previously the installation prompt preempted and cancelled the push offer.
    if(pushOfferedThisVisit.current||
      (desktop&&canAskBrowserPermission&&push.status!=='ready'&&!pushAskedToday)){
      setInstallVisible(false);return;
    }
    const id='uorqui:social:install-invite:'+accountId;
    try{if(localStorage.getItem(id)===today())return;}catch{}
    const timer=window.setTimeout(()=>{
      try{localStorage.setItem(id,today());}catch{}
      setInstallVisible(true);
    },1300);
    return()=>window.clearTimeout(timer);
  },[accountId,push.status,canAskBrowserPermission]);
  useEffect(()=>{
    if(!accountId||installVisible||!canAskBrowserPermission||push.status==='ready'||push.status==='busy'||push.status==='checking'){
      setAskPush(false);return;
    }
    const id='uorqui:social:push-ask:'+accountId;
    try{if(localStorage.getItem(id)===today())return;}catch{}
    // Ask at most once per local day, and only after the push state is checked.
    const timer=window.setTimeout(()=>{
      try{
        if(localStorage.getItem(id)===today())return;
        localStorage.setItem(id,today());
      }catch{}
      pushOfferedThisVisit.current=true;
      setAskPush(true);
    },1600);
    return()=>window.clearTimeout(timer);
  },[accountId,installVisible,push.status,canAskBrowserPermission]);
  function dismissPush(){
    try{localStorage.setItem('uorqui:social:push-ask:'+accountId,today());}catch{}
    setAskPush(false);
  }
  async function install(){
    if(!installEvent||busy)return;
    setBusy(true);
    try{
      await installEvent.prompt();consumePwaInstall(installEvent);
      await installEvent.userChoice;setInstallVisible(false);
    }catch{/* Keep instructions available for manual installation. */}
    finally{setBusy(false);}
  }
  async function turnOn(){
    setBusy(true);
    try{await push.enable();if(Notification.permission==='granted')dismissPush();}
    finally{setBusy(false);}
  }
  const installing=installVisible&&!installedPwa();
  const permission=(!installing&&askPush&&canAskBrowserPermission&&push.status!=='ready');
  if(!installing&&!permission)return null;
  return <section role="region" aria-label={pt?'Instalar e receber notificações':'Install and notifications'}
    className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[75] mx-auto max-w-sm rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl md:bottom-5">
    <div className="flex items-start gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        {installing?<Download className="size-5"/>:<Bell className="size-5"/>}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">{installing?(pt?'Instale o Uorqui':'Install Uorqui'):(pt?'Ative as notificações':'Enable notifications')}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{installing
          ?pt?'Acesse o Uorqui direto da tela inicial, como um aplicativo.':'Add Uorqui to your home screen.'
          :Notification.permission==='denied'
            ?(pt?'As notificações estão bloqueadas. Libere o Uorqui nas configurações do navegador ou dispositivo.':'Notifications are blocked. Allow Uorqui in browser or device settings.')
            :(pt?'Receba avisos de mensagens, contatos e atividades mesmo com o aplicativo fechado.':'Get alerts for messages, contacts and activity when the app is closed.')}</p>
      </div>
      <button type="button" onClick={installing?()=>setInstallVisible(false):dismissPush}
        className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-muted" aria-label={pt?'Agora não':'Not now'}><X className="size-4"/></button>
    </div>
    {installing?(installEvent?
      <Button type="button" disabled={busy} onClick={()=>void install()} className="mt-3 w-full gap-2">
        {busy?<Spinner className="size-4"/>:<Download className="size-4"/>}{pt?'Instalar Uorqui':'Install Uorqui'}</Button>:
      <p className="mt-3 text-xs text-muted-foreground">
        {iosBrowser()?(pt?'No iPhone, abra Compartilhar e escolha Adicionar à Tela de Início.':'On iPhone, choose Share, then Add to Home Screen.'):
          (pt?'Use a opção Instalar aplicativo no menu do navegador.':'Use Install app in your browser menu.')}
      </p>):Notification.permission==='denied'?null:<Button type="button" disabled={busy||push.status==='busy'} onClick={()=>void turnOn()} className="mt-3 w-full gap-2">
      {busy?<Spinner className="size-4"/>:<Bell className="size-4"/>}{pt?'Ativar notificações':'Enable notifications'}
    </Button>}
    {permission&&Notification.permission==='denied'&&<p className="mt-3 text-xs text-muted-foreground">
      {pt?'Após liberar a permissão, abra o Uorqui novamente para ativar o push.':'After allowing notifications, reopen Uorqui to enable push.'}</p>}
    {push.error&&<p role="alert" className="mt-2 text-xs text-destructive">{push.error}</p>}
  </section>;
}
