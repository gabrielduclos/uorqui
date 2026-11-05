import {useCallback,useEffect,useState} from 'react';
import {iosBrowser,installedPwa} from './pwaInstallPrompt';

const key='uorqui:social:push-account';
const pushChangedEvent='uorqui:push-changed';
type Status='unsupported'|'checking'|'disabled'|'ready'|'busy'|'error';

function b64Bytes(s:string){
  const input=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4));
  return Uint8Array.from(input,ch=>ch.charCodeAt(0));
}
function supported(){
  return window.isSecureContext&&'serviceWorker'in navigator&&
    'PushManager'in window&&'Notification'in window&&
    (!iosBrowser()||installedPwa());
}
function setStored(id:string|null){
  try{id?localStorage.setItem(key,id):localStorage.removeItem(key);}catch{}
}
function broadcastChange(){
  window.dispatchEvent(new Event(pushChangedEvent));
}
async function registration(){
  const existing=await navigator.serviceWorker.getRegistration('/');
  const reg=existing??await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
  return reg.active?reg:navigator.serviceWorker.ready;
}
async function saveSubscription(sub:PushSubscription){
  const saved=sub.toJSON();
  if(!saved.endpoint||!saved.keys?.p256dh||!saved.keys.auth)
    throw Error('Inscrição de notificações inválida');
  const response=await fetch('/api/v1/push/subscription',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({subscription:saved})
  });
  if(!response.ok)throw Error('Falha ao sincronizar notificações com a conta');
}
export async function deactivatePush(){
  if(!('serviceWorker'in navigator)){setStored(null);broadcastChange();return;}
  try{
    const reg=await navigator.serviceWorker.getRegistration('/');
    const sub=await reg?.pushManager.getSubscription();
    if(sub){
      await fetch('/api/v1/push/subscription',{method:'DELETE',credentials:'same-origin',
        headers:{'content-type':'application/json'},body:JSON.stringify({endpoint:sub.endpoint})}).catch(()=>{});
      await sub.unsubscribe().catch(()=>false);
    }
  }finally{setStored(null);broadcastChange();}
}
export function useSocialPush(accountId:string){
  const [status,setStatus]=useState<Status>(()=>supported()?'checking':'unsupported');
  const [error,setError]=useState('');
  useEffect(()=>{
    if(!supported()){setStatus('unsupported');return;}
    let live=true;
    let inFlight=false;
    async function restore(){
      if(inFlight)return;
      inFlight=true;
      try{
        if(Notification.permission!=='granted'){
          if(live){setStatus('disabled');setError('');}
          return;
        }
        const reg=await registration();
        const sub=await reg.pushManager.getSubscription();
        if(!live)return;
        if(!sub){setStatus('disabled');setError('');return;}
        // A valid browser subscription is authoritative: localStorage may have
        // been cleared, or another mounted hook may have enabled this device.
        await saveSubscription(sub);
        if(!live)return;
        setStored(accountId);
        setError('');
        setStatus('ready');
      }catch(e){
        if(live){
          setStatus('error');
          setError(e instanceof Error?e.message:String(e));
        }
      }finally{inFlight=false;}
    }
    void restore();
    const refresh=()=>{void restore();};
    window.addEventListener(pushChangedEvent,refresh);
    window.addEventListener('focus',refresh);
    return()=>{live=false;window.removeEventListener(pushChangedEvent,refresh);window.removeEventListener('focus',refresh);};
  },[accountId]);
  const enable=useCallback(async()=>{
    if(!supported()){setStatus('unsupported');return;}
    setStatus('busy');setError('');
    try{
      // Only request a new browser permission during an explicit click/tap.
      // An existing grant must reconnect without triggering another permission dialog.
      const permission=Notification.permission==='default'?
        await Notification.requestPermission():Notification.permission;
      if(permission!=='granted'){
        setStatus('disabled');
        setError(permission==='denied'?
          'Notificações bloqueadas pelo navegador. Permita notificações nas configurações do site e tente novamente.':
          'Permissão de notificações não concedida.');
        return;
      }
      const config=await fetch('/api/v1/push/config',{cache:'no-store'}).then(async r=>{
        if(!r.ok)throw Error('Configuração de push indisponível');
        return r.json() as Promise<{publicKey:string|null;enabled:boolean}>;
      });
      if(!config.enabled||!config.publicKey)throw Error('Servidor de notificações ainda não configurado');
      const reg=await registration();
      let sub=await reg.pushManager.getSubscription();
      if(sub){
        const previous=sub.options.applicationServerKey;
        const keyBytes=b64Bytes(config.publicKey);
        if(previous&&(new Uint8Array(previous).length!==keyBytes.length||
          new Uint8Array(previous).some((b,i)=>b!==keyBytes[i]))){
          await sub.unsubscribe();sub=null;
        }
      }
      if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64Bytes(config.publicKey)});
      await saveSubscription(sub);
      setStored(accountId);
      setStatus('ready');
      broadcastChange();
    }catch(e){setError(e instanceof Error?e.message:String(e));setStatus('error');}
  },[accountId]);
  const disable=useCallback(async()=>{
    setStatus('busy');
    try{await deactivatePush();setError('');setStatus('disabled');}
    catch(e){setError(e instanceof Error?e.message:String(e));setStatus('error');}
  },[]);
  return {status,error,enable,disable,supported:status!=='unsupported'};
}
