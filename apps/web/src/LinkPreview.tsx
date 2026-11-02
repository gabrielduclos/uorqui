import {useEffect,useMemo,useRef,useState} from 'react';
import {ExternalLink,Link2} from 'lucide-react';
import {splitMessageLinks} from './MessageText';

type Preview={url:string;siteName:string;title:string;description:string|null;image:string|null};
const shared=new Map<string,Preview|null>();

export function LinkPreview({text,locale}:{text:string;locale:string}){
  const first=useMemo(()=>splitMessageLinks(text).find(part=>part.href?.startsWith('https://'))?.href??null,[text]);
  const ref=useRef<HTMLDivElement>(null);
  const [near,setNear]=useState(false);
  const [preview,setPreview]=useState<Preview|null>(first&&shared.has(first)?shared.get(first)??null:null);
  const [imageFailed,setImageFailed]=useState(false);

  useEffect(()=>{
    setImageFailed(false);
    setNear(false);
    setPreview(first&&shared.has(first)?shared.get(first)??null:null);
    if(!first)return;
    const element=ref.current;
    if(!element||!('IntersectionObserver'in window)){setNear(true);return;}
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){setNear(true);observer.disconnect();}
    },{rootMargin:'320px'});
    observer.observe(element);
    return()=>observer.disconnect();
  },[first]);

  useEffect(()=>{
    if(!first||!near||shared.has(first))return;
    const controller=new AbortController();
    void fetch('/api/v1/links/preview?url='+encodeURIComponent(first),{
      credentials:'same-origin',cache:'no-store',signal:controller.signal
    }).then(async response=>{
      if(!response.ok)throw new Error('PREVIEW_UNAVAILABLE');
      return response.json() as Promise<{preview:Preview|null}>;
    }).then(result=>{
      if(controller.signal.aborted)return;
      if(shared.size>=200)shared.delete(shared.keys().next().value!);
      shared.set(first,result.preview);
      setPreview(result.preview);
    }).catch(()=>{/* The original message link remains clickable. */});
    return()=>controller.abort();
  },[first,near]);

  if(!first)return null;
  const pt=locale==='pt-BR';
  return <div ref={ref} className="mt-2 min-w-0" data-uorqui-link-preview>
    {preview&&<a href={preview.url} target="_blank" rel="noopener noreferrer nofollow ugc"
      onClick={event=>event.stopPropagation()}
      aria-label={(pt?'Abrir link: ':'Open link: ')+preview.title}
      className="flex min-w-0 max-w-md overflow-hidden rounded-lg border border-current/20 bg-background/90 text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      {preview.image&&!imageFailed&&<img src={preview.image} alt="" loading="lazy" decoding="async"
        referrerPolicy="no-referrer" onError={()=>setImageFailed(true)}
        className="h-24 w-24 shrink-0 object-cover sm:h-28 sm:w-28"/>}
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-2.5">
        <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground"><Link2 className="size-3 shrink-0"/>{preview.siteName}</span>
        <strong className="line-clamp-2 text-xs font-semibold leading-5">{preview.title}</strong>
        {preview.description&&<span className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">{preview.description}</span>}
        <span className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-primary"><ExternalLink className="size-3"/>{new URL(preview.url).hostname}</span>
      </span>
    </a>}
  </div>;
}
