import pg from 'pg';
import {getPool} from './db/client.js';

const {Client}=pg;
const CHANNEL='uorqui_community_events';
export type CommunityEventKind='message'|'voice'|'channel'|'membership';
export type CommunityEvent={communityId:string;channelId:string|null;kind:CommunityEventKind};
type Subscriber={communities:Set<string>;callback:(event:CommunityEvent)=>void};
const subscribers=new Set<Subscriber>();
let listener:pg.Client|null=null;
let starting:Promise<void>|null=null;
let retry:ReturnType<typeof setTimeout>|null=null;
let closing=false;

function retryListener(){
  if(closing||retry||subscribers.size===0)return;
  retry=setTimeout(()=>{retry=null;void ensureListener().catch(()=>retryListener());},3000);
  retry.unref?.();
}
async function ensureListener(){
  if(closing||listener||subscribers.size===0)return;
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
          const event=JSON.parse(packet.payload) as CommunityEvent;
          if(!event||typeof event.communityId!=='string'||
            (event.channelId!==null&&typeof event.channelId!=='string')||
            !['message','voice','channel','membership'].includes(event.kind))return;
          for(const entry of subscribers){
            if(!entry.communities.has(event.communityId))continue;
            try{entry.callback(event);}catch{/* Browser may have disconnected. */}
          }
        }catch{/* Reject malformed notifications. */}
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

/** Subscriptions only carry IDs and kinds. Every subsequent data read rechecks membership. */
export async function subscribeCommunityEvents(communityIds:string[],callback:(event:CommunityEvent)=>void){
  if(closing)return ()=>{};
  const entry:Subscriber={communities:new Set(communityIds),callback};
  subscribers.add(entry);
  await ensureListener().catch(()=>retryListener());
  return ()=>{subscribers.delete(entry);};
}

/** One cluster-wide notification per change; never include message text or identity fields. */
export async function publishCommunityEvent(communityId:string,channelId:string|null,kind:CommunityEventKind){
  await getPool().query('SELECT pg_notify($1,$2)',[
    CHANNEL,JSON.stringify({communityId,channelId,kind} satisfies CommunityEvent),
  ]);
}
export async function closeCommunityEvents(){
  closing=true;
  if(retry){clearTimeout(retry);retry=null;}
  subscribers.clear();
  if(starting)await starting.catch(()=>{});
  const existing=listener;listener=null;
  if(existing)await existing.end().catch(()=>{});
}
