import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getPool } from './db/client.js';

type Reader=(req:FastifyRequest)=>Promise<{user:{id:string}}|null>;
const uuid={type:'string',format:'uuid'} as const;
const idParams={type:'object',required:['id'],additionalProperties:false,properties:{id:uuid}};
const tokenParams={type:'object',required:['token'],additionalProperties:false,properties:{token:uuid}};
const origin=(r:FastifyRequest)=>r.headers.origin===(process.env.WEB_ORIGIN??'http://localhost:5173');

export function registerCommunityInviteLinks(app:FastifyInstance,reader:Reader){
  async function self(req:FastifyRequest){
    const session=await reader(req);if(!session)return null;
    const r=await getPool().query('SELECT id FROM users WHERE id=$1',[session.user.id]);
    return r.rows[0]?.id as string|undefined ?? null;
  }
  async function mod(id:string,me:string){
    const r=await getPool().query(
      "SELECT 1 FROM community_members WHERE community_id=$1 AND user_id=$2 AND role IN ('owner','admin')",[id,me]);
    return !!r.rowCount;
  }
  app.get('/api/v1/communities/:id/share',{schema:{params:idParams}},async(request,reply)=>{
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      const member=await getPool().query('SELECT 1 FROM community_members WHERE community_id=$1 AND user_id=$2',[id,me]);
      if(!member.rowCount)return reply.code(403).send({error:'MEMBERS_ONLY'});
      const r=await getPool().query(
        "SELECT id,expires_at AS \"expiresAt\" FROM community_invite_links WHERE community_id=$1 "+
        'AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1',[id]);
      return reply.header('cache-control','private, no-store').send({link:r.rows[0]??null});
    }catch(error){request.log.error({err:error},'Get community link');return reply.code(503).send({error:'Unavailable'});}
  });
  app.post('/api/v1/communities/:id/share',{schema:{params:idParams}},async(request,reply)=>{
    if(!origin(request))return reply.code(403).send({error:'Invalid origin'});
    try {
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      const client=await getPool().connect();
      try{
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 71777))',[id]);
        const allowed=await client.query(
          "SELECT 1 FROM community_members WHERE community_id=$1 AND user_id=$2 AND role IN ('owner','admin')",[id,me]);
        if(!allowed.rowCount){await client.query('ROLLBACK');return reply.code(403).send({error:'ADMIN_REQUIRED'});}
        // Rotate bearer link: earlier links are revoked immediately.
        await client.query('UPDATE community_invite_links SET revoked_at=now() WHERE community_id=$1 AND revoked_at IS NULL',[id]);
        const r=await client.query(
          "INSERT INTO community_invite_links(community_id,created_by_id,expires_at) VALUES($1,$2,now()+interval '7 days') "+
          'RETURNING id,expires_at AS "expiresAt"',[id,me]);
        await client.query('COMMIT');
        return reply.code(201).header('cache-control','private, no-store').send({link:r.rows[0]});
      }catch(err){await client.query('ROLLBACK');throw err;}finally{client.release();}
    }catch(error){request.log.error({err:error},'Create community link');return reply.code(503).send({error:'Unavailable'});}
  });
  app.delete('/api/v1/communities/:id/share',{schema:{params:idParams}},async(request,reply)=>{
    if(!origin(request))return reply.code(403).send({error:'Invalid origin'});
    try {
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      const r=await getPool().query(
        'UPDATE community_invite_links SET revoked_at=now() WHERE community_id=$1 AND revoked_at IS NULL '+
        "AND EXISTS(SELECT 1 FROM community_members WHERE community_id=$1 AND user_id=$2 AND role IN ('owner','admin')) RETURNING id",
        [id,me]);
      if(!await mod(id,me))return reply.code(403).send({error:'ADMIN_REQUIRED'});
      return reply.header('cache-control','private, no-store').send({revoked:r.rowCount??0});
    }catch(error){request.log.error({err:error},'Revoke community link');return reply.code(503).send({error:'Unavailable'});}
  });
  app.get('/api/v1/community-invites/:token',{schema:{params:tokenParams}},async(request,reply)=>{
    try{
      const {token}=request.params as {token:string};
      const r=await getPool().query(
        'SELECT c.name,c.id AS "communityId",c.visibility,link.expires_at AS "expiresAt" '+
        'FROM community_invite_links link JOIN communities c ON c.id=link.community_id '+
        'WHERE link.id=$1 AND link.revoked_at IS NULL AND link.expires_at>now()',[token]);
      if(!r.rowCount)return reply.code(404).send({error:'INVITE_EXPIRED'});
      return reply.header('cache-control','no-store').send({community:r.rows[0]});
    }catch(error){request.log.error({err:error},'Preview community invite');return reply.code(503).send({error:'Unavailable'});}
  });
  app.post('/api/v1/community-invites/:token/redeem',{schema:{params:tokenParams}},async(request,reply)=>{
    if(!origin(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {token}=request.params as {token:string};
      const client=await getPool().connect();
      try{
        await client.query('BEGIN');
        const link=await client.query(
          'SELECT community_id FROM community_invite_links WHERE id=$1 AND revoked_at IS NULL AND expires_at>now() FOR SHARE',
          [token]);
        if(!link.rowCount){await client.query('ROLLBACK');return reply.code(410).send({error:'INVITE_EXPIRED'});}
        const id=link.rows[0].community_id as string;
        const blocked=await client.query('SELECT 1 FROM community_bans WHERE community_id=$1 AND user_id=$2',[id,me]);
        if(blocked.rowCount){await client.query('ROLLBACK');return reply.code(403).send({error:'COMMUNITY_BANNED'});}
        const exists=await client.query('SELECT 1 FROM community_members WHERE community_id=$1 AND user_id=$2',[id,me]);
        if(!exists.rowCount){
          await client.query(
            "INSERT INTO community_members(community_id,user_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING",
            [id,me]);
        }
        await client.query('DELETE FROM community_join_requests WHERE community_id=$1 AND user_id=$2',[id,me]);
        await client.query('COMMIT');
        return reply.header('cache-control','private, no-store').send({joined:true,communityId:id});
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    }catch(error){request.log.error({err:error},'Redeem community invite');return reply.code(503).send({error:'Unavailable'});}
  });
}
