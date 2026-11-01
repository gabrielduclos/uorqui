import {useEffect,useState} from 'react';

type Unread={total:number;channels:Record<string,number>;communities:Record<string,number>};
const empty:Unread={total:0,channels:{},communities:{}};

/** A single signed-in poller powers badges in the app navigation and channel lists. */
export function useCommunityUnread(){
  const [unread,setUnread]=useState<Unread>(empty);
  useEffect(()=>{
    let mounted=true, requestId=0;
    const refresh=async()=>{
      const id=++requestId;
      try{
        const res=await fetch('/api/v1/communities/unread',{credentials:'same-origin',cache:'no-store'});
        if(!res.ok)throw Error('UNREAD_UNAVAILABLE');
        const data=await res.json() as Unread;
        if(mounted&&id===requestId)setUnread({
          total:Math.max(0,Number(data.total)||0),channels:data.channels??{},communities:data.communities??{}
        });
      }catch{/* Keep the last known badge if offline or if migration is pending. */}
    };
    const read=(event:Event)=>{
      const ids=(event as CustomEvent<{channelId:string;communityId:string}>).detail;
      if(!ids?.channelId)return;
      requestId++; // Ignore any earlier network response that might restore a stale badge.
      setUnread(old=>{
        const previous=old.channels[ids.channelId]??0;
        if(previous===0)return old;
        const channels={...old.channels},communities={...old.communities};
        delete channels[ids.channelId];
        communities[ids.communityId]=Math.max(0,(communities[ids.communityId]??0)-previous);
        return {total:Math.max(0,old.total-previous),channels,communities};
      });
      void refresh();
    };
    const onFocus=()=>{if(document.visibilityState==='visible')void refresh();};
    window.addEventListener('uorqui:community-channel-read',read);
    window.addEventListener('focus',onFocus);
    document.addEventListener('visibilitychange',onFocus);
    // Reuse the DM realtime transport pattern: a single authenticated SSE
    // subscription triggers refetches, while a slow fallback covers outages.
    let source:EventSource|null=null;
    function connect(){
      if(document.visibilityState!=='visible'||source)return;
      source=new EventSource('/api/v1/communities/events',{withCredentials:true});
      source.addEventListener('community-update',event=>{
        try{
          const data=JSON.parse((event as MessageEvent<string>).data) as {
            kind:'message'|'voice'|'channel'|'membership';communityId:string;channelId:string|null
          };
          if(!data||typeof data.communityId!=='string')return;
          window.dispatchEvent(new CustomEvent('uorqui:community-event',{detail:data}));
          if(data.kind!=='voice')void refresh();
        }catch{/* Ignore invalid notifications. */}
      });
      source.addEventListener('ready',()=>{
        window.dispatchEvent(new CustomEvent('uorqui:community-event',{detail:{kind:'ready'}}));
        void refresh();
      });
    }
    function visibility(){
      if(document.visibilityState!=='visible'){source?.close();source=null;}
      else{connect();void refresh();}
    }
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},30000);
    document.addEventListener('visibilitychange',visibility);
    connect();
    void refresh();
    return ()=>{mounted=false;requestId++;window.clearInterval(timer);
      source?.close();
      window.removeEventListener('uorqui:community-channel-read',read);
      window.removeEventListener('focus',onFocus);
      document.removeEventListener('visibilitychange',onFocus);
      document.removeEventListener('visibilitychange',visibility);
    };
  },[]);
  return unread;
}
