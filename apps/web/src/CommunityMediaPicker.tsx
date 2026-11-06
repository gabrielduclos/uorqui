import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

type PickerTab='emoji'|'gif';
type Emoji={symbol:string;label:string;tags:string};
type Gif={id:string;label:string;tags:string};

const emojis:Emoji[]=[
  {symbol:'😀',label:'Feliz',tags:'happy smile'},
  {symbol:'😃',label:'Sorriso',tags:'smile happy'},
  {symbol:'😄',label:'Alegria',tags:'joy smile'},
  {symbol:'😁',label:'Sorrindo',tags:'grin'},
  {symbol:'😂',label:'Rindo',tags:'laugh lol'},
  {symbol:'🤣',label:'Gargalhada',tags:'rofl laugh'},
  {symbol:'🥹',label:'Emocionado',tags:'tears'},
  {symbol:'😊',label:'Sorriso tímido',tags:'blush'},
  {symbol:'😍',label:'Apaixonado',tags:'love heart'},
  {symbol:'🥰',label:'Carinho',tags:'love'},
  {symbol:'😘',label:'Beijo',tags:'kiss'},
  {symbol:'😎',label:'Legal',tags:'cool'},
  {symbol:'🤩',label:'Impressionado',tags:'star wow'},
  {symbol:'🥳',label:'Festa',tags:'party'},
  {symbol:'😏',label:'Maroto',tags:'smirk'},
  {symbol:'😅',label:'Suor',tags:'nervous'},
  {symbol:'😢',label:'Triste',tags:'cry'},
  {symbol:'😭',label:'Chorando',tags:'cry tears'},
  {symbol:'😡',label:'Bravo',tags:'angry'},
  {symbol:'😱',label:'Surpreso',tags:'shock wow'},
  {symbol:'🤔',label:'Pensando',tags:'thinking'},
  {symbol:'🫠',label:'Derretendo',tags:'melt'},
  {symbol:'😴',label:'Dormindo',tags:'sleep'},
  {symbol:'🤯',label:'Explodindo a cabeça',tags:'mind blown'},
  {symbol:'👍',label:'Joinha',tags:'thumb yes ok'},
  {symbol:'👎',label:'Não gostei',tags:'thumb no'},
  {symbol:'👏',label:'Aplausos',tags:'clap'},
  {symbol:'🙌',label:'Comemoração',tags:'celebrate'},
  {symbol:'👋',label:'Oi',tags:'wave hello'},
  {symbol:'🤝',label:'Acordo',tags:'handshake'},
  {symbol:'🙏',label:'Obrigado',tags:'thanks pray'},
  {symbol:'💪',label:'Força',tags:'strong'},
  {symbol:'🤘',label:'Rock',tags:'metal'},
  {symbol:'👌',label:'Perfeito',tags:'ok'},
  {symbol:'🫶',label:'Coração com as mãos',tags:'heart love'},
  {symbol:'❤️',label:'Coração',tags:'heart love'},
  {symbol:'💙',label:'Coração azul',tags:'heart'},
  {symbol:'💚',label:'Coração verde',tags:'heart'},
  {symbol:'💜',label:'Coração roxo',tags:'heart'},
  {symbol:'💔',label:'Coração partido',tags:'heart broken'},
  {symbol:'🔥',label:'Fogo',tags:'fire'},
  {symbol:'✨',label:'Brilho',tags:'sparkles'},
  {symbol:'⭐',label:'Estrela',tags:'star'},
  {symbol:'🎉',label:'Confete',tags:'party celebrate'},
  {symbol:'🎂',label:'Bolo',tags:'cake birthday'},
  {symbol:'🎮',label:'Videogame',tags:'game'},
  {symbol:'🏆',label:'Troféu',tags:'win'},
  {symbol:'⚽',label:'Futebol',tags:'soccer'},
  {symbol:'🎯',label:'Alvo',tags:'target'},
  {symbol:'🚀',label:'Foguete',tags:'rocket'},
  {symbol:'💯',label:'Cem',tags:'100'},
  {symbol:'✅',label:'Confirmado',tags:'check yes'},
  {symbol:'❌',label:'Não',tags:'cancel no'},
  {symbol:'👀',label:'Olhando',tags:'eyes'},
  {symbol:'💀',label:'Caveira',tags:'skull'},
];

// A curated starter catalog requires no external API key. GIFs are sent as
// allowlisted GIPHY image URLs; only those URLs render as rich media in chat.
const gifs:Gif[]=[
  {id:'5GoVLqeAOo6PK',label:'Joinha',tags:'yes ok aprovação thumbs up'},
  {id:'g9582DNuQppxC',label:'Risada',tags:'haha laugh rindo engraçado'},
  {id:'3o7abKhOpu0NwenH3O',label:'Comemorar',tags:'yay victory festa vitória'},
  {id:'l0HlOaQcLJ2hHpYdy',label:'Aplausos',tags:'clap bravo parabéns'},
  {id:'26ufdipQqU2lhNA4g',label:'Surpresa',tags:'shock wow surpreso'},
  {id:'l3q2K5jinAlChoCLS',label:'Pensando',tags:'thinking hmm'},
  {id:'3oEjI6SIIHBdRxXI40',label:'Olá',tags:'hello oi aceno wave'},
  {id:'xT9IgG50Fb7Mi0prBC',label:'Animado',tags:'excited happy alegria'},
  {id:'l0MYt5jPR6QX5pnqM',label:'Boa!',tags:'good trabalho nice'},
  {id:'xUPGcEliCc7bETyfO8',label:'Até logo',tags:'bye tchau'},
  {id:'26AHONQ79FdWZhAI0',label:'Obrigado',tags:'thanks gratitude'},
  {id:'26BRuo6sLetdllPAQ',label:'O quê?',tags:'what confused dúvida'},
];

export const communityGifUrl=(id:string)=>'https://media.giphy.com/media/'+id+'/giphy.gif';
export function isCommunityGifUrl(value:string|null):value is string {
  return typeof value==='string' && /^https:\/\/media\.giphy\.com\/media\/[A-Za-z0-9]+\/giphy\.gif$/.test(value);
}

export default function CommunityMediaPicker({tab,onClose,onEmoji,onGif,pt}:{
  tab:PickerTab;onClose:()=>void;onEmoji:(emoji:string)=>void;onGif:(url:string)=>void;pt:boolean;
}){
  const [search,setSearch]=useState('');
  const [remoteGifs,setRemoteGifs]=useState<Gif[]>([]);
  const [remoteOffset,setRemoteOffset]=useState(0);
  const [remoteLoading,setRemoteLoading]=useState(false);
  const [remoteMore,setRemoteMore]=useState(false);
  const giphyKey=import.meta.env.VITE_GIPHY_API_KEY?.trim()??'';
  useEffect(()=>{
    if(tab!=='gif'||!giphyKey)return;
    const controller=new AbortController();
    const timeout=window.setTimeout(async()=>{
      setRemoteLoading(true);
      try{
        const query=search.trim().slice(0,50);
        const endpoint=query?'search':'trending';
        const params=new URLSearchParams({
          api_key:giphyKey,limit:'24',offset:String(remoteOffset),rating:'pg',
          ...(query?{q:query,lang:pt?'pt':'en'}:{})
        });
        const response=await fetch('https://api.giphy.com/v1/gifs/'+endpoint+'?'+params,{signal:controller.signal});
        if(!response.ok)throw Error('GIPHY_UNAVAILABLE');
        const data=await response.json() as {data?:{id?:string;title?:string}[];pagination?:{count?:number;total_count?:number}};
        const items=(data.data??[]).filter(item=>/^[A-Za-z0-9]+$/.test(item.id??'')).map(item=>({
          id:item.id!,label:(item.title||'GIF').slice(0,100),tags:item.title||''
        }));
        if(controller.signal.aborted)return;
        setRemoteGifs(old=>remoteOffset?Array.from(new Map([...old,...items].map(item=>[item.id,item])).values()):items);
        const count=Number(data.pagination?.count??items.length),total=Number(data.pagination?.total_count??0);
        setRemoteMore(items.length>0&&count+remoteOffset<total);
      }catch{
        if(!controller.signal.aborted){setRemoteMore(false);if(remoteOffset===0)setRemoteGifs([]);}
      }finally{if(!controller.signal.aborted)setRemoteLoading(false);}
    },remoteOffset?0:280);
    return ()=>{window.clearTimeout(timeout);controller.abort();};
  },[tab,giphyKey,search,remoteOffset,pt]);
  const term=search.trim().toLocaleLowerCase();
  const results=useMemo(()=>tab==='emoji'
    ?emojis.filter(item=>(item.label+' '+item.tags).toLocaleLowerCase().includes(term))
    :giphyKey&&remoteGifs.length?remoteGifs:
      gifs.filter(item=>(item.label+' '+item.tags).toLocaleLowerCase().includes(term)),[tab,term,giphyKey,remoteGifs]);
  return <div role="dialog" aria-label={tab==='emoji'?(pt?'Selecionar emoji':'Choose emoji'):(pt?'Selecionar GIF':'Choose GIF')}
    className="absolute bottom-full left-0 z-30 mb-2 flex max-h-[min(55dvh,370px)] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
    <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
      <p className="text-sm font-semibold">{tab==='emoji'?'Emojis':'GIFs'}</p>
      <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-secondary" aria-label={pt?'Fechar':'Close'}><X className="size-4"/></button>
    </div>
    <div className="relative shrink-0 px-3 py-2">
      <Search className="pointer-events-none absolute left-5 top-4 size-4 text-muted-foreground"/>
      <Input value={search} onChange={e=>{setSearch(e.target.value);setRemoteOffset(0);setRemoteGifs([]);}}
        placeholder={pt?'Buscar':'Search'} aria-label={pt?'Buscar emoji ou GIF':'Search emoji or GIF'}
        className="h-9 pl-9 text-base"/>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
      {tab==='emoji'?<div className="grid grid-cols-7 gap-1">
        {(results as Emoji[]).map(item=><button key={item.symbol} type="button" title={item.label}
          aria-label={item.label} onClick={()=>onEmoji(item.symbol)}
          className="grid aspect-square min-h-10 place-items-center rounded-lg text-2xl hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary">
          {item.symbol}</button>)}
      </div>:<div className="grid grid-cols-2 gap-2">
        {(results as Gif[]).map(item=><button key={item.id} type="button" onClick={()=>onGif(communityGifUrl(item.id))}
          aria-label={(pt?'Enviar GIF: ':'Send GIF: ')+item.label}
          className="overflow-hidden rounded-lg border border-border text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-primary">
          <img loading="lazy" src={communityGifUrl(item.id)} referrerPolicy="no-referrer" alt={item.label}
            className="h-24 w-full bg-secondary object-cover"/>
          <span className="block truncate px-2 py-1 text-xs">{item.label}</span>
        </button>)}
      </div>}
      {tab==='gif'&&remoteLoading&&<p role="status" className="p-2 text-center text-xs text-muted-foreground">{pt?'Buscando GIFs…':'Searching GIFs…'}</p>}
      {tab==='gif'&&giphyKey&&remoteMore&&!remoteLoading&&<button type="button" onClick={()=>setRemoteOffset(old=>old+24)}
        className="mt-2 w-full rounded-lg border border-border py-2 text-xs hover:bg-secondary">
        {pt?'Carregar mais GIFs':'Load more GIFs'}
      </button>}
      {!results.length&&!remoteLoading&&<p className="p-4 text-center text-xs text-muted-foreground">{pt?'Nenhum resultado.':'No results.'}</p>}
    </div>
    {tab==='gif'&&<p className="shrink-0 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
      {pt?'GIFs fornecidos pelo GIPHY. Ao abrir um GIF, seu dispositivo se conecta a esse serviço.':
        'GIFs supplied by GIPHY. Opening a GIF connects your device to that service.'}
    </p>}
  </div>;
}
