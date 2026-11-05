/** Close a delivered Web Push only after its underlying item is actually read.
 * The service worker owns OS notifications; the signed-in shell owns in-app alerts. */
export type ReadPushTarget =
  | {kind:'dm'; conversationId:string}
  | {kind:'community'; channelId:string}
  | {kind:'mail'; accountId:string; messageId:string}
  | {kind:'activity'; notificationId:string}
  | {kind:'activity-all'}
  | {kind:'community-invite'; communityId:string};

/** Removes the local notification, without deleting messages or activity history.
 * Browsers control their own notification centers; a different device cannot
 * be directly cleared from this device. */
export function clearReadPush(target:ReadPushTarget | ReadPushTarget[]):void {
  const targets=Array.isArray(target)?target:[target];
  if(!targets.length)return;
  window.dispatchEvent(new CustomEvent('uorqui:push-read',{detail:targets}));
  if(!('serviceWorker' in navigator))return;
  const message={type:'uorqui:clear-read-push',targets};
  try{
    const controller=navigator.serviceWorker.controller;
    if(controller){controller.postMessage(message);return;}
    // Handles the first visit of an installed but not-yet-controlled PWA.
    void navigator.serviceWorker.ready.then(registration=>{
      registration.active?.postMessage(message);
    }).catch(()=>{});
  }catch{/* Push cleanup must never interrupt successful read actions. */}
}
