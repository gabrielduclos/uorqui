import { getPool } from './db/client.js';
import { publishDmUserEvent } from './dm-events.js';
import { pushActivityNotification } from './push-routes.js';

export type ActivityKind = 'friend_request'|'friend_accepted'|'community_join_request'|'meeting_join_request';

/** Persist only server-verified relationships; do not expose blocked users. */
export async function recordActivity(recipientId:string,actorId:string,kind:ActivityKind,
  targetId:string,eventKey:string):Promise<void>{
  if(recipientId===actorId)return;
  const result=await getPool().query<{id:string}>(
    'INSERT INTO activity_notifications(recipient_id,actor_id,kind,target_id,event_key) '+
    'SELECT $1,$2,$3,$4,$5 WHERE $1::uuid<>$2::uuid AND NOT EXISTS ('+
    'SELECT 1 FROM user_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=$2) OR (b.blocker_id=$2 AND b.blocked_id=$1)) '+
    'ON CONFLICT (event_key) DO NOTHING RETURNING id',
    [recipientId,actorId,kind,targetId,eventKey]);
  if(!result.rows.length)return;
  await publishDmUserEvent(recipientId,'notification').catch(()=>{});
  // Delivery is best-effort and never delays the interaction that created the event.
  void pushActivityNotification(result.rows[0].id).catch(()=>{});
}


/** Fan out a verified community/meeting request to owners and admins. */
export async function recordCommunityRequest(communityId:string,actorId:string,
  kind:'community_join_request'|'meeting_join_request',targetId:string,eventKey:string){
  const managers=await getPool().query<{user_id:string}>(
    "SELECT user_id FROM community_members WHERE community_id=$1 AND role IN ('owner','admin') AND user_id<>$2",
    [communityId,actorId]);
  await Promise.allSettled(managers.rows.map(manager=>
    recordActivity(manager.user_id,actorId,kind,targetId,eventKey+':'+manager.user_id)));
}
