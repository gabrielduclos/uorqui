import type {FastifyInstance,FastifyRequest} from 'fastify';
import {getPool} from './db/client.js';
import {publishCommunityEvent} from './community-events.js';
import {recordCommunityRequest} from './activity-notifications.js';

type SessionReader=(request:FastifyRequest)=>Promise<{user:{id:string}}|null>;
const uuid={type:'string',format:'uuid'} as const;
const params={type:'object',additionalProperties:false,required:['id','channelId'],properties:{id:uuid,channelId:uuid}};
const decisionParams={type:'object',additionalProperties:false,required:['id','channelId','handle'],properties:{id:uuid,channelId:uuid,handle:{type:'string',pattern:'^[a-z][a-z0-9_]{2,31}$'}}};
const originValid=(r:FastifyRequest)=>r.headers.origin===(process.env.WEB_ORIGIN??'http://localhost:5173');
const headers='private, no-store';

export function registerCommunityMeetingRoutes(app:FastifyInstance,session:SessionReader){
  async function identity(request:FastifyRequest){
    const current=await session(request);
    if(!current)return null;
    const r=await getPool().query('SELECT id FROM users WHERE id=$1',[current.user.id]);
    return r.rows[0]?.id as string|undefined??null;
  }
  async function context(id:string,channelId:string,userId:string){
    const r=await getPool().query(
      'SELECT ch.id,ch.meeting_join_policy AS "policy",m.role '+
      'FROM community_channels ch JOIN community_members m ON m.community_id=ch.community_id AND m.user_id=$3 '+
      "WHERE ch.id=$2 AND ch.community_id=$1 AND ch.kind='meeting' "+
      "AND (ch.password_hash IS NULL OR m.role IN ('owner','admin') OR EXISTS "+
      "(SELECT 1 FROM community_channel_password_access access WHERE access.channel_id=ch.id AND access.user_id=$3)) "+
      "AND (ch.access_mode='open' OR m.role IN ('owner','admin') OR EXISTS "+
      "(SELECT 1 FROM community_channel_member_access access WHERE access.channel_id=ch.id AND access.user_id=$3)) "+
      "AND NOT EXISTS "+
      '(SELECT 1 FROM community_bans b WHERE b.community_id=$1 AND b.user_id=$3)',
      [id,channelId,userId]);
    return r.rows[0] as {id:string;policy:'open'|'approval';role:'owner'|'admin'|'moderator'|'member'}|undefined;
  }
  const canManage=(role:string)=>role==='owner'||role==='admin';
  app.get('/api/v1/communities/:id/channels/:channelId/meeting',{schema:{params}},async(request,reply)=>{
    try{
      const me=await identity(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,channelId}=request.params as {id:string;channelId:string};
      const room=await context(id,channelId,me);if(!room)return reply.code(404).send({error:'Meeting unavailable'});
      const manager=canManage(room.role);
      const own=await getPool().query('SELECT status FROM meeting_access_requests WHERE channel_id=$1 AND user_id=$2',[channelId,me]);
      const pending=manager?await getPool().query(
        "SELECT u.handle,COALESCE(p.display_name,u.handle) AS \"displayName\" FROM meeting_access_requests r "+
        'JOIN users u ON u.id=r.user_id JOIN profiles p ON p.user_id=u.id '+
        "WHERE r.channel_id=$1 AND r.status='pending' ORDER BY r.requested_at LIMIT 30",[channelId]):{rows:[]};
      return reply.header('Cache-Control',headers).send({policy:room.policy,manager,status:manager||room.policy==='open'?'approved':own.rows[0]?.status??'none',pending:pending.rows});
    }catch(error){request.log.error({err:error},'Read meeting policy');return reply.code(503).send({error:'Meeting unavailable'});}
  });

  app.put('/api/v1/communities/:id/channels/:channelId/meeting/policy',{schema:{params,body:{type:'object',additionalProperties:false,required:['policy'],properties:{policy:{type:'string',enum:['open','approval']}}}}},async(request,reply)=>{
    if(!originValid(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await identity(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,channelId}=request.params as {id:string;channelId:string};
      const room=await context(id,channelId,me);
      if(!room||!canManage(room.role))return reply.code(403).send({error:'Managers only'});
      const {policy}=request.body as {policy:'open'|'approval'};
      await getPool().query("UPDATE community_channels SET meeting_join_policy=$1 WHERE id=$2 AND community_id=$3 AND kind='meeting'",[policy,channelId,id]);
      if(policy==='approval'){
        // Revokes sessions admitted during public mode if they have no approval.
        await getPool().query(
          'DELETE FROM community_voice_sessions v USING community_members m '+
          'WHERE v.channel_id=$1 AND m.community_id=$2 AND m.user_id=v.user_id '+
          "AND m.role NOT IN ('owner','admin') AND NOT EXISTS "+
          "(SELECT 1 FROM meeting_access_requests r WHERE r.channel_id=$1 AND r.user_id=v.user_id AND r.status='approved')",
          [channelId,id]);
      }
      void publishCommunityEvent(id,channelId,'voice').catch(()=>{});
      return reply.header('Cache-Control',headers).send({policy});
    }catch(error){request.log.error({err:error},'Set meeting policy');return reply.code(503).send({error:'Unavailable'});}
  });

  app.post('/api/v1/communities/:id/channels/:channelId/meeting/requests',{schema:{params}},async(request,reply)=>{
    if(!originValid(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await identity(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,channelId}=request.params as {id:string;channelId:string};
      const room=await context(id,channelId,me);if(!room)return reply.code(403).send({error:'MEMBERS_ONLY'});
      if(room.policy==='open'||canManage(room.role))return reply.header('Cache-Control',headers).send({status:'approved'});
      const existing=await getPool().query('SELECT status,updated_at FROM meeting_access_requests WHERE channel_id=$1 AND user_id=$2',[channelId,me]);
      if(existing.rows[0]?.status==='approved'||existing.rows[0]?.status==='pending')
        return reply.header('Cache-Control',headers).send({status:existing.rows[0].status});
      if(existing.rows[0]?.status==='declined' && Date.now()-new Date(existing.rows[0].updated_at).getTime()<60*60*1000)
        return reply.code(429).send({error:'REQUEST_COOLDOWN'});
      const result=await getPool().query(
        "INSERT INTO meeting_access_requests(channel_id,user_id,status) VALUES($1,$2,'pending') "+
        "ON CONFLICT(channel_id,user_id) DO UPDATE SET status='pending',requested_at=now(),updated_at=now() RETURNING requested_at",
        [channelId,me]);
      const when=new Date(result.rows[0].requested_at).getTime();
      await recordCommunityRequest(id,me,'meeting_join_request',channelId,'meeting-request:'+channelId+':'+me+':'+when)
        .catch(e=>request.log.warn({err:e},'Meeting approval push'));
      void publishCommunityEvent(id,channelId,'voice').catch(()=>{});
      return reply.code(201).header('Cache-Control',headers).send({status:'pending'});
    }catch(error){request.log.error({err:error},'Request meeting access');return reply.code(503).send({error:'Unavailable'});}
  });

  app.post('/api/v1/communities/:id/channels/:channelId/meeting/requests/:handle/:decision',{schema:{
    params:{type:'object',additionalProperties:false,required:['id','channelId','handle','decision'],properties:{
      ...decisionParams.properties,decision:{type:'string',enum:['approve','decline']}}}
  }},async(request,reply)=>{
    if(!originValid(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await identity(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,channelId,handle,decision}=request.params as {id:string;channelId:string;handle:string;decision:'approve'|'decline'};
      const room=await context(id,channelId,me);
      if(!room||!canManage(room.role))return reply.code(403).send({error:'Managers only'});
      const changed=await getPool().query(
        'UPDATE meeting_access_requests SET status=$1,updated_at=now() '+
        "WHERE channel_id=$2 AND user_id=(SELECT id FROM users WHERE handle=$3) AND status='pending' RETURNING user_id",
        [decision==='approve'?'approved':'declined',channelId,handle]);
      if(!changed.rowCount)return reply.code(404).send({error:'No pending request'});
      if(decision==='decline')await getPool().query('DELETE FROM community_voice_sessions WHERE channel_id=$1 AND user_id=$2',[channelId,changed.rows[0].user_id]);
      void publishCommunityEvent(id,channelId,'voice').catch(()=>{});
      return reply.header('Cache-Control',headers).send({status:decision==='approve'?'approved':'declined'});
    }catch(error){request.log.error({err:error},'Decide meeting access');return reply.code(503).send({error:'Unavailable'});}
  });
}
