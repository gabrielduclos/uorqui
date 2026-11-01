import {useCallback,useEffect,useState} from 'react';
import {iosBrowser,installedPwa} from './pwaInstallPrompt';

const key='uorqui:social:push-account';
type Status='unsupported'|'disabled'|'ready'|'busy'|'error';
function b64Bytes(s:string){
  const input=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4));
  return Uint8Array.from(input,ch=>ch.charCodeAt(0));
}
function supported(){
  return window.isSecureContext&&'serviceWorker'in navigator&&
    'PushManager'in window&&'Notification'in window&&
    (!iosBrowser()||installedPwa());
}
function accountStored(){
  try{return localStorage.getItem(key);}catch{return null;}
}
function setStored(id:string|null){
  try{id?localStorage.setItem(key,id):localStorage.removeItem(key);}catch{}
}
async function registration(){
  const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
  return reg.active?reg:navigator.serviceWorker.ready;
}
export async function deactivatePush(){
  if(!('serviceWorker'in navigator))return;
  try{
    const reg=await navigator.serviceWorker.getRegistration('/');
    const sub=await reg?.pushManager.getSubscription();
    if(sub){
      await fetch('/api/v1/push/subscription',{method:'DELETE',credentials:'same-origin',
        headers:{'content-type':'application/json'},body:JSON.stringify({endpoint:sub.endpoint})}).catch(()=>{});
      await sub.unsubscribe().catch(()=>false);
    }
  }finally{setStored(null);}
}
export function useSocialPush(accountId:string){
  const [status,setStatus]=useState<Status>(()=>supported()?'disabled':'unsupported');
  const [error,setError]=useState('');
  useEffect(()=>{
    if(!supported()){setStatus('unsupported');return;}
    let live=true;
    async function restore(){
      try{
        const reg=await registration();
        const sub=await reg.pushManager.getSubscription();
        if(!live)return;
        if(accountStored()!==accountId||!sub||Notification.permission!=='granted'){
          setStatus('disabled');return;
        }
        const saved=sub.toJSON();
        if(!saved.keys?.p256dh||!saved.keys.auth)return;
        const result=await fetch('/api/v1/push/subscription',{
          method:'POST',credentials:'same-origin',cache:'no-store',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({subscription:saved})
        });
        if(live)setStatus(result.ok?'ready':'error');
      }catch{if(live)setStatus('error');}
    }
    void restore();
    return()=>{live=false;};
  },[accountId]);
  const enable=useCallback(async()=>{
    if(!supported()){setStatus('unsupported');return;}
    setStatus('busy');setError('');
    try{
      // Permission must only be requested from a deliberate click/tap.
      const permission=await Notification.requestPermission();
      if(permission!=='granted'){setStatus('disabled');return;}
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
      const response=await fetch('/api/v1/push/subscription',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'content-type':'application/json'},body:JSON.stringify({subscription:sub.toJSON()})
      });
      if(!response.ok)throw Error('Falha ao registrar este dispositivo');
      setStored(accountId);setStatus('ready');
    }catch(e){setError(e instanceof Error?e.message:String(e));setStatus('error');}
  },[accountId]);
  const disable=useCallback(async()=>{setStatus('busy');try{await deactivatePush();setStatus('disabled');}catch{setStatus('error');}},[]);
  return {status,error,enable,disable,supported:status!=='unsupported'};
}
