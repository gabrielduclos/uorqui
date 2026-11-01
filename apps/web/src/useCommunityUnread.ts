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
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},12000);
    void refresh();
    return ()=>{mounted=false;requestId++;window.clearInterval(timer);
      window.removeEventListener('uorqui:community-channel-read',read);
      window.removeEventListener('focus',onFocus);
      document.removeEventListener('visibilitychange',onFocus);
    };
  },[]);
  return unread;
}
