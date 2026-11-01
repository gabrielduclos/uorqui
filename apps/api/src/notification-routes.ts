import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getPool } from './db/client.js';
import { publishDmUserEvent } from './dm-events.js';

type SessionReader=(request:FastifyRequest)=>Promise<{user:{id:string}}|null>;
const noCache='private, no-store';
function allowedOrigin(request:FastifyRequest){
  return request.headers.origin===(process.env.WEB_ORIGIN??'http://localhost:5173');
}
export function registerNotificationRoutes(app:FastifyInstance,readSession:SessionReader){
  async function me(request:FastifyRequest){
    const session=await readSession(request);
    if(!session)return null;
    const found=await getPool().query<{id:string}>('SELECT id FROM users WHERE id=$1',[session.user.id]);
    return found.rows[0]?.id??null;
  }
  app.get('/api/v1/notifications',async(request,reply)=>{
    try{
      const id=await me(request);if(!id)return reply.code(401).send({error:'Unauthorized'});
      const [items,count]=await Promise.all([
        getPool().query(
          'SELECT n.id,n.kind,n.target_id AS "targetId",n.created_at AS "createdAt",n.read_at AS "readAt",'+
          'u.handle AS "actorHandle",COALESCE(p.display_name,u.handle) AS "actorName",'+
          'CASE WHEN p.is_public=true OR EXISTS (SELECT 1 FROM user_friendships f WHERE f.status=\'accepted\' '+
          'AND ((f.user_a_id=$1 AND f.user_b_id=n.actor_id) OR (f.user_b_id=$1 AND f.user_a_id=n.actor_id))) '+
          'THEN p.avatar_url ELSE NULL END AS "actorAvatar" '+
          'FROM activity_notifications n JOIN users u ON u.id=n.actor_id LEFT JOIN profiles p ON p.user_id=n.actor_id '+
          'WHERE n.recipient_id=$1 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE '+
          '(b.blocker_id=$1 AND b.blocked_id=n.actor_id) OR (b.blocked_id=$1 AND b.blocker_id=n.actor_id)) '+
          'ORDER BY n.created_at DESC,n.id DESC LIMIT 80',[id]),
        getPool().query(
          'SELECT count(*)::int AS count FROM activity_notifications n WHERE n.recipient_id=$1 AND n.read_at IS NULL '+
          'AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE '+
          '(b.blocker_id=$1 AND b.blocked_id=n.actor_id) OR (b.blocked_id=$1 AND b.blocker_id=n.actor_id))',[id])
      ]);
      return reply.header('Cache-Control',noCache).send({notifications:items.rows,unreadCount:count.rows[0]?.count??0});
    }catch(error){request.log.error({err:error},'Notification inbox');return reply.code(503).send({error:'Notifications unavailable'});}
  });
  app.patch('/api/v1/notifications/:id/read',{schema:{params:{type:'object',required:['id'],additionalProperties:false,
    properties:{id:{type:'string',format:'uuid'}}}}},async(request,reply)=>{
    if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const userId=await me(request);if(!userId)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      const row=await getPool().query('UPDATE activity_notifications SET read_at=COALESCE(read_at,now()) '+
        'WHERE id=$1 AND recipient_id=$2 RETURNING id',[id,userId]);
      if(!row.rowCount)return reply.code(404).send({error:'Notification unavailable'});
      await publishDmUserEvent(userId,'notification').catch(()=>{});
      return reply.header('Cache-Control',noCache).send({read:true});
    }catch(error){request.log.error({err:error},'Mark notification read');return reply.code(503).send({error:'Notifications unavailable'});}
  });
  app.post('/api/v1/notifications/read-all',async(request,reply)=>{
    if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const userId=await me(request);if(!userId)return reply.code(401).send({error:'Unauthorized'});
      await getPool().query('UPDATE activity_notifications SET read_at=now() WHERE recipient_id=$1 AND read_at IS NULL',[userId]);
      await publishDmUserEvent(userId,'notification').catch(()=>{});
      return reply.header('Cache-Control',noCache).send({read:true});
    }catch(error){request.log.error({err:error},'Mark all notifications read');return reply.code(503).send({error:'Notifications unavailable'});}
  });
}
