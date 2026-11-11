/** Browser/PWA history for Android's system Back button.
 * The same-tab entries keep the URL unchanged so OAuth, deep links and
 * public profile routes keep their existing URL-based navigation. */
export type AppArea='communities'|'conversations'|'email'|'contacts'|'notifications'|'profile'|'moderation';
export type AppScreen='dm'|'channel'|'mail';
export type AppHistoryEntry={
  area:AppArea;
  screen?:AppScreen;
  id?:string;
  communityId?:string;
  accountId?:string;
};
const marker='uorquiAppHistory';
function canTrack():boolean{
  return typeof window!=='undefined'&&window.location.pathname==='/'&&
    window.matchMedia('(max-width: 767px)').matches;
}
export function currentAppEntry():AppHistoryEntry|null{
  if(typeof window==='undefined')return null;
  const value=window.history.state?.[marker];
  if(!value||typeof value!=='object')return null;
  const areas:AppArea[]=['communities','conversations','email','contacts','notifications','profile','moderation'];
  if(!areas.includes(value.area))return null;
  const screens:AppScreen[]=['dm','channel','mail'];
  if(value.screen!==undefined&&!screens.includes(value.screen))return null;
  return value as AppHistoryEntry;
}
function wrap(entry:AppHistoryEntry){
  const state=window.history.state;
  return {...(state&&typeof state==='object'?state:{}),[marker]:entry};
}
export function prepareAppHistory(area:AppArea){
  if(!canTrack()||currentAppEntry())return;
  window.history.replaceState(wrap({area}),'',window.location.href);
}
export function pushAppHistory(entry:AppHistoryEntry){
  if(!canTrack())return;
  const previous=currentAppEntry();
  if(previous?.area===entry.area&&previous.screen===entry.screen&&
     previous.id===entry.id&&previous.communityId===entry.communityId&&
     previous.accountId===entry.accountId)return;
  window.history.pushState(wrap(entry),'',window.location.href);
}
export function backFromAppScreen(screen:AppScreen,id:string):boolean{
  if(!canTrack())return false;
  const current=currentAppEntry();
  if(!current||current.screen!==screen||current.id!==id||window.history.length<=1)return false;
  window.history.back();
  return true;
}
export function replaceAppScreenWithArea(area:AppArea,screen:AppScreen,id:string){
  if(!canTrack())return;
  const current=currentAppEntry();
  if(current?.screen===screen&&current.id===id)
    window.history.replaceState(wrap({area}),'',window.location.href);
}
