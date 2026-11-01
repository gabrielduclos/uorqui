import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getPool } from './db/client.js';

type SessionReader=(request:FastifyRequest)=>Promise<{user:{id:string}}|null>;
const uuid={type:'string',format:'uuid'} as const;
const params={type:'object',required:['id','channelId'],additionalProperties:false,properties:{id:uuid,channelId:uuid}};
const paramsSession={type:'object',required:['id','channelId','sessionId'],additionalProperties:false,properties:{id:uuid,channelId:uuid,sessionId:uuid}};
const joinBody={type:'object',required:['sessionId'],additionalProperties:false,properties:{sessionId:uuid}};
const heartbeatBody={type:'object',required:['sessionId','muted'],additionalProperties:false,properties:{sessionId:uuid,muted:{type:'boolean'}}};
const stateQuery={type:'object',required:['sessionId'],additionalProperties:false,properties:{sessionId:uuid,after:{type:'string',pattern:'^[0-9]{1,16}$'}}};
const signalBody={type:'object',additionalProperties:false,required:['sessionId','recipientSessionId','kind','payload'],
  properties:{sessionId:uuid,recipientSessionId:uuid,kind:{type:'string',enum:['offer','answer','candidate']},payload:{type:'object'}}};
const noCache='private, no-store';
const allowedOrigin=(r:FastifyRequest)=>r.headers.origin===(process.env.WEB_ORIGIN??'http://localhost:5173');
const activePresence="s.last_seen_at > now()-interval '45 seconds'";
const voiceAccess='SELECT 1 FROM community_channels c JOIN community_members m ON m.community_id=c.community_id AND m.user_id=$3 '+
  "WHERE c.id=$1 AND c.community_id=$2 AND c.kind='voice' LIMIT 1";

async function rtcConfig():Promise<{iceServers:unknown[],relayAvailable:boolean}>{
  const stun=[{urls:['stun:stun.cloudflare.com:3478']}];
  const key=process.env.CLOUDFLARE_TURN_KEY_ID,secret=process.env.CLOUDFLARE_TURN_API_TOKEN;
  if(!key||!secret)return {iceServers:stun,relayAvailable:false};
  try{
    const response=await fetch(
      'https://rtc.live.cloudflare.com/v1/turn/keys/'+encodeURIComponent(key)+'/credentials/generate-ice-servers',
      {method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},
        body:JSON.stringify({ttl:3600}),signal:AbortSignal.timeout(5000)},
    );
    if(!response.ok)throw Error('TURN unavailable');
    const result=await response.json() as {iceServers?:unknown[]};
    if(!Array.isArray(result.iceServers)||!result.iceServers.length)throw Error('TURN credentials missing');
    return {iceServers:result.iceServers,relayAvailable:true};
  }catch{
    // Do not leak TURN keys or provider errors; clients surface fallback limitations.
    return {iceServers:stun,relayAvailable:false};
  }
}
async function self(request:FastifyRequest,reader:SessionReader){
  const session=await reader(request);
  if(!session)return null;
  const r=await getPool().query('SELECT id FROM users WHERE id=$1',[session.user.id]);
  return (r.rows[0]?.id as string|undefined)??null;
}
async function authorized(id:string,channelId:string,userId:string){
  const result=await getPool().query(voiceAccess,[channelId,id,userId]);
  return !!result.rowCount;
}
async function roomPeers(channelId:string,me:string,sessionId:string){
  const result=await getPool().query(
    'SELECT s.id AS "sessionId",u.handle,'+
    'CASE WHEN p.is_public=true OR s.user_id=$2 OR f.status=\'accepted\' THEN p.display_name ELSE u.handle END AS "displayName",'+
    "CASE WHEN (p.is_public=true OR s.user_id=$2 OR f.status='accepted') AND NOT EXISTS ("+
    'SELECT 1 FROM user_blocks b WHERE (b.blocker_id=s.user_id AND b.blocked_id=$2) OR (b.blocker_id=$2 AND b.blocked_id=s.user_id)) '+
    'THEN p.avatar_url ELSE NULL END AS "avatarUrl",s.muted,s.joined_at AS "joinedAt" '+
    'FROM community_voice_sessions s JOIN users u ON u.id=s.user_id JOIN profiles p ON p.user_id=s.user_id '+
    'JOIN community_channels c ON c.id=s.channel_id JOIN community_members m ON m.community_id=c.community_id AND m.user_id=s.user_id '+
    'LEFT JOIN user_friendships f ON f.user_a_id=LEAST(s.user_id,$2::uuid) AND f.user_b_id=GREATEST(s.user_id,$2::uuid) '+
    'WHERE s.channel_id=$1 AND '+activePresence+' '+
    'AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id=s.user_id AND b.blocked_id=$2) '+
    'OR (b.blocker_id=$2 AND b.blocked_id=s.user_id)) ORDER BY s.joined_at,s.id LIMIT 8',
    [channelId,me],
  );
  return result.rows.map(peer=>({...peer,isSelf:peer.sessionId===sessionId}));
}
export function registerCommunityVoiceRoutes(app:FastifyInstance,readSession:SessionReader){
  app.post('/api/v1/communities/:id/channels/:channelId/voice/join',{schema:{params,body:joinBody}},async(request,reply)=>{
    if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request,readSession);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,channelId}=request.params as {id:string;channelId:string};
      const {sessionId}=request.body as {sessionId:string};
      const client=await getPool().connect();
      try{
        await client.query('BEGIN');
        // Serialize the per-room capacity check and seat acquisition.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,54321))',[channelId]);
        const ok=await client.query(voiceAccess,[channelId,id,me]);
        if(!ok.rowCount){await client.query('ROLLBACK');return reply.code(403).send({error:'MEMBERS_ONLY'});}
        await client.query("DELETE FROM community_voice_sessions WHERE last_seen_at < now()-interval '45 seconds'");
        await client.query("DELETE FROM community_voice_signals WHERE created_at < now()-interval '3 minutes'");
        const seats=await client.query('SELECT user_id FROM community_voice_sessions WHERE channel_id=$1',[channelId]);
        if(seats.rows.length>=6&&!seats.rows.some(row=>row.user_id===me)){
          await client.query('ROLLBACK');return reply.code(409).send({error:'VOICE_ROOM_FULL'});
        }
        await client.query(
          'INSERT INTO community_voice_sessions(id,channel_id,user_id) VALUES($1,$2,$3) '+
          'ON CONFLICT(channel_id,user_id) DO UPDATE SET id=EXCLUDED.id,muted=false,joined_at=now(),last_seen_at=now()',
          [sessionId,channelId,me]);
        await client.query('COMMIT');
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
      return reply.header('Cache-Control',noCache).send({
        sessionId,peers:await roomPeers(channelId,me,sessionId),rtc:await rtcConfig(),maxParticipants:6,
      });
    }catch(error){request.log.error({err:error},'Join voice room');return reply.code(503).send({error:'Unavailable'});}
  });

  app.get('/api/v1/communities/:id/channels/:channelId/voice/state',{schema:{params,querystring:stateQuery}},async(request,reply)=>{
    try{
      const me=await self(request,readSession);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,channelId}=request.params as {id:string;channelId:string};
      const {sessionId,after='0'}=request.query as {sessionId:string;after?:string};
      if(!await authorized(id,channelId,me))return reply.code(403).send({error:'MEMBERS_ONLY'});
      const found=await getPool().query(
        "SELECT 1 FROM community_voice_sessions WHERE id=$1 AND channel_id=$2 AND user_id=$3 AND last_seen_at>now()-interval '45 seconds'",
        [sessionId,channelId,me]);
      if(!found.rowCount)return reply.code(410).send({error:'VOICE_SESSION_ENDED'});
      const cursor=Number(after);
      if(!Number.isSafeInteger(cursor)||cursor<0)return reply.code(400).send({error:'Invalid cursor'});
      const result=await getPool().query(
        "SELECT sig.id::text,sig.sender_session_id AS \"senderSessionId\",sig.kind,sig.payload FROM community_voice_signals sig "+
        "JOIN community_voice_sessions source ON source.id=sig.sender_session_id AND source.channel_id=sig.channel_id "+
        "JOIN community_voice_sessions target ON target.id=sig.recipient_session_id AND target.channel_id=sig.channel_id "+
        "JOIN community_channels channel ON channel.id=sig.channel_id "+
        "JOIN community_members source_member ON source_member.community_id=channel.community_id AND source_member.user_id=source.user_id "+
        "JOIN community_members target_member ON target_member.community_id=channel.community_id AND target_member.user_id=target.user_id "+
        "WHERE sig.channel_id=$1 AND sig.recipient_session_id=$2 AND sig.id>$3 AND sig.created_at>now()-interval '3 minutes' "+
        "AND source.last_seen_at>now()-interval '45 seconds' "+
        "AND NOT EXISTS (SELECT 1 FROM user_blocks block WHERE (block.blocker_id=source.user_id AND block.blocked_id=target.user_id) "+
        "OR (block.blocker_id=target.user_id AND block.blocked_id=source.user_id)) ORDER BY sig.id ASC LIMIT 150",
        [channelId,sessionId,cursor],
      );
      return reply.header('Cache-Control',noCache).send({
        peers:await roomPeers(channelId,me,sessionId),signals:result.rows,
        cursor:result.rows.at(-1)?.id??after,
      });
    }catch(error){request.log.error({err:error},'Read voice room');return reply.code(503).send({error:'Unavailable'});}
  });

  app.post('/api/v1/communities/:id/channels/:channelId/voice/heartbeat',{schema:{params,body:heartbeatBody}},async(request,reply)=>{
    if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request,readSession);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,channelId}=request.params as {id:string;channelId:string};
      const {sessionId,muted}=request.body as {sessionId:string;muted:boolean};
      const result=await getPool().query(
        'UPDATE community_voice_sessions s SET last_seen_at=now(),muted=$4 '+
        'FROM community_channels c JOIN community_members m ON m.community_id=c.community_id AND m.user_id=$3 '+
        "WHERE s.id=$1 AND s.channel_id=$2 AND s.user_id=$3 AND c.id=$2 AND c.community_id=$5 AND c.kind='voice' AND s.last_seen_at>now()-interval '45 seconds' RETURNING s.id",
        [sessionId,channelId,me,muted,id]);
      if(!result.rowCount)return reply.code(410).send({error:'VOICE_SESSION_ENDED'});
      return reply.header('Cache-Control',noCache).send({ok:true});
    }catch(error){request.log.error({err:error},'Voice heartbeat');return reply.code(503).send({error:'Unavailable'});}
  });

  app.post('/api/v1/communities/:id/channels/:channelId/voice/signal',{schema:{params,body:signalBody}},async(request,reply)=>{
    if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request,readSession);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,channelId}=request.params as {id:string;channelId:string};
      const {sessionId,recipientSessionId,kind,payload}=request.body as {
        sessionId:string;recipientSessionId:string;kind:'offer'|'answer'|'candidate';payload:Record<string,unknown>;
      };
      if(sessionId===recipientSessionId)return reply.code(400).send({error:'Invalid target'});
      const payloadText=JSON.stringify(payload);
      if(payloadText.length>24000||!payloadText.length)return reply.code(400).send({error:'Invalid signal'});
      if(kind==='candidate'){
        if(typeof payload.candidate!=='string'||payload.candidate.length>2000)return reply.code(400).send({error:'Invalid ICE candidate'});
      }else if(payload.type!==kind||typeof payload.sdp!=='string'||payload.sdp.length>18000)
        return reply.code(400).send({error:'Invalid SDP'});
      const limit=await getPool().query(
        "SELECT COUNT(*)::int AS n FROM community_voice_signals WHERE sender_session_id=$1 AND created_at>now()-interval '1 minute'",
        [sessionId]);
      if(Number(limit.rows[0].n)>=300)return reply.code(429).send({error:'VOICE_RATE_LIMIT'});
      const result=await getPool().query(
        'INSERT INTO community_voice_signals(channel_id,sender_session_id,recipient_session_id,kind,payload) '+
        'SELECT s.channel_id,s.id,t.id,$4,$5::jsonb FROM community_voice_sessions s '+
        'JOIN community_channels c ON c.id=s.channel_id '+
        'JOIN community_members mine ON mine.community_id=c.community_id AND mine.user_id=s.user_id '+
        'JOIN community_voice_sessions t ON t.channel_id=s.channel_id AND t.id=$3 '+
        'JOIN community_members theirs ON theirs.community_id=c.community_id AND theirs.user_id=t.user_id '+
        'WHERE s.id=$1 AND s.channel_id=$2 AND s.user_id=$6 AND c.community_id=$7 AND c.kind=\'voice\' '+
        "AND s.last_seen_at>now()-interval '45 seconds' AND t.last_seen_at>now()-interval '45 seconds' "+
        'AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id=s.user_id AND b.blocked_id=t.user_id) '+
        'OR (b.blocker_id=t.user_id AND b.blocked_id=s.user_id)) RETURNING id',
        [sessionId,channelId,recipientSessionId,kind,payloadText,me,id]);
      if(!result.rowCount)return reply.code(404).send({error:'VOICE_PEER_UNAVAILABLE'});
      return reply.code(201).header('Cache-Control',noCache).send({ok:true});
    }catch(error){request.log.error({err:error},'Voice signaling');return reply.code(503).send({error:'Unavailable'});}
  });

  app.delete('/api/v1/communities/:id/channels/:channelId/voice/sessions/:sessionId',
    {schema:{params:paramsSession}},async(request,reply)=>{
      if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
      try{
        const me=await self(request,readSession);if(!me)return reply.code(401).send({error:'Unauthorized'});
        const {id,channelId,sessionId}=request.params as {id:string;channelId:string;sessionId:string};
        await getPool().query(
          'DELETE FROM community_voice_sessions s USING community_channels c '+
          "WHERE s.id=$1 AND s.channel_id=$2 AND s.user_id=$3 AND c.id=s.channel_id AND c.community_id=$4 AND c.kind='voice'",
          [sessionId,channelId,me,id]);
        return reply.code(204).send();
      }catch(error){request.log.error({err:error},'Leave voice room');return reply.code(503).send({error:'Unavailable'});}
    });
}
