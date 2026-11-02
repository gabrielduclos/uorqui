import pg from 'pg';
import { getPool } from './db/client.js';

const { Client }=pg;
const CHANNEL='uorqui_feed_events';
export type FeedEventKind='publish'|'edit'|'delete'|'like'|'comment';
export type FeedEvent={kind:FeedEventKind;postId:string};
const subscribers=new Set<(event:FeedEvent)=>void>();
let listener:pg.Client|null=null;
let starting:Promise<void>|null=null;
let retry:ReturnType<typeof setTimeout>|null=null;
let closing=false;

function retryListener(){
  if(closing||retry||subscribers.size===0)return;
  retry=setTimeout(()=>{retry=null;void ensureListener().catch(()=>retryListener());},3000);
  retry.unref?.();
}
async function ensureListener():Promise<void>{
  if(closing||listener||!subscribers.size)return;
  if(starting)return starting;
  const raw=process.env.DATABASE_DIRECT_URL??process.env.DATABASE_URL;
  if(!raw)return;
  const address=new URL(raw);
  if(!process.env.DATABASE_DIRECT_URL)address.hostname=address.hostname.replace(/-pooler(?=\.)/,'');
  const connection=new Client({connectionString:address.toString(),connectionTimeoutMillis:8000});
  starting=(async()=>{
    try{
      connection.on('notification',packet=>{
        if(packet.channel!==CHANNEL||!packet.payload)return;
        try{
          const event=JSON.parse(packet.payload) as FeedEvent;
          if(!event||!['publish','edit','delete','like','comment'].includes(event.kind)||
            typeof event.postId!=='string'||!/^[0-9a-f-]{36}$/i.test(event.postId))return;
          for(const callback of subscribers){try{callback(event);}catch{/* Closed stream */}}
        }catch{/* Ignore malformed payloads */}
      });
      const disconnected=()=>{if(listener===connection)listener=null;retryListener();};
      connection.on('error',disconnected);connection.on('end',disconnected);
      await connection.connect();
      await connection.query('LISTEN '+CHANNEL);
      listener=connection;
    }catch{await connection.end().catch(()=>{});retryListener();}
    finally{starting=null;}
  })();
  await starting;
}

export async function subscribeFeedEvents(callback:(event:FeedEvent)=>void):Promise<()=>void>{
  if(closing)return ()=>{};
  subscribers.add(callback);
  await ensureListener().catch(()=>retryListener());
  return ()=>{subscribers.delete(callback);};
}

/** Notifications contain only opaque post IDs; data reads still enforce feed privacy. */
export async function publishFeedEvent(kind:FeedEventKind,postId:string):Promise<void>{
  await getPool().query('SELECT pg_notify($1,$2)',[
    CHANNEL,JSON.stringify({kind,postId} satisfies FeedEvent),
  ]);
}
export async function closeFeedEvents():Promise<void>{
  closing=true;
  if(retry){clearTimeout(retry);retry=null;}
  subscribers.clear();
  if(starting)await starting.catch(()=>{});
  const existing=listener;listener=null;
  if(existing)await existing.end().catch(()=>{});
}
