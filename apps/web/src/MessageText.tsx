import { Fragment } from 'react';

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

export function MessageText({text}:{text:string}){
  return <>{splitMessageLinks(text).map((part,index)=>
    <Fragment key={index}>{part.href?
      <a href={part.href} target="_blank" rel="noopener noreferrer nofollow ugc"
        className="break-all underline decoration-current underline-offset-2 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        onClick={event=>event.stopPropagation()}>{part.text}</a>:part.text}</Fragment>
  )}</>;
}
