import { getPool } from './db/client.js';
import { publishDmUserEvent } from './dm-events.js';
import { pushActivityNotification } from './push-routes.js';

export type ActivityKind = 'post_like'|'post_comment'|'friend_request'|'friend_accepted'|'follow';

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

export async function recordPostActivity(postId:string,actorId:string,
  kind:'post_like'|'post_comment',eventKey:string):Promise<void>{
  const result=await getPool().query<{author_id:string}>(
    'SELECT author_id FROM feed_posts WHERE id=$1 AND published_at IS NOT NULL AND deleted_at IS NULL',[postId]);
  if(result.rows.length)await recordActivity(result.rows[0].author_id,actorId,kind,postId,eventKey);
}
