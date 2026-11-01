/**
 * Bounded session-only social feed cache. Never persist post text or user relationships
 * to browser storage, Service Worker caches, or public network caches.
 * Kept across route changes that remount the app shell, isolated by account ID.
 */
export type FeedCacheFilter='for-you'|'following';
export type FeedCacheSnapshot<T>={
  posts:T[];cursor:string|null;hasMore:boolean;scrollTop:number;fetchedAt:number;
};
type Entry={lastFilter:FeedCacheFilter;views:Partial<Record<FeedCacheFilter,FeedCacheSnapshot<unknown>>>};
const sessions=new Map<string,Entry>();
const MAX_POSTS=100;
const MAX_AGE_MS=2*60*1000;
export function readFeedSession<T>(userId:string,filter:FeedCacheFilter):FeedCacheSnapshot<T>|null{
  const snapshot=sessions.get(userId)?.views[filter];
  if(!snapshot)return null;
  if(Date.now()-snapshot.fetchedAt>MAX_AGE_MS){
    delete sessions.get(userId)?.views[filter];
    return null;
  }
  return snapshot as FeedCacheSnapshot<T>;
}
export function readFeedSessionFilter(userId:string):FeedCacheFilter{
  return sessions.get(userId)?.lastFilter??'for-you';
}
export function writeFeedSession<T>(userId:string,filter:FeedCacheFilter,snapshot:FeedCacheSnapshot<T>){
  if(!userId||!snapshot.fetchedAt)return;
  let entry=sessions.get(userId);
  if(!entry){
    entry={lastFilter:filter,views:{}};
    sessions.set(userId,entry);
  }
  entry.lastFilter=filter;
  entry.views[filter]={...snapshot,posts:snapshot.posts.slice(0,MAX_POSTS)};
}
export function clearFeedSessionCache(){
  sessions.clear();
}
