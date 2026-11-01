import type {FastifyInstance,FastifyRequest} from 'fastify';
import {getPool} from './db/client.js';

type Reader=(r:FastifyRequest)=>Promise<{user:{id:string}}|null>;
const uuid={type:'string',format:'uuid'} as const;
const group={type:'object',required:['id'],additionalProperties:false,properties:{id:uuid}};
const token={type:'object',required:['token'],additionalProperties:false,properties:{token:uuid}};
const cache='private, no-store';
const fromWeb=(r:FastifyRequest)=>r.headers.origin===(process.env.WEB_ORIGIN??'http://localhost:5173');
export function registerCommunityShareRoutes(app:FastifyInstance,session:Reader){
  async function person(r:FastifyRequest){
    const s=await session(r);if(!s)return null;
    return (await getPool().query('SELECT id FROM users WHERE id=$1',[s.user.id])).rows[0]?.id as string|undefined;
  }
  async function role(id:string,me:string){
    const r=await getPool().query('SELECT role FROM community_members WHERE community_id=$1 AND user_id=$2',[id,me]);
    return r.rows[0]?.role as string|undefined;
  }
  app.get('/api/v1/communities/:id/share',{schema:{params:group}},async(r,reply)=>{
    try{
      const me=await person(r);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=r.params as {id:string};
      if(!await role(id,me))return reply.code(403).send({error:'MEMBERS_ONLY'});
      const links=await getPool().query('SELECT id,expires_at AS "expiresAt" FROM community_invite_links WHERE community_id=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1',[id]);
      return reply.header('Cache-Control',cache).send({link:links.rows[0]??null});
    }catch(error){r.log.error({err:error},'Read invite link');return reply.code(503).send({error:'Unavailable'});}
  });
  app.post('/api/v1/communities/:id/share',{schema:{params:group}},async(r,reply)=>{
    if(!fromWeb(r))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await person(r);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=r.params as {id:string},client=await getPool().connect();
      try{
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,66921))',[id]);
        const actor=await client.query('SELECT role FROM community_members WHERE community_id=$1 AND user_id=$2',[id,me]);
        if(!['owner','admin'].includes(actor.rows[0]?.role)){await client.query('ROLLBACK');return reply.code(403).send({error:'ADMIN_REQUIRED'});}
        await client.query('UPDATE community_invite_links SET revoked_at=now() WHERE community_id=$1 AND revoked_at IS NULL',[id]);
        const added=await client.query("INSERT INTO community_invite_links(community_id,created_by_id,expires_at) VALUES($1,$2,now()+interval '30 days') RETURNING id,expires_at AS \"expiresAt\"",[id,me]);
        await client.query('COMMIT');
        return reply.code(201).header('Cache-Control',cache).send({link:added.rows[0]});
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    }catch(error){r.log.error({err:error},'Create invite link');return reply.code(503).send({error:'Unavailable'});}
  });
  app.delete('/api/v1/communities/:id/share',{schema:{params:group}},async(r,reply)=>{
    if(!fromWeb(r))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await person(r);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=r.params as {id:string},client=await getPool().connect();
      try{
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,66921))',[id]);
        const actor=await client.query('SELECT role FROM community_members WHERE community_id=$1 AND user_id=$2',[id,me]);
        if(!['owner','admin'].includes(actor.rows[0]?.role)){await client.query('ROLLBACK');return reply.code(403).send({error:'ADMIN_REQUIRED'});}
        await client.query('UPDATE community_invite_links SET revoked_at=now() WHERE community_id=$1 AND revoked_at IS NULL',[id]);
        await client.query('COMMIT');
        return reply.code(204).send();
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    }catch(error){r.log.error({err:error},'Revoke invite link');return reply.code(503).send({error:'Unavailable'});}
  });
  // Possession of an unexpired token grants access only to a limited landing-page preview.
  app.get('/api/v1/invites/:token',{schema:{params:token}},async(r,reply)=>{
    try{
      const {token:id}=r.params as {token:string};
      const row=await getPool().query('SELECT c.id AS "communityId",c.name,c.description,c.visibility,l.expires_at AS "expiresAt" FROM community_invite_links l JOIN communities c ON c.id=l.community_id WHERE l.id=$1 AND l.revoked_at IS NULL AND l.expires_at>now()',[id]);
      if(!row.rowCount)return reply.code(404).header('Cache-Control',cache).send({error:'INVITE_UNAVAILABLE'});
      return reply.header('Cache-Control',cache).header('X-Robots-Tag','noindex, nofollow').send({community:row.rows[0]});
    }catch(error){r.log.error({err:error},'Invite preview');return reply.code(503).send({error:'Unavailable'});}
  });
  app.post('/api/v1/invites/:token/accept',{schema:{params:token}},async(r,reply)=>{
    if(!fromWeb(r))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await person(r);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {token:id}=r.params as {token:string},client=await getPool().connect();
      try{
        await client.query('BEGIN');
        const link=await client.query('SELECT community_id FROM community_invite_links WHERE id=$1 AND revoked_at IS NULL AND expires_at>now() FOR SHARE',[id]);
        if(!link.rowCount){await client.query('ROLLBACK');return reply.code(410).send({error:'INVITE_UNAVAILABLE'});}
        const communityId=link.rows[0].community_id as string;
        const denied=await client.query('SELECT 1 FROM community_bans WHERE community_id=$1 AND user_id=$2',[communityId,me]);
        if(denied.rowCount){await client.query('ROLLBACK');return reply.code(403).send({error:'COMMUNITY_BANNED'});}
        await client.query("INSERT INTO community_members(community_id,user_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING",[communityId,me]);
        await client.query('DELETE FROM community_join_requests WHERE community_id=$1 AND user_id=$2',[communityId,me]);
        await client.query('COMMIT');
        return reply.header('Cache-Control',cache).send({communityId,status:'member'});
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    }catch(error){r.log.error({err:error},'Redeem community link');return reply.code(503).send({error:'Unavailable'});}
  });
}
