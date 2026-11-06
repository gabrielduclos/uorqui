import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getPool } from './db/client.js';
import { getAuth } from './auth/auth.js';
import { validRequestOrigin } from './request-origin.js';

type SessionReader=(request:FastifyRequest)=>Promise<{user:{id:string}}|null>;
type MediaCleanupJob={id:string;bucket:'PROFILE_MEDIA'|'DM_ATTACHMENTS';prefix:string};

/** These routes only coordinate cleanups for prefixes recorded during account erasure.
 * Cloudflare's R2 bindings execute the removals, never publicly exposed API inputs.
 */
function validCleanupSignature(request:FastifyRequest):boolean{
  const secret=process.env.DM_ATTACHMENT_PROOF_SECRET;
  const rawMinute=request.headers['x-uorqui-gc-minute'];
  const signature=request.headers['x-uorqui-gc-signature'];
  if(!secret||secret.length<32||typeof rawMinute!=='string'||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature))return false;
  const minute=Number(rawMinute);
  if(!Number.isSafeInteger(minute)||Math.abs(Math.floor(Date.now()/60000)-minute)>1)return false;
  const path=request.url.split('?')[0];
  const signed='uorqui-r2-gc-v1\n'+request.method+'\n'+path+'\n'+minute;
  const expected=createHmac('sha256',secret).update(signed).digest('hex');
  return timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(signature,'hex'));
}

export function registerAccountDeletionRoutes(app:FastifyInstance,readSession:SessionReader){
  app.delete('/api/v1/account/delete',{
    schema:{body:{type:'object',additionalProperties:false,required:['password','confirmation'],properties:{
      password:{type:'string',minLength:1,maxLength:256},
      confirmation:{type:'string',enum:['EXCLUIR']}
    }}}
  },async(request,reply)=>{
    if(!validRequestOrigin(request))return reply.code(403).send({error:'INVALID_ORIGIN'});
    const session=await readSession(request);
    if(!session)return reply.code(401).send({error:'UNAUTHORIZED'});
    const {password}=request.body as {password:string;confirmation:'EXCLUIR'};
    try{
      await getAuth().api.verifyPassword({
        body:{password},
        headers:fromNodeHeaders(request.headers as Parameters<typeof fromNodeHeaders>[0])
      });
    }catch{return reply.code(403).send({error:'INVALID_PASSWORD'});}
    const id=session.user.id;
    const client=await getPool().connect();
    try{
      await client.query('BEGIN');
      const authUser=await client.query<{email:string}>('SELECT email FROM "user" WHERE id=$1 FOR UPDATE',[id]);
      if(!authUser.rowCount){await client.query('ROLLBACK');return reply.code(404).send({error:'ACCOUNT_NOT_FOUND'});}

      const owned=(await client.query<{id:string}>('SELECT id FROM communities WHERE owner_id=$1 FOR UPDATE',[id])).rows;
      const ownedDeleted:string[]=[];
      // Preserve shared communities by handing ownership to an existing member.
      // If the owner is the last member, delete the empty community.
      for(const community of owned){
        const successor=await client.query<{user_id:string}>(
          "SELECT user_id FROM community_members WHERE community_id=$1 AND user_id<>$2 "+
          "ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END, joined_at ASC LIMIT 1",
          [community.id,id]);
        if(successor.rowCount){
          const next=successor.rows[0].user_id;
          await client.query('UPDATE communities SET owner_id=$2 WHERE id=$1',[community.id,next]);
          await client.query("UPDATE community_members SET role='owner' WHERE community_id=$1 AND user_id=$2",[community.id,next]);
        }else{
          ownedDeleted.push(community.id);
        }
      }
      const conversations=(await client.query<{id:string}>(
        'SELECT id FROM direct_conversations WHERE participant_a_id=$1 OR participant_b_id=$1',[id])).rows;
      const authoredAttachments=(await client.query<{community_id:string;channel_id:string;attachment_id:string}>(
        'SELECT ch.community_id,m.channel_id,m.attachment_id FROM community_messages m '+
        'JOIN community_channels ch ON ch.id=m.channel_id WHERE m.author_id=$1 AND m.attachment_id IS NOT NULL',[id])).rows;

      // Queue physical object deletion as part of the SAME transaction. The
      // Worker retries unprocessed prefixes on its scheduled task.
      const jobs=new Map<string,MediaCleanupJob>();
      const queue=(bucket:MediaCleanupJob['bucket'],prefix:string)=>{
        if(prefix&&!jobs.has(bucket+':'+prefix))jobs.set(bucket+':'+prefix,{id:'',bucket,prefix});
      };
      queue('PROFILE_MEDIA','media/profile/'+id+'/');
      for(const c of conversations)queue('DM_ATTACHMENTS','dm/'+c.id+'/');
      for(const a of authoredAttachments)queue('DM_ATTACHMENTS','community/'+a.community_id+'/'+a.channel_id+'/'+a.attachment_id);
      for(const communityId of ownedDeleted){
        queue('PROFILE_MEDIA','media/community/'+communityId+'/');
        queue('DM_ATTACHMENTS','community/'+communityId+'/');
      }
      for(const job of jobs.values()){
        await client.query('INSERT INTO account_media_cleanup_jobs(bucket,prefix) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [job.bucket,job.prefix]);
      }

      // Remove reports containing evidence about erased messages and this user.
      await client.query(
        'DELETE FROM content_reports WHERE reporter_id=$1 OR target_author_id=$1 '+
        'OR (target_kind=\'direct_message\' AND target_id IN '+
          '(SELECT m.id FROM direct_messages m JOIN direct_conversations c ON c.id=m.conversation_id '+
          'WHERE c.participant_a_id=$1 OR c.participant_b_id=$1)) '+
        'OR (target_kind=\'community_message\' AND target_id IN '+
          '(SELECT id FROM community_messages WHERE author_id=$1))',[id]);
      await client.query('DELETE FROM direct_conversations WHERE participant_a_id=$1 OR participant_b_id=$1',[id]);
      // Community voice signals have session ids rather than foreign keys.
      await client.query('DELETE FROM community_voice_signals WHERE sender_session_id IN (SELECT id FROM community_voice_sessions WHERE user_id=$1) OR recipient_session_id IN (SELECT id FROM community_voice_sessions WHERE user_id=$1)',[id]);
      await client.query('DELETE FROM community_messages WHERE author_id=$1',[id]);
      for(const communityId of ownedDeleted)await client.query('DELETE FROM communities WHERE id=$1',[communityId]);
      await client.query('DELETE FROM users WHERE id=$1',[id]);
      await client.query('DELETE FROM verification WHERE identifier=$1',[authUser.rows[0].email]);
      await client.query('DELETE FROM "user" WHERE id=$1',[id]);
      await client.query('COMMIT');
      return reply.header('Cache-Control','no-store').send({deleted:true,mediaCleanupQueued:jobs.size>0});
    }catch(error){
      await client.query('ROLLBACK').catch(()=>{});
      request.log.error({err:error},'Delete account and associated data');
      return reply.code(503).send({error:'ACCOUNT_DELETE_FAILED'});
    }finally{client.release();}
  });

  app.get('/api/v1/internal/r2-gc',async(request,reply)=>{
    if(!validCleanupSignature(request))return reply.code(403).send({error:'Forbidden'});
    try{
      const jobs=await getPool().query<MediaCleanupJob>(
        'SELECT id,bucket,prefix FROM account_media_cleanup_jobs WHERE completed_at IS NULL ORDER BY created_at ASC LIMIT 8');
      return reply.header('Cache-Control','no-store').send({jobs:jobs.rows});
    }catch{return reply.code(503).send({error:'Unavailable'});}
  });

  app.post('/api/v1/internal/r2-gc/:id/complete',{
    schema:{params:{type:'object',required:['id'],additionalProperties:false,
      properties:{id:{type:'string',format:'uuid'}}}}
  },async(request,reply)=>{
    if(!validCleanupSignature(request))return reply.code(403).send({error:'Forbidden'});
    const {id}=request.params as {id:string};
    try{
      await getPool().query('UPDATE account_media_cleanup_jobs SET completed_at=now() WHERE id=$1',[id]);
      return reply.header('Cache-Control','no-store').send({ok:true});
    }catch{return reply.code(503).send({error:'Unavailable'});}
  });
}
