
import {useCallback,useEffect,useRef,useState} from 'react';
import {clearReadPush} from './readPushNotifications';
export type ActivityNotification={
  id:string;kind:'friend_request'|'friend_accepted'|'community_join_request'|'meeting_join_request';
  communityId?:string|null;communityName?:string|null;meetingName?:string|null;
  targetId:string;createdAt:string;readAt:string|null;actorHandle:string;actorName:string;actorAvatar:string|null;
};
export function useActivityNotifications(accountId:string){
  const [items,setItems]=useState<ActivityNotification[]>([]);
  const [unread,setUnread]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const seq=useRef(0);
  const refresh=useCallback(async()=>{
    const current=++seq.current;
    try{
      const res=await fetch('/api/v1/notifications',{credentials:'same-origin',cache:'no-store'});
      if(!res.ok)throw Error('UNAVAILABLE');
      const body=await res.json() as {notifications:ActivityNotification[];unreadCount:number};
      if(current!==seq.current)return;
      const rows=Array.isArray(body.notifications)?body.notifications:[];
      setItems(rows);
      // A read on another device may leave an older OS push visible here.
      const alreadyRead=rows.filter(item=>item.readAt).slice(0,100);
      if(alreadyRead.length)clearReadPush(alreadyRead.map(item=>({kind:'activity' as const,notificationId:item.id})));
      setUnread(Math.max(0,Number(body.unreadCount)||0));setError(false);
    }catch{if(current===seq.current)setError(true);}
    finally{if(current===seq.current)setLoading(false);}
  },[accountId]);
  useEffect(()=>{
    setItems([]);setUnread(0);setLoading(true);
    const wake=()=>{if(document.visibilityState==='visible')void refresh();};
    const interval=window.setInterval(wake,30000);
    window.addEventListener('uorqui:activity-update',wake);
    window.addEventListener('focus',wake);
    document.addEventListener('visibilitychange',wake);
    void refresh();
    return()=>{seq.current++;window.clearInterval(interval);
      window.removeEventListener('uorqui:activity-update',wake);
      window.removeEventListener('focus',wake);
      document.removeEventListener('visibilitychange',wake);};
  },[accountId,refresh]);
  const markRead=useCallback(async(id:string)=>{
    try{
      const res=await fetch('/api/v1/notifications/'+encodeURIComponent(id)+'/read',{
        method:'PATCH',credentials:'same-origin'});
      if(!res.ok)throw Error('UNAVAILABLE');
      const already=items.find(n=>n.id===id)?.readAt;
      setItems(old=>old.map(n=>n.id===id?{...n,readAt:n.readAt??new Date().toISOString()}:n));
      if(!already)setUnread(old=>Math.max(0,old-1));
      clearReadPush({kind:'activity',notificationId:id});
    }catch{void refresh();}
  },[items,refresh]);
  const remove=useCallback(async(id:string)=>{
    const res=await fetch('/api/v1/notifications/'+encodeURIComponent(id),{
      method:'DELETE',credentials:'same-origin'
    });
    if(!res.ok)throw Error('UNAVAILABLE');
    const result=await res.json() as {removed:boolean;wasUnread:boolean};
    // Ignore any older list fetch that started before this deletion.
    seq.current++;
    setItems(old=>old.filter(item=>item.id!==id));
    if(result.wasUnread)setUnread(old=>Math.max(0,old-1));
    clearReadPush({kind:'activity',notificationId:id});
  },[]);
  const markAllRead=useCallback(async()=>{
    const res=await fetch('/api/v1/notifications/read-all',{method:'POST',credentials:'same-origin'});
    if(!res.ok)throw Error('UNAVAILABLE');
    setUnread(0);
    clearReadPush({kind:'activity-all'});
    setItems(old=>old.map(n=>({...n,readAt:n.readAt??new Date().toISOString()})));
  },[]);
  return {items,unread,loading,error,refresh,markRead,markAllRead,remove};
}
