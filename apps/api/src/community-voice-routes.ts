import { validRequestOrigin as allowedOrigin } from './request-origin.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getPool } from './db/client.js';
import {publishCommunityEvent} from './community-events.js';

type SessionReader=(request:FastifyRequest)=>Promise<{user:{id:string}}|null>;
const uuid={type:'string',format:'uuid'} as const;
const params={type:'object',required:['id','channelId'],additionalProperties:false,properties:{id:uuid,channelId:uuid}};
const paramsSession={type:'object',required:['id','channelId','sessionId'],additionalProperties:false,properties:{id:uuid,channelId:uuid,sessionId:uuid}};
const joinBody={type:'object',required:['sessionId'],additionalProperties:false,properties:{sessionId:uuid}};
const heartbeatBody={type:'object',required:['sessionId','muted'],additionalProperties:false,properties:{sessionId:uuid,muted:{type:'boolean'},deafened:{type:'boolean'}}};
const stateQuery={type:'object',required:['sessionId'],additionalProperties:false,properties:{sessionId:uuid,after:{type:'string',pattern:'^[0-9]{1,16}$'}}};
const signalBody={type:'object',additionalProperties:false,required:['sessionId','recipientSessionId','kind','payload'],
  properties:{sessionId:uuid,recipientSessionId:uuid,kind:{type:'string',enum:['offer','answer','candidate']},payload:{type:'object'}}};
const noCache='private, no-store';

// Allow a short mobile/tab suspension without expiring an otherwise active call.
// Explicit leave still removes the session immediately.
const activePresence="s.last_seen_at > now()-interval '180 seconds'";
const voiceAccess='SELECT 1 FROM community_channels c JOIN community_members m ON m.community_id=c.community_id AND m.user_id=$3 '+
  "WHERE c.id=$1 AND c.community_id=$2 AND c.kind IN ('voice','meeting') AND (c.password_hash IS NULL OR m.role IN ('owner','admin') OR EXISTS (SELECT 1 FROM community_channel_password_access grant_access WHERE grant_access.channel_id=c.id AND grant_access.user_id=$3)) "+
  "AND (c.access_mode='open' OR m.role IN ('owner','admin') OR EXISTS (SELECT 1 FROM community_channel_member_access grant_access WHERE grant_access.channel_id=c.id AND grant_access.user_id=$3)) LIMIT 1";

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
    'THEN p.avatar_url ELSE NULL END AS "avatarUrl",s.muted,s.deafened,s.joined_at AS "joinedAt" '+
    'FROM community_voice_sessions s JOIN users u ON u.id=s.user_id JOIN profiles p ON p.user_id=s.user_id '+
    'JOIN community_channels c ON c.id=s.channel_id JOIN community_members m ON m.community_id=c.community_id AND m.user_id=s.user_id '+
    'LEFT JOIN user_friendships f ON f.user_a_id=LEAST(s.user_id,$2::uuid) AND f.user_b_id=GREATEST(s.user_id,$2::uuid) '+
    "WHERE s.channel_id=$1 AND (c.kind<>'meeting' OR c.meeting_expires_at>now()) AND (c.access_mode='open' OR m.role IN ('owner','admin') OR EXISTS (SELECT 1 FROM community_channel_member_access grant_access WHERE grant_access.channel_id=c.id AND grant_access.user_id=s.user_id)) AND "+activePresence+' '+
    'AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id=s.user_id AND b.blocked_id=$2) '+
    'OR (b.blocker_id=$2 AND b.blocked_id=s.user_id)) ORDER BY s.joined_at,s.id LIMIT 8',
    [channelId,me],
  );
  return result.rows.map(peer=>({...peer,isSelf:peer.sessionId===sessionId}));
}
export function registerCommunityVoiceRoutes(app:FastifyInstance,readSession:SessionReader){
  // Show active voice-room occupants on the community's main channel list.
  // Unlike /voice/state, this endpoint does not require joining an audio room.
  // Only members can see presence, and private identities/blocks are redacted
  // with the same rules as the authenticated WebRTC room roster.
  app.get('/api/v1/communities/:id/voice/presence',{
    schema:{params:{type:'object',required:['id'],additionalProperties:false,properties:{id:uuid}}}
  },async(request,reply)=>{
    try{
      const me=await self(request,readSession);
      if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      const allowed=await getPool().query(
        'SELECT 1 FROM community_members WHERE community_id=$1 AND user_id=$2',[id,me]);
      if(!allowed.rowCount)return reply.code(403).send({error:'MEMBERS_ONLY'});
      const result=await getPool().query(
        'SELECT s.channel_id AS "channelId",s.id AS "sessionId",u.handle,'+
        "CASE WHEN p.is_public=true OR s.user_id=$2 OR f.status='accepted' THEN p.display_name ELSE u.handle END AS \"displayName\","+
        "CASE WHEN p.is_public=true OR s.user_id=$2 OR f.status='accepted' THEN p.avatar_url ELSE NULL END AS \"avatarUrl\","+
        's.muted,s.deafened,(s.user_id=$2) AS "isSelf" '+
        'FROM community_voice_sessions s '+
        'JOIN community_channels ch ON ch.id=s.channel_id '+
        'JOIN community_members present ON present.community_id=ch.community_id AND present.user_id=s.user_id '+
        'JOIN users u ON u.id=s.user_id JOIN profiles p ON p.user_id=s.user_id '+
        'LEFT JOIN user_friendships f ON f.user_a_id=LEAST(s.user_id,$2::uuid) AND f.user_b_id=GREATEST(s.user_id,$2::uuid) '+
        "WHERE ch.community_id=$1 AND ch.kind IN ('voice','meeting') AND (ch.password_hash IS NULL OR EXISTS (SELECT 1 FROM community_members viewer WHERE viewer.community_id=ch.community_id AND viewer.user_id=$2 AND viewer.role IN ('owner','admin')) OR EXISTS (SELECT 1 FROM community_channel_password_access g WHERE g.channel_id=ch.id AND g.user_id=$2)) "+
        "AND (ch.access_mode='open' OR EXISTS (SELECT 1 FROM community_members viewer WHERE viewer.community_id=ch.community_id AND viewer.user_id=$2 AND viewer.role IN ('owner','admin')) OR EXISTS (SELECT 1 FROM community_channel_member_access g WHERE g.channel_id=ch.id AND g.user_id=$2)) "+
        "AND (ch.kind<>'meeting' OR ch.meeting_expires_at>now()) AND (ch.access_mode='open' OR present.role IN ('owner','admin') OR EXISTS (SELECT 1 FROM community_channel_member_access g WHERE g.channel_id=ch.id AND g.user_id=s.user_id)) AND "+activePresence+' '+
        'AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE '+
        '(b.blocker_id=s.user_id AND b.blocked_id=$2) OR (b.blocker_id=$2 AND b.blocked_id=s.user_id)) '+
        'ORDER BY s.channel_id,s.joined_at,s.id LIMIT 300',[id,me]);
      const rooms:Record<string,typeof result.rows>={};
      for(const person of result.rows){
        const {channelId,...details}=person;
        (rooms[channelId as string]??=[]).push(details);
      }
      return reply.header('Cache-Control',noCache).send({rooms});
    }catch(error){request.log.error({err:error},'Community voice room presence');return reply.code(503).send({error:'Unavailable'});}
  });

  app.post('/api/v1/communities/:id/channels/:channelId/voice/join',{schema:{params,body:joinBody}},async(request,reply)=>{
    if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request,readSession);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,channelId}=request.params as {id:string;channelId:string};
      const {sessionId}=request.body as {sessionId:string};
      const client=await getPool().connect();
      let meetingExpiresAt:string|null=null;
      try{
        await client.query('BEGIN');
        // Serialize the per-room capacity check and seat acquisition.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,54321))',[channelId]);
        const ok=await client.query(voiceAccess,[channelId,id,me]);
        if(!ok.rowCount){await client.query('ROLLBACK');return reply.code(403).send({error:'MEMBERS_ONLY'});}
        // A member must have an explicit approval before joining a restricted meeting.
        const access=await client.query(
          'SELECT ch.kind,ch.meeting_join_policy,ch.meeting_expires_at AS "meetingExpiresAt",m.role,req.status FROM community_channels ch '+
          "JOIN community_members m ON m.community_id=ch.community_id AND m.user_id=$3 "+
          "LEFT JOIN meeting_access_requests req ON req.channel_id=ch.id AND req.user_id=$3 "+
          "WHERE ch.community_id=$1 AND ch.id=$2",[id,channelId,me]);
        const room=access.rows[0];
        if(room?.kind==='meeting'&&room.meeting_join_policy==='approval'&&
          !['owner','admin'].includes(room.role)&&room.status!=='approved'){
          await client.query('ROLLBACK');
          return reply.code(403).send({error:'MEETING_APPROVAL_REQUIRED'});
        }
        await client.query("DELETE FROM community_voice_sessions WHERE last_seen_at < now()-interval '180 seconds'");
        await client.query("DELETE FROM community_voice_signals WHERE created_at < now()-interval '3 minutes'");
        // The deadline belongs to the meeting, not to any participant. Once
        // expired, evict all old sessions before allowing a fresh meeting.
        const meetingExpired=room?.kind==='meeting'&&
          (!room.meetingExpiresAt||new Date(room.meetingExpiresAt).getTime()<=Date.now());
        if(meetingExpired)await client.query('DELETE FROM community_voice_sessions WHERE channel_id=$1',[channelId]);
        const seats=await client.query('SELECT user_id FROM community_voice_sessions WHERE channel_id=$1',[channelId]);
        if(seats.rows.length>=6&&!seats.rows.some(row=>row.user_id===me)){
          await client.query('ROLLBACK');return reply.code(409).send({error:'VOICE_ROOM_FULL'});
        }
        if(room?.kind==='meeting'){
          // First admitted member starts a fresh 60-minute window. Late joins
          // share its deadline, and cannot extend it by leaving or rejoining.
          if(meetingExpired||seats.rows.length===0){
            const updated=await client.query(
              'UPDATE community_channels SET meeting_expires_at=now()+interval \'1 hour\' '+
              'WHERE id=$1 AND community_id=$2 AND kind=\'meeting\' '+
              'RETURNING meeting_expires_at AS "expiresAt"',[channelId,id]);
            meetingExpiresAt=new Date(updated.rows[0].expiresAt).toISOString();
          }else meetingExpiresAt=new Date(room.meetingExpiresAt).toISOString();
        }
        await client.query(
          'INSERT INTO community_voice_sessions(id,channel_id,user_id) VALUES($1,$2,$3) '+
          'ON CONFLICT(channel_id,user_id) DO UPDATE SET id=EXCLUDED.id,muted=false,deafened=false,joined_at=now(),last_seen_at=now()',
          [sessionId,channelId,me]);
        await client.query('COMMIT');
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
      void publishCommunityEvent(id,channelId,'voice').catch(()=>{});
      return reply.header('Cache-Control',noCache).send({
        sessionId,peers:await roomPeers(channelId,me,sessionId),rtc:await rtcConfig(),maxParticipants:6,expiresAt:meetingExpiresAt,
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
        "SELECT 1 FROM community_voice_sessions s JOIN community_channels ch ON ch.id=s.channel_id "+
        "WHERE s.id=$1 AND s.channel_id=$2 AND s.user_id=$3 AND s.last_seen_at>now()-interval '180 seconds' "+
        "AND (ch.kind<>'meeting' OR ch.meeting_expires_at>now())",
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
        "AND source.last_seen_at>now()-interval '180 seconds' "+
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
      const {sessionId,muted,deafened=false}=request.body as {sessionId:string;muted:boolean;deafened?:boolean};
      const result=await getPool().query(
        'UPDATE community_voice_sessions s SET last_seen_at=now(),muted=$4,deafened=$6 '+
        'FROM community_channels c JOIN community_members m ON m.community_id=c.community_id AND m.user_id=$3 '+
        "WHERE s.id=$1 AND s.channel_id=$2 AND s.user_id=$3 AND c.id=$2 AND c.community_id=$5 AND c.kind IN ('voice','meeting') AND (c.password_hash IS NULL OR m.role IN ('owner','admin') OR EXISTS (SELECT 1 FROM community_channel_password_access g WHERE g.channel_id=c.id AND g.user_id=$3)) "+
        "AND (c.access_mode='open' OR m.role IN ('owner','admin') OR EXISTS (SELECT 1 FROM community_channel_member_access g WHERE g.channel_id=c.id AND g.user_id=$3)) "+
        "AND (c.kind<>'meeting' OR c.meeting_expires_at>now()) AND s.last_seen_at>now()-interval '180 seconds' RETURNING s.id",
        [sessionId,channelId,me,muted,id,deafened]);
      if(!result.rowCount)return reply.code(410).send({error:'VOICE_SESSION_ENDED'});
      void publishCommunityEvent(id,channelId,'voice').catch(()=>{});
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
        'WHERE s.id=$1 AND s.channel_id=$2 AND s.user_id=$6 AND c.community_id=$7 AND c.kind IN (\'voice\',\'meeting\') '+
        "AND (c.password_hash IS NULL OR mine.role IN ('owner','admin') OR EXISTS (SELECT 1 FROM community_channel_password_access g WHERE g.channel_id=c.id AND g.user_id=$6)) "+
        "AND (c.access_mode='open' OR mine.role IN ('owner','admin') OR EXISTS (SELECT 1 FROM community_channel_member_access g WHERE g.channel_id=c.id AND g.user_id=$6)) "+
        "AND (c.access_mode='open' OR theirs.role IN ('owner','admin') OR EXISTS (SELECT 1 FROM community_channel_member_access g WHERE g.channel_id=c.id AND g.user_id=t.user_id)) "+
        "AND (c.kind<>'meeting' OR c.meeting_expires_at>now()) "+
        "AND s.last_seen_at>now()-interval '180 seconds' AND t.last_seen_at>now()-interval '180 seconds' "+
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
        const removed=await getPool().query(
          'DELETE FROM community_voice_sessions s USING community_channels c '+
          "WHERE s.id=$1 AND s.channel_id=$2 AND s.user_id=$3 AND c.id=s.channel_id AND c.community_id=$4 AND c.kind IN ('voice','meeting')",
          [sessionId,channelId,me,id]);
        if(removed.rowCount)void publishCommunityEvent(id,channelId,'voice').catch(()=>{});
        return reply.code(204).send();
      }catch(error){request.log.error({err:error},'Leave voice room');return reply.code(503).send({error:'Unavailable'});}
    });
}
