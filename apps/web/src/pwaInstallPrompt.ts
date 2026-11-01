/** Preserve Chromium's one-shot install event before React mounts. */
export type PwaInstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
let stored:PwaInstallEvent|null=null;
const listeners=new Set<(event:PwaInstallEvent|null)=>void>();
const publish=()=>listeners.forEach(listener=>listener(stored));
if(typeof window!=='undefined'){
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();stored=event as PwaInstallEvent;publish();});
  window.addEventListener('appinstalled',()=>{stored=null;publish();});
}
export function subscribePwaInstall(listener:(event:PwaInstallEvent|null)=>void){
  listeners.add(listener);listener(stored);return()=>{listeners.delete(listener);};
}
export function consumePwaInstall(event:PwaInstallEvent){
  if(stored===event){stored=null;publish();}
}
export const pendingPwaInstall=()=>stored;
export function installedPwa(){
  return typeof window!=='undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator&{standalone?:boolean}).standalone===true);
}
export function iosBrowser(){
  return typeof navigator!=='undefined' &&
    (/iPhone|iPad|iPod/i.test(navigator.userAgent)||
      (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1));
}
