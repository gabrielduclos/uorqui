import { Fragment, type MouseEvent, type ReactNode } from 'react';

/**
 * Render user-provided message text as plain text plus safe, clickable links.
 * Do not fetch URLs, render HTML, or trust arbitrary URI schemes.
 */
const urlPattern=/\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const trailingPunctuation=/[.,!?;:\]}]+$/;

export function splitMessageLinks(text:string):Array<{text:string;href?:string}>{
  const result:Array<{text:string;href?:string}>=[];
  let last=0;
  for(const match of text.matchAll(urlPattern)){
    const at=match.index;
    if(at>last)result.push({text:text.slice(last,at)});
    const candidate=match[0];
    let end=candidate.length;
    while(end>0){
      const char=candidate[end-1];
      if(trailingPunctuation.test(char)){end--;continue;}
      if(char===')'){
        const fragment=candidate.slice(0,end);
        const opens=(fragment.match(/\(/g)??[]).length;
        const closes=(fragment.match(/\)/g)??[]).length;
        if(closes>opens){end--;continue;}
      }
      break;
    }
    const displayed=candidate.slice(0,end);
    const rawHref=/^www\./i.test(displayed)?'https://'+displayed:displayed;
    let href:string|undefined;
    try{
      const url=new URL(rawHref);
      if((url.protocol==='http:'||url.protocol==='https:') && url.hostname && !url.username && !url.password){
        href=url.href;
      }
    }catch{/* malformed URL remains plain text */}
    if(href)result.push({text:displayed,href});
    else if(displayed)result.push({text:displayed});
    if(end<candidate.length)result.push({text:candidate.slice(end)});
    last=at+candidate.length;
  }
  if(last<text.length)result.push({text:text.slice(last)});
  return result.length?result:[{text}];
}

const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/** Only route well-formed same-origin Uorqui community/channel invitations
 * through the already-mounted app. Unrelated links remain external. */
export function internalChatLink(href:string):{type:'channel';communityId:string;channelId:string}|{type:'invite';url:string}|null{
  try{
    const url=new URL(href,window.location.origin);
    if(url.origin!==window.location.origin)return null;
    const communityId=url.searchParams.get('community');
    const channelId=url.searchParams.get('channel');
    if(url.pathname==='/'&&uuid.test(communityId??'')&&uuid.test(channelId??''))
      return {type:'channel',communityId:communityId!,channelId:channelId!};
    if(/^\/invite\/[0-9a-f-]{36}\/?$/i.test(url.pathname)&&
      uuid.test(url.pathname.split('/')[2]??'')&&
      (!channelId||uuid.test(channelId)))
      return {type:'invite',url:url.pathname+url.search};
    // Keep one-use restricted channel capability links inside the app.
    // The secret stays in the fragment and is consumed into sessionStorage by
    // App.tsx immediately after the internal navigation event.
    const restrictedToken=new URLSearchParams(url.hash.slice(1)).get('token');
    if(/^\/channel-invite\/?$/.test(url.pathname)&&!url.search&&
       restrictedToken&&/^[A-Za-z0-9_-]{43}$/.test(restrictedToken))
      return {type:'invite',url:url.pathname+url.hash};
  }catch{/* External or malformed link. */}
  return null;
}

export function openInternalChatLink(event:MouseEvent<HTMLAnchorElement>,href:string){
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return false;
  const target=internalChatLink(href);
  if(!target)return false;
  event.preventDefault();event.stopPropagation();
  if(target.type==='channel'){
    window.dispatchEvent(new CustomEvent('uorqui:open-community-link',{
      detail:{communityId:target.communityId,channelId:target.channelId}
    }));
  }else{
    // The existing invite redemption flow watches popstate, including when
    // the user is signed in. No full navigation or new tab is necessary.
    window.history.pushState({uorquiInternalInvite:true},'',target.url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
  return true;
}

function MentionText({text,allowedHandles,mentionDisplayNames}:{
  text:string;allowedHandles?:ReadonlySet<string>;mentionDisplayNames?:ReadonlyMap<string,string>;
}){
  const mentions=/(^|[^a-zA-Z0-9_])@([a-z][a-z0-9_]{2,31})(?![a-zA-Z0-9_])/gi;
  const parts:ReactNode[]=[];
  let offset=0;
  for(const match of text.matchAll(mentions)){
    const start=(match.index??0)+match[1].length;
    if(start>offset)parts.push(text.slice(offset,start));
    const handle=match[2].toLowerCase();
    if(allowedHandles&&!allowedHandles.has(handle)){
      parts.push(text.slice(start,start+match[2].length+1));
      offset=start+match[2].length+1;
      continue;
    }
    const displayName=mentionDisplayNames?.get(handle)?.trim();
    // Keep @ in the underlying URL/username, not in the visible linked name.
    const label=displayName||handle;
    parts.push(<a key={start} href={'/@'+handle} title={'@'+handle}
      aria-label={displayName?displayName+' (@'+handle+')':'@'+handle}
      className="font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
      onClick={event=>{
        if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;
        event.preventDefault();
        window.history.pushState({uorquiInternalProfile:true},'','/@'+handle);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }}>{label}</a>);
    offset=start+match[2].length+1;
  }
  if(offset<text.length)parts.push(text.slice(offset));
  return <>{parts.length?parts:text}</>;
}

export function MessageText({text,mentions=false,allowedHandles,mentionDisplayNames}:{
  text:string;mentions?:boolean;allowedHandles?:ReadonlySet<string>;mentionDisplayNames?:ReadonlyMap<string,string>;
}){
  return <>{splitMessageLinks(text).map((part,index)=>
    <Fragment key={index}>{part.href?
      <a href={part.href} target={internalChatLink(part.href)?undefined:'_blank'} rel="noopener noreferrer nofollow ugc"
        className="break-all underline decoration-current underline-offset-2 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        onClick={event=>{if(!openInternalChatLink(event,part.href!))event.stopPropagation();}}>{part.text}</a>:mentions?<MentionText text={part.text} allowedHandles={allowedHandles} mentionDisplayNames={mentionDisplayNames}/>:part.text}</Fragment>
  )}</>;
}
