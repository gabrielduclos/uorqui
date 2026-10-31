import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getPool } from './db/client.js';
import { publishDmUserEvent } from './dm-events.js';

type SessionReader = (request: FastifyRequest) => Promise<{ user: { id: string } } | null>;
const handle = { type:'string',pattern:'^[a-z][a-z0-9_]{2,31}$' } as const;
const params = {type:'object',required:['handle'],additionalProperties:false,properties:{handle}};
const body = {type:'object',required:['handle'],additionalProperties:false,properties:{handle}};
function allowedOrigin(request:FastifyRequest) {return request.headers.origin === (process.env.WEB_ORIGIN ?? 'http://localhost:5173');}
async function notify(a:string,b:string) {
  // Generic updates don't disclose a block, only signal clients to refresh permissions.
  await Promise.all([a,b].map(id=>publishDmUserEvent(id,'friendship-update'))).catch(()=>{});
}
export function registerBlockRoutes(app:FastifyInstance, readSession:SessionReader) {
  async function me(request:FastifyRequest) {
    const session=await readSession(request);
    if(!session)return null;
    const r=await getPool().query('SELECT id FROM users WHERE id=$1',[session.user.id]);
    return (r.rows[0]?.id as string|undefined)??null;
  }
  app.get('/api/v1/blocks',async(request,reply)=>{
    try {
      const self=await me(request);if(!self)return reply.code(401).send({error:'Unauthorized'});
      const r=await getPool().query(
        'SELECT u.handle,p.display_name AS "displayName",b.created_at AS "blockedAt" '+
        'FROM user_blocks b JOIN users u ON u.id=b.blocked_id JOIN profiles p ON p.user_id=u.id '+
        'WHERE b.blocker_id=$1 ORDER BY lower(p.display_name),u.handle LIMIT 1000',[self]);
      // No avatar, cover or other private profile data; blocked accounts stay hidden.
      return reply.header('Cache-Control','private, no-store').send({blocked:r.rows});
    }catch(error){request.log.error({err:error},'List blocked accounts');return reply.code(503).send({error:'Unavailable'});}
  });

  app.post('/api/v1/blocks',{schema:{body}},async(request,reply)=>{
    if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const self=await me(request);if(!self)return reply.code(401).send({error:'Unauthorized'});
      const {handle:h}=request.body as {handle:string};
      const target=await getPool().query('SELECT id FROM users WHERE handle=$1 AND id<>$2 LIMIT 1',[h,self]);
      if(!target.rowCount)return reply.code(404).send({error:'Account unavailable'});
      const other=target.rows[0].id as string;
      const pool=getPool();const client=await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('INSERT INTO user_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[self,other]);
        // A block severs accepted friendships and pending invitations permanently.
        await client.query(
          "UPDATE user_friendships SET status='canceled',updated_at=now() "+
          "WHERE user_a_id=LEAST($1::uuid,$2::uuid) AND user_b_id=GREATEST($1::uuid,$2::uuid) "+
          "AND status IN ('pending','accepted')",[self,other]);
        await client.query('COMMIT');
      }catch(error){await client.query('ROLLBACK');throw error;}
      finally{client.release();}
      await notify(self,other);
      return reply.header('Cache-Control','private, no-store').send({blocked:true,handle:h});
    }catch(error){request.log.error({err:error},'Block account');return reply.code(503).send({error:'Unavailable'});}
  });

  app.delete('/api/v1/blocks/:handle',{schema:{params}},async(request,reply)=>{
    if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
    try {
      const self=await me(request);if(!self)return reply.code(401).send({error:'Unauthorized'});
      const {handle:h}=request.params as {handle:string};
      const result=await getPool().query(
        'DELETE FROM user_blocks b USING users u WHERE b.blocker_id=$1 AND b.blocked_id=u.id AND u.handle=$2 RETURNING u.id',[self,h]);
      if(result.rowCount)await notify(self,result.rows[0].id);
      return reply.header('Cache-Control','private, no-store').code(204).send();
    }catch(error){request.log.error({err:error},'Unblock account');return reply.code(503).send({error:'Unavailable'});}
  });
}
