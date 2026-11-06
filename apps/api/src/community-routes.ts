import { validRequestOrigin as originValid } from './request-origin.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getPool } from './db/client.js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {publishCommunityEvent,publishCommunityMembershipForUser,subscribeCommunityEvents} from './community-events.js';
import { channelGate, channelGateError, channelGateStatus, hashChannelPassword, verifyChannelPassword } from './channel-password.js';
import {recordCommunityRequest} from './activity-notifications.js';
import {pushCommunityMessage,pushCommunityInvite} from './push-routes.js';

type SessionReader = (request: FastifyRequest) => Promise<{user:{id:string}}|null>;
const uuid={type:'string',format:'uuid'} as const;
const groupParams={type:'object',required:['id'],additionalProperties:false,properties:{id:uuid}};
const channelParams={type:'object',required:['id','channelId'],additionalProperties:false,properties:{id:uuid,channelId:uuid}};
const reactionParams={type:'object',required:['id','channelId','messageId'],additionalProperties:false,properties:{id:uuid,channelId:uuid,messageId:uuid}};
const handleParams={type:'object',required:['id','handle'],additionalProperties:false,properties:{id:uuid,handle:{type:'string',pattern:'^[a-z][a-z0-9_]{2,31}$'}}};
const groupBody={type:'object',required:['name','slug','visibility'],additionalProperties:false,properties:{
  name:{type:'string',minLength:2,maxLength:120},
  slug:{type:'string',pattern:'^[a-z][a-z0-9-]{2,63}$'},
  visibility:{type:'string',enum:['public','approval','private']},
  description:{type:'string',maxLength:500}
}};
const channelBody={type:'object',required:['name','kind'],additionalProperties:false,properties:{
  name:{type:'string',minLength:2,maxLength:64},kind:{type:'string',enum:['text','voice','meeting']},
  accessMode:{type:'string',enum:['open','restricted']},
  description:{type:'string',maxLength:4000}
}};
const attachmentSchema={type:'object',additionalProperties:false,required:['id','name','type','size'],properties:{
  id:uuid,name:{type:'string',minLength:1,maxLength:180},type:{type:'string',maxLength:100},
  size:{type:'integer',minimum:1,maximum:52428800}
}};
const messageBody={type:'object',required:['clientId','body'],additionalProperties:false,properties:{
  clientId:uuid,body:{type:'string',maxLength:4000},replyToId:uuid,attachment:attachmentSchema
}};
const mediaParams={type:'object',required:['id','channelId','attachmentId'],additionalProperties:false,properties:{id:uuid,channelId:uuid,attachmentId:uuid}};
const communityAttachmentTypes=new Set(['image/webp','image/jpeg','image/png','image/gif','image/heic','image/heif','video/mp4','video/webm','video/quicktime','application/pdf','text/plain','application/zip','application/octet-stream','audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav','audio/x-m4a','audio/aac']);
function verifiedCommunityUpload(request:FastifyRequest,id:string,channelId:string,clientId:string,a:{id:string;name:string;type:string;size:number}){
  const secret=process.env.DM_ATTACHMENT_PROOF_SECRET;
  const proof=request.headers['x-uorqui-attachment-proof'];
  if(!secret||secret.length<32||typeof proof!=='string'||!/^[0-9a-f]{64}$/.test(proof))return false;
  const canonical=JSON.stringify([id,channelId,clientId,a.id,a.name,a.type,a.size]);
  const expected=createHmac('sha256',secret).update(canonical).digest('hex');
  return timingSafeEqual(Buffer.from(proof,'hex'),Buffer.from(expected,'hex'));
}
const reactionEmojis=['👍','❤️','😂','😮','😢','🔥','👏','🎉','💯','💜','✅','🤔','🙌','👎','😍','🥰','🙏','😎'] as const;
const reactionBody={type:'object',required:['emoji'],additionalProperties:false,properties:{emoji:{type:'string',enum:[...reactionEmojis]}}};
const inviteBody={type:'object',required:['handle'],additionalProperties:false,properties:{handle:{type:'string',pattern:'^[a-z][a-z0-9_]{2,31}$'}}};
const noCache='private, no-store';
const manager=(role:string|null)=>role==='owner'||role==='admin';


export function registerCommunityRoutes(app:FastifyInstance, readSession:SessionReader) {
  async function self(request:FastifyRequest){
    const session=await readSession(request);
    if(!session)return null;
    const result=await getPool().query('SELECT id FROM users WHERE id=$1',[session.user.id]);
    return (result.rows[0]?.id as string|undefined)??null;
  }
  async function group(id:string,me:string){
    const result=await getPool().query(
      'SELECT c.id,c.slug,c.name,c.description,c.avatar_url AS "avatarUrl",c.visibility,c.owner_id AS "ownerId",c.created_at AS "createdAt",'+
      'm.role AS "myRole",r.kind AS "requestKind",r.status AS "requestStatus",'+
      '(SELECT COUNT(*)::int FROM community_members cm WHERE cm.community_id=c.id) AS "memberCount" '+
      'FROM communities c LEFT JOIN community_members m ON m.community_id=c.id AND m.user_id=$2 '+
      'LEFT JOIN community_join_requests r ON r.community_id=c.id AND r.user_id=$2 '+
      'WHERE c.id=$1 AND NOT EXISTS (SELECT 1 FROM community_bans b WHERE b.community_id=c.id AND b.user_id=$2) ' +
      'AND (c.visibility<>\'private\' OR m.user_id IS NOT NULL OR (r.kind=\'invite\' AND r.status=\'pending\')) LIMIT 1',
      [id,me]);
    return result.rows[0]??null;
  }
  async function membership(id:string,me:string){
    const r=await getPool().query('SELECT role FROM community_members WHERE community_id=$1 AND user_id=$2',[id,me]);
    return (r.rows[0]?.role as string|undefined)??null;
  }

  // The same authenticated Server-Sent Events pattern as direct messages.
  // A single listener handles all connected members; the stream expires after
  // five minutes so membership and account permissions are re-validated.
  app.get('/api/v1/communities/events',async(request,reply)=>{
    try{
      const me=await self(request);
      if(!me)return reply.code(401).send({error:'Unauthorized'});
      if(!(request.headers.accept??'').includes('text/event-stream'))
        return reply.code(406).send({error:'Expected event stream'});
      const groups=await getPool().query('SELECT community_id FROM community_members WHERE user_id=$1',[me]);
      const response=reply.raw;
      response.writeHead(200,{
        'Content-Type':'text/event-stream; charset=utf-8',
        'Cache-Control':'private, no-store, no-transform',
        Connection:'keep-alive',
        'X-Accel-Buffering':'no',
        'X-Content-Type-Options':'nosniff',
      });
      reply.hijack();
      let ended=false;
      let unsubscribe=()=>{};
      const write=(value:string)=>{
        if(ended||response.destroyed||response.writableEnded)return;
        try{response.write(value);}catch{finish();}
      };
      const heartbeat=setInterval(()=>write(': heartbeat\n\n'),15_000);
      const expires=setTimeout(()=>finish(),5*60_000);
      function finish(){
        if(ended)return;
        ended=true;clearInterval(heartbeat);clearTimeout(expires);
        unsubscribe();
        if(!response.writableEnded)response.end();
      }
      response.once('close',finish);
      unsubscribe=await subscribeCommunityEvents(
        groups.rows.map((r:{community_id:string})=>r.community_id),me,
        event=>{
          const send=()=>write('event: community-update\ndata: '+JSON.stringify({
            kind:event.kind,communityId:event.communityId,channelId:event.channelId,
            ...(event.recipientId?{membershipChanged:true}:{})
          })+'\n\n');
          // A joined user may not see a closed channel. No IDs or activity
          // for inaccessible channels should leak through the SSE stream.
          if(event.channelId){
            void channelGate(event.communityId,event.channelId,me)
              .then(gate=>{if(gate==='allowed')send();}).catch(()=>{});
          }else send();
        });
      if(response.destroyed){finish();return;}
      write('retry: 2000\n\n');
      write('event: ready\ndata: {}\n\n');
    }catch(error){request.log.error({err:error},'Community events');if(!reply.sent)return reply.code(503).send({error:'Unavailable'});}
  });

  app.get('/api/v1/communities',async(request,reply)=>{
    try {
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const r=await getPool().query(
        'SELECT c.id,c.slug,c.name,c.description,c.avatar_url AS "avatarUrl",c.visibility,c.created_at AS "createdAt",'+
        'm.role AS "myRole",r.kind AS "requestKind",r.status AS "requestStatus",'+
        '(SELECT COUNT(*)::int FROM community_members cm WHERE cm.community_id=c.id) AS "memberCount" '+
        'FROM communities c LEFT JOIN community_members m ON m.community_id=c.id AND m.user_id=$1 '+
        'LEFT JOIN community_join_requests r ON r.community_id=c.id AND r.user_id=$1 '+
        'WHERE NOT EXISTS (SELECT 1 FROM community_bans b WHERE b.community_id=c.id AND b.user_id=$1) ' +
        'AND (c.visibility<>\'private\' OR m.user_id IS NOT NULL OR (r.kind=\'invite\' AND r.status=\'pending\')) '+
        'ORDER BY (m.role IS NOT NULL) DESC, c.created_at DESC LIMIT 150',[me]);
      return reply.header('Cache-Control',noCache).send({communities:r.rows});
    }catch(error){request.log.error({err:error},'List communities');return reply.code(503).send({error:'Unavailable'});}
  });

  // Community-first home. Only joined communities are eligible for activity;
  // do not expose private channel titles, blocked authors, or stale voice sessions.
  app.get('/api/v1/communities/discover/activity',async(request,reply)=>{
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const recent=await getPool().query(
        `SELECT c.id AS "communityId",c.name AS "communityName",
            ch.id AS "channelId",ch.name AS "channelName",ch.kind AS "channelKind",
            GREATEST(latest.created_at,reacted.created_at) AS "createdAt",
            CASE WHEN choice.is_reaction THEN 'reaction' ELSE 'message' END AS "activityKind",
            CASE WHEN choice.is_reaction THEN reacted.actor_name ELSE latest.actor_name END AS "actorName",
            LEFT(COALESCE(CASE WHEN choice.is_reaction THEN reacted.body ELSE latest.body END,''),180) AS preview,
            CASE WHEN choice.is_reaction THEN reacted.attachment_type ELSE latest.attachment_type END AS "attachmentType",
            CASE WHEN choice.is_reaction THEN reacted.emoji ELSE NULL END AS "reactionEmoji",
            CASE WHEN choice.is_reaction THEN reacted.message_author_name ELSE NULL END AS "messageAuthorName"
         FROM community_members mine
         JOIN communities c ON c.id=mine.community_id
         JOIN community_channels ch ON ch.community_id=c.id
           AND (ch.password_hash IS NULL OR mine.role IN ('owner','admin') OR
             EXISTS (SELECT 1 FROM community_channel_password_access gr WHERE gr.channel_id=ch.id AND gr.user_id=$1))
           AND (ch.access_mode='open' OR mine.role IN ('owner','admin') OR
             EXISTS (SELECT 1 FROM community_channel_member_access ag WHERE ag.channel_id=ch.id AND ag.user_id=$1))
         LEFT JOIN LATERAL (
           SELECT m.body,m.attachment_type,m.created_at,
             COALESCE(CASE WHEN p.is_public=true OR m.author_id=$1 OR EXISTS (
               SELECT 1 FROM user_friendships f WHERE f.status='accepted'
               AND ((f.user_a_id=$1 AND f.user_b_id=m.author_id) OR
                 (f.user_b_id=$1 AND f.user_a_id=m.author_id))
             ) THEN p.display_name END,u.handle) AS actor_name
           FROM community_messages m
           JOIN users u ON u.id=m.author_id
           LEFT JOIN profiles p ON p.user_id=m.author_id
           WHERE m.channel_id=ch.id AND m.deleted_at IS NULL
             AND m.created_at>now()-interval '14 days'
             AND NOT EXISTS (SELECT 1 FROM user_blocks b
               WHERE (b.blocker_id=m.author_id AND b.blocked_id=$1) OR
                 (b.blocker_id=$1 AND b.blocked_id=m.author_id))
           ORDER BY m.created_at DESC,m.id DESC LIMIT 1
         ) latest ON true
         LEFT JOIN LATERAL (
           SELECT rx.emoji,rx.created_at,msg.body,msg.attachment_type,
             COALESCE(CASE WHEN rp.is_public=true OR rx.user_id=$1 OR EXISTS (
               SELECT 1 FROM user_friendships f WHERE f.status='accepted'
               AND ((f.user_a_id=$1 AND f.user_b_id=rx.user_id) OR
                 (f.user_b_id=$1 AND f.user_a_id=rx.user_id))
             ) THEN rp.display_name END,ru.handle) AS actor_name,
             COALESCE(CASE WHEN op.is_public=true OR msg.author_id=$1 OR EXISTS (
               SELECT 1 FROM user_friendships f WHERE f.status='accepted'
               AND ((f.user_a_id=$1 AND f.user_b_id=msg.author_id) OR
                 (f.user_b_id=$1 AND f.user_a_id=msg.author_id))
             ) THEN op.display_name END,ou.handle) AS message_author_name
           FROM community_message_reactions rx
           JOIN community_messages msg ON msg.id=rx.message_id
             AND msg.channel_id=ch.id AND msg.deleted_at IS NULL
           JOIN users ru ON ru.id=rx.user_id
           LEFT JOIN profiles rp ON rp.user_id=rx.user_id
           JOIN users ou ON ou.id=msg.author_id
           LEFT JOIN profiles op ON op.user_id=msg.author_id
           WHERE rx.created_at>now()-interval '14 days'
             AND NOT EXISTS (SELECT 1 FROM user_blocks b
               WHERE (b.blocker_id=rx.user_id AND b.blocked_id=$1) OR
                 (b.blocker_id=$1 AND b.blocked_id=rx.user_id) OR
                 (b.blocker_id=msg.author_id AND b.blocked_id=$1) OR
                 (b.blocker_id=$1 AND b.blocked_id=msg.author_id))
           ORDER BY rx.created_at DESC,rx.message_id DESC LIMIT 1
         ) reacted ON true
         CROSS JOIN LATERAL (SELECT reacted.created_at IS NOT NULL
           AND (latest.created_at IS NULL OR reacted.created_at>latest.created_at) AS is_reaction) choice
         WHERE mine.user_id=$1 AND (latest.created_at IS NOT NULL OR reacted.created_at IS NOT NULL)
           AND NOT EXISTS (SELECT 1 FROM community_bans ban
             WHERE ban.community_id=c.id AND ban.user_id=$1)
         ORDER BY "createdAt" DESC LIMIT 18`,[me]);
      const rooms=await getPool().query(
        'SELECT c.id AS "communityId",c.name AS "communityName",'+
        'ch.id AS "channelId",ch.name AS "channelName",'+
        'COUNT(DISTINCT voice.user_id)::int AS "participantCount" '+
        'FROM community_members mine JOIN communities c ON c.id=mine.community_id '+
        'JOIN community_channels ch ON ch.community_id=c.id AND ch.kind IN (\'voice\',\'meeting\') '+
        "AND (ch.password_hash IS NULL OR mine.role IN ('owner','admin') OR EXISTS (SELECT 1 FROM community_channel_password_access gr WHERE gr.channel_id=ch.id AND gr.user_id=$1)) "+
        "AND (ch.access_mode='open' OR mine.role IN ('owner','admin') OR EXISTS (SELECT 1 FROM community_channel_member_access access_grant WHERE access_grant.channel_id=ch.id AND access_grant.user_id=$1)) "+
        'JOIN community_voice_sessions voice ON voice.channel_id=ch.id '+
        "AND voice.last_seen_at>now()-interval '180 seconds' "+
        'JOIN community_members participant ON participant.community_id=c.id AND participant.user_id=voice.user_id '+
        'WHERE mine.user_id=$1 AND NOT EXISTS (SELECT 1 FROM community_bans ban '+
        'WHERE ban.community_id=c.id AND ban.user_id=$1) '+
        'AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE '+
        '(b.blocker_id=voice.user_id AND b.blocked_id=$1) OR '+
        '(b.blocker_id=$1 AND b.blocked_id=voice.user_id)) '+
        'GROUP BY c.id,ch.id HAVING COUNT(DISTINCT voice.user_id)>0 '+
        'ORDER BY "participantCount" DESC,c.name,ch.name LIMIT 12',[me]);
      return reply.header('Cache-Control',noCache).send({recent:recent.rows,rooms:rooms.rows});
    }catch(error){
      request.log.error({err:error},'Discover community activity');
      return reply.code(503).send({error:'Unavailable'});
    }
  });

  app.post('/api/v1/communities',{schema:{body:groupBody}},async(request,reply)=>{
    if(!originValid(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {name,slug,visibility,description}=request.body as {name:string;slug:string;visibility:'public'|'approval'|'private';description?:string};
      const cleanName=name.trim(),cleanDescription=description?.trim()??'';
      if(cleanName.length<2)return reply.code(400).send({error:'Invalid name'});
      const client=await getPool().connect();
      try{
        await client.query('BEGIN');
        const quota=await client.query('SELECT COUNT(*)::int AS n FROM communities WHERE owner_id=$1',[me]);
        if(Number(quota.rows[0].n)>=20){await client.query('ROLLBACK');return reply.code(409).send({error:'COMMUNITY_LIMIT'});}
        const saved=await client.query(
          'INSERT INTO communities(slug,name,description,visibility,owner_id) VALUES($1,$2,$3,$4,$5) RETURNING id',
          [slug,cleanName,cleanDescription||null,visibility,me]);
        const id=saved.rows[0].id as string;
        await client.query('INSERT INTO community_members(community_id,user_id,role) VALUES($1,$2,\'owner\')',[id,me]);
        await client.query(
          'INSERT INTO community_channels(community_id,name,kind) VALUES($1,\'geral\',\'text\'),($1,\'Sala de voz\',\'voice\')',[id]);
        await client.query('COMMIT');
        return reply.code(201).header('Cache-Control',noCache).send({id});
      }catch(error){await client.query('ROLLBACK');throw error;}
      finally{client.release();}
    }catch(error){
      if(typeof error==='object'&&error!==null&&'code' in error&&error.code==='23505')
        return reply.code(409).send({error:'SLUG_TAKEN'});
      request.log.error({err:error},'Create community');return reply.code(503).send({error:'Unavailable'});
    }
  });

  /** Unread messages from text and voice channels are scoped to community members. */
  app.get('/api/v1/communities/unread',async(request,reply)=>{
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const result=await getPool().query(
        'SELECT ch.community_id AS "communityId",ch.id AS "channelId",ch.name AS "channelName",'+
        'c.name AS "communityName",ch.kind AS "channelKind",COUNT(msg.id)::int AS "unreadCount" '+
        'FROM community_channels ch JOIN communities c ON c.id=ch.community_id '+
        'JOIN community_members m ON m.community_id=ch.community_id AND m.user_id=$1 '+
        'LEFT JOIN community_channel_reads rd ON rd.channel_id=ch.id AND rd.user_id=$1 '+
        'LEFT JOIN community_messages msg ON msg.channel_id=ch.id AND msg.author_id<>$1 '+
        'AND msg.deleted_at IS NULL AND msg.created_at>GREATEST(m.joined_at,COALESCE(rd.last_read_at,m.joined_at)) '+
        "WHERE (ch.password_hash IS NULL OR m.role IN ('owner','admin') OR EXISTS (SELECT 1 FROM community_channel_password_access gr WHERE gr.channel_id=ch.id AND gr.user_id=$1)) "+
        "AND (ch.access_mode='open' OR m.role IN ('owner','admin') OR EXISTS (SELECT 1 FROM community_channel_member_access access_grant WHERE access_grant.channel_id=ch.id AND access_grant.user_id=$1)) "+
        "GROUP BY ch.community_id,ch.id,c.name ORDER BY c.name,ch.name",[me]);
      const channels:Record<string,number>={},communities:Record<string,number>={};
      const locations:Array<{communityId:string;communityName:string;channelId:string;channelName:string;channelKind:string;count:number}>=[];
      let total=0;
      for(const item of result.rows){
        const count=Number(item.unreadCount)||0;
        if(count>0){
          channels[item.channelId]=count;communities[item.communityId]=(communities[item.communityId]??0)+count;total+=count;
          locations.push({communityId:item.communityId,communityName:item.communityName,
            channelId:item.channelId,channelName:item.channelName,channelKind:item.channelKind,count});
        }
      }
      // Pending invitations are visible to their recipient even for private
      // communities. No private channel names or contents are included.
      const pending=await getPool().query(
        'SELECT c.id AS "communityId",c.name AS "communityName" '+
        'FROM community_join_requests invite JOIN communities c ON c.id=invite.community_id '+
        "WHERE invite.user_id=$1 AND invite.kind='invite' AND invite.status='pending' "+
        'AND NOT EXISTS(SELECT 1 FROM community_members m WHERE m.community_id=c.id AND m.user_id=$1) '+
        'AND NOT EXISTS(SELECT 1 FROM community_bans ban WHERE ban.community_id=c.id AND ban.user_id=$1) '+
        'ORDER BY invite.updated_at DESC LIMIT 40',[me]);
      return reply.header('Cache-Control',noCache).send({total,channels,communities,locations,invites:pending.rows});
    }catch(error){request.log.error({err:error},'Community unread counts');return reply.code(503).send({error:'Unavailable'});}
  });

  /** Revalidate delayed invitation pushes without disclosing private
   * community names to signed-out, banned or uninvited users. */
  app.get('/api/v1/communities/:id/invite/notification-access',{schema:{params:groupParams}},async(request,reply)=>{
    try{
      const me=await self(request);
      if(!me)return reply.code(401).header('Cache-Control',noCache).send({authorized:false});
      const {id}=request.params as {id:string};
      const allowed=await getPool().query(
        'SELECT 1 FROM community_join_requests invite JOIN communities c ON c.id=invite.community_id '+
        "WHERE invite.community_id=$1 AND invite.user_id=$2 AND invite.kind='invite' AND invite.status='pending' "+
        'AND NOT EXISTS(SELECT 1 FROM community_bans ban WHERE ban.community_id=$1 AND ban.user_id=$2) '+
        'AND NOT EXISTS(SELECT 1 FROM community_members member WHERE member.community_id=$1 AND member.user_id=$2)',
        [id,me]);
      if(!allowed.rowCount)return reply.code(403).header('Cache-Control',noCache).send({authorized:false});
      return reply.header('Cache-Control',noCache).send({authorized:true});
    }catch(error){
      request.log.error({err:error},'Authorize community invitation push');
      return reply.code(503).header('Cache-Control',noCache).send({authorized:false});
    }
  });

  /** Called by the Service Worker before showing a queued channel push.
   * Re-check current membership, channel password and restricted grants, rather
   * than revealing a channel's name after permission is revoked. */
  app.get('/api/v1/communities/:id/channels/:channelId/notification-access',{
    schema:{params:channelParams}
  },async(request,reply)=>{
    try{
      const me=await self(request);
      if(!me)return reply.code(401).header('Cache-Control',noCache).send({authorized:false});
      const {id,channelId}=request.params as {id:string;channelId:string};
      const gate=await channelGate(id,channelId,me);
      if(gate!=='allowed')return reply.code(403).header('Cache-Control',noCache).send({authorized:false});
      const blocked=await getPool().query('SELECT 1 FROM community_bans WHERE community_id=$1 AND user_id=$2',[id,me]);
      if(blocked.rowCount)return reply.code(403).header('Cache-Control',noCache).send({authorized:false});
      return reply.header('Cache-Control',noCache).send({authorized:true});
    }catch(error){
      request.log.error({err:error},'Authorize channel notification');
      return reply.code(503).header('Cache-Control',noCache).send({authorized:false});
    }
  });

  /** A channel is only marked read up to a message the member actually received. */
  app.post('/api/v1/communities/:id/channels/:channelId/read',{
    schema:{params:channelParams,body:{type:'object',required:['lastMessageId'],additionalProperties:false,properties:{lastMessageId:uuid}}}
  },async(request,reply)=>{
    if(!originValid(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,channelId}=request.params as {id:string;channelId:string};
      const {lastMessageId}=request.body as {lastMessageId:string};
      if(!await membership(id,me))return reply.code(403).send({error:'MEMBERS_ONLY'});
      const gate=await channelGate(id,channelId,me);
      if(gate!=='allowed')return reply.code(channelGateStatus(gate)).send({error:channelGateError(gate)});
      const result=await getPool().query(
        'INSERT INTO community_channel_reads (channel_id,user_id,last_read_at) '+
        'SELECT ch.id,$3,m.created_at FROM community_channels ch '+
        "JOIN community_messages m ON m.channel_id=ch.id AND m.id=$4 "+
        "WHERE ch.id=$1 AND ch.community_id=$2 "+
        'ON CONFLICT (channel_id,user_id) DO UPDATE SET '+
        'last_read_at=GREATEST(community_channel_reads.last_read_at,EXCLUDED.last_read_at),updated_at=now() '+
        'RETURNING last_read_at AS "lastReadAt"',[channelId,id,me,lastMessageId]);
      if(!result.rowCount)return reply.code(404).send({error:'Message unavailable'});
      return reply.header('Cache-Control',noCache).send({lastReadAt:result.rows[0].lastReadAt});
    }catch(error){request.log.error({err:error},'Mark community channel read');return reply.code(503).send({error:'Unavailable'});}
  });

  app.get('/api/v1/communities/:id',{schema:{params:groupParams}},async(request,reply)=>{
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      const data=await group(id,me);if(!data)return reply.code(404).send({error:'Not found'});
      let channels:unknown[]=[],pendingRequests:unknown[]=[];
      if(data.myRole){
        const result=await getPool().query(
          'SELECT id,name,kind,description,created_at AS "createdAt",access_mode AS "accessMode",password_hash IS NOT NULL AS "hasPassword",'+
          "(password_hash IS NULL OR $2::boolean OR EXISTS (SELECT 1 FROM community_channel_password_access gr WHERE gr.channel_id=community_channels.id AND gr.user_id=$3)) AS \"unlocked\" "+
          "FROM community_channels WHERE community_id=$1 AND (access_mode='open' OR $2::boolean OR EXISTS "+
          '(SELECT 1 FROM community_channel_member_access gr WHERE gr.channel_id=community_channels.id AND gr.user_id=$3)) '+
          'ORDER BY created_at,id',[id,manager(data.myRole),me]);
        channels=result.rows;
        if(manager(data.myRole)){
          const waiting=await getPool().query(
            'SELECT u.handle,CASE WHEN p.is_public THEN p.display_name ELSE u.handle END AS "displayName",r.created_at AS "requestedAt" '+
            'FROM community_join_requests r JOIN users u ON u.id=r.user_id JOIN profiles p ON p.user_id=u.id '+
            'WHERE r.community_id=$1 AND r.kind=\'join\' AND r.status=\'pending\' ORDER BY r.created_at LIMIT 100',[id]);
          pendingRequests=waiting.rows;
        }
      }
      return reply.header('Cache-Control',noCache).send({community:data,channels,pendingRequests});
    }catch(error){request.log.error({err:error},'Get community');return reply.code(503).send({error:'Unavailable'});}
  });

  // Channel invitations are relevant only to people already in the community.
  // A member can see handles, but profile details still respect account privacy.
  app.get('/api/v1/communities/:id/invitable-members',{schema:{params:groupParams}},async(request,reply)=>{
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      if(!await membership(id,me))return reply.code(403).send({error:'MEMBERS_ONLY'});
      const result=await getPool().query(
        'SELECT u.handle,CASE WHEN p.is_public=true OR f.status=\'accepted\' THEN COALESCE(p.display_name,u.handle) ELSE u.handle END AS "displayName",'+
        'CASE WHEN p.is_public=true OR f.status=\'accepted\' THEN p.avatar_url ELSE NULL END AS "avatarUrl" '+
        'FROM community_members cm JOIN users u ON u.id=cm.user_id '+
        'LEFT JOIN profiles p ON p.user_id=u.id '+
        'LEFT JOIN user_friendships f ON ((f.user_a_id=$2 AND f.user_b_id=u.id) OR '+
          '(f.user_b_id=$2 AND f.user_a_id=u.id)) AND f.status=\'accepted\' '+
        'WHERE cm.community_id=$1 AND cm.user_id<>$2 '+
        'AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE '+
          '(b.blocker_id=$2 AND b.blocked_id=u.id) OR (b.blocked_id=$2 AND b.blocker_id=u.id)) '+
        'ORDER BY lower(CASE WHEN p.is_public=true OR f.status=\'accepted\' THEN COALESCE(p.display_name,u.handle) ELSE u.handle END),u.handle LIMIT 600',[id,me]);
      return reply.header('Cache-Control',noCache).send({members:result.rows});
    }catch(error){request.log.error({err:error},'Channel invite member list');return reply.code(503).send({error:'Unavailable'});}
  });

  app.post('/api/v1/communities/:id/join',{schema:{params:groupParams}},async(request,reply)=>{
    if(!originValid(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      const data=await group(id,me);if(!data)return reply.code(404).send({error:'Not found'});
      if(data.myRole)return reply.header('Cache-Control',noCache).send({status:'member'});
      if(data.visibility==='private')return reply.code(403).send({error:'INVITE_REQUIRED'});
      if(data.visibility==='approval'){
        const existing=await getPool().query(
          'SELECT kind,status,updated_at FROM community_join_requests WHERE community_id=$1 AND user_id=$2',[id,me]);
        if(existing.rows[0]?.kind==='invite'&&existing.rows[0]?.status==='pending')
          return reply.code(409).send({error:'ACCEPT_INVITE_FIRST'});
        if(existing.rows[0]?.status==='pending')
          return reply.header('Cache-Control',noCache).send({status:'pending'});
        const last=existing.rows[0];
        if(last && Date.now()-new Date(last.updated_at).getTime()<86400000)
          return reply.code(429).send({error:'REQUEST_COOLDOWN'});
        await getPool().query(
          'INSERT INTO community_join_requests(community_id,user_id,kind) VALUES($1,$2,\'join\') '+
          'ON CONFLICT(community_id,user_id) DO UPDATE SET kind=\'join\',status=\'pending\',created_at=now(),updated_at=now()',
          [id,me]);
        await recordCommunityRequest(id,me,'community_join_request',id,'community-request:'+id+':'+me+':'+Date.now())
          .catch(error=>request.log.warn({err:error},'Community approval push'));
        void publishCommunityEvent(id,null,'membership').catch(()=>{});
        return reply.code(201).header('Cache-Control',noCache).send({status:'pending'});
      }
      const inserted=await getPool().query("INSERT INTO community_members(community_id,user_id,role) "+
        "SELECT $1,$2,'member' WHERE NOT EXISTS (SELECT 1 FROM community_bans WHERE community_id=$1 AND user_id=$2) "+
        "ON CONFLICT DO NOTHING RETURNING user_id",[id,me]);
      if(!inserted.rowCount && !await membership(id,me))return reply.code(403).send({error:'COMMUNITY_BANNED'});
      if(inserted.rowCount){
        void publishCommunityEvent(id,null,'membership').catch(()=>{});
        void publishCommunityMembershipForUser(id,me).catch(()=>{});
      }
      return reply.header('Cache-Control',noCache).send({status:'member'});
    }catch(error){request.log.error({err:error},'Join community');return reply.code(503).send({error:'Unavailable'});}
  });

  app.post('/api/v1/communities/:id/requests/:handle/approve',{schema:{params:handleParams}},async(request,reply)=>{
    if(!originValid(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,handle}=request.params as {id:string;handle:string};
      if(!manager(await membership(id,me)))return reply.code(403).send({error:'Forbidden'});
      const client=await getPool().connect();
      try{
        await client.query('BEGIN');
        const r=await client.query(
          'UPDATE community_join_requests SET status=\'approved\',updated_at=now() '+
          'WHERE community_id=$1 AND user_id=(SELECT id FROM users WHERE handle=$2) AND kind=\'join\' AND status=\'pending\' RETURNING user_id',
          [id,handle]);
        if(!r.rowCount){await client.query('ROLLBACK');return reply.code(404).send({error:'Request not found'});}
        const added=await client.query("INSERT INTO community_members(community_id,user_id,role) "+
          "SELECT $1,$2,'member' WHERE NOT EXISTS (SELECT 1 FROM community_bans WHERE community_id=$1 AND user_id=$2) "+
          "ON CONFLICT DO NOTHING RETURNING user_id",[id,r.rows[0].user_id]);
        if(!added.rowCount){await client.query('ROLLBACK');return reply.code(403).send({error:'COMMUNITY_BANNED'});}
        await client.query('COMMIT');
        // Publish after commit: the applicant's SSE was opened before they
        // became a member, so a community-wide event alone cannot reach them.
        void publishCommunityMembershipForUser(id,r.rows[0].user_id as string).catch(()=>{});
        void publishCommunityEvent(id,null,'membership').catch(()=>{});
        return reply.header('Cache-Control',noCache).send({status:'member'});
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    }catch(error){request.log.error({err:error},'Approve community member');return reply.code(503).send({error:'Unavailable'});}
  });

  app.post('/api/v1/communities/:id/invite',{schema:{params:groupParams,body:inviteBody}},async(request,reply)=>{
    if(!originValid(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      if(!manager(await membership(id,me)))return reply.code(403).send({error:'Forbidden'});
      const {handle}=request.body as {handle:string};
      const user=await getPool().query('SELECT id FROM users WHERE handle=$1',[handle]);
      const target=user.rows[0]?.id;
      if(!target||target===me)return reply.code(404).send({error:'Account unavailable'});
      const already=await membership(id,target);if(already)return reply.code(409).send({error:'ALREADY_MEMBER'});
      const blocked=await getPool().query('SELECT 1 FROM user_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)',[me,target]);
      if(blocked.rowCount)return reply.code(404).send({error:'Account unavailable'});
      const banned=await getPool().query('SELECT 1 FROM community_bans WHERE community_id=$1 AND user_id=$2',[id,target]);
      if(banned.rowCount)return reply.code(404).send({error:'Account unavailable'});
      const old=await getPool().query('SELECT kind,status,updated_at FROM community_join_requests WHERE community_id=$1 AND user_id=$2',[id,target]);
      if(old.rows[0]?.status==='pending')return reply.code(409).send({error:'REQUEST_PENDING'});
      if(old.rows[0] && Date.now()-new Date(old.rows[0].updated_at).getTime()<86400000)
        return reply.code(429).send({error:'REQUEST_COOLDOWN'});
      await getPool().query(
        'INSERT INTO community_join_requests(community_id,user_id,kind) VALUES($1,$2,\'invite\') '+
        'ON CONFLICT(community_id,user_id) DO UPDATE SET kind=\'invite\',status=\'pending\',created_at=now(),updated_at=now()',
        [id,target]);
      void publishCommunityMembershipForUser(id,target as string).catch(()=>{});
      void pushCommunityInvite(target as string,id,me).catch(error=>request.log.warn({err:error},'Community invitation push'));
      return reply.code(201).header('Cache-Control',noCache).send({status:'invited'});
    }catch(error){request.log.error({err:error},'Invite community member');return reply.code(503).send({error:'Unavailable'});}
  });

  app.post('/api/v1/communities/:id/invite/:action',{schema:{params:{type:'object',additionalProperties:false,required:['id','action'],properties:{id:uuid,action:{type:'string',enum:['accept','decline']}}}}},async(request,reply)=>{
    if(!originValid(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,action}=request.params as {id:string;action:'accept'|'decline'};
      const client=await getPool().connect();
      try{
        await client.query('BEGIN');
        const result=await client.query(
          'UPDATE community_join_requests SET status=$3,updated_at=now() '+
          'WHERE community_id=$1 AND user_id=$2 AND kind=\'invite\' AND status=\'pending\' RETURNING user_id',
          [id,me,action==='accept'?'approved':'declined']);
        if(!result.rowCount){await client.query('ROLLBACK');return reply.code(404).send({error:'Invite not found'});}
        if(action==='accept'){
          const added=await client.query("INSERT INTO community_members(community_id,user_id,role) "+
            "SELECT $1,$2,'member' WHERE NOT EXISTS (SELECT 1 FROM community_bans WHERE community_id=$1 AND user_id=$2) "+
            "ON CONFLICT DO NOTHING RETURNING user_id",[id,me]);
          if(!added.rowCount){await client.query('ROLLBACK');return reply.code(403).send({error:'COMMUNITY_BANNED'});}
        }
        await client.query('COMMIT');
        void publishCommunityMembershipForUser(id,me).catch(()=>{});
        if(action==='accept')void publishCommunityEvent(id,null,'membership').catch(()=>{});
        return reply.header('Cache-Control',noCache).send({status:action==='accept'?'member':'declined'});
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    }catch(error){request.log.error({err:error},'Community invitation');return reply.code(503).send({error:'Unavailable'});}
  });

  app.delete('/api/v1/communities/:id/membership',{schema:{params:groupParams}},async(request,reply)=>{
    if(!originValid(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      const role=await membership(id,me);
      if(role==='owner')return reply.code(409).send({error:'OWNER_CANNOT_LEAVE'});
      if(!role)return reply.code(204).send();
      await getPool().query('DELETE FROM community_members WHERE community_id=$1 AND user_id=$2',[id,me]);
      await getPool().query('DELETE FROM community_channel_password_access gr USING community_channels ch WHERE gr.channel_id=ch.id AND ch.community_id=$1 AND gr.user_id=$2',[id,me]);
      await getPool().query('DELETE FROM community_channel_member_access gr USING community_channels ch WHERE gr.channel_id=ch.id AND ch.community_id=$1 AND gr.user_id=$2',[id,me]);
      void publishCommunityMembershipForUser(id,me).catch(()=>{});
      void publishCommunityEvent(id,null,'membership').catch(()=>{});
      return reply.code(204).send();
    }catch(error){request.log.error({err:error},'Leave community');return reply.code(503).send({error:'Unavailable'});}
  });

  app.post('/api/v1/communities/:id/channels',{schema:{params:groupParams,body:channelBody}},async(request,reply)=>{
    if(!originValid(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      if(!manager(await membership(id,me)))return reply.code(403).send({error:'Forbidden'});
      const {name,kind,accessMode='open',description}=request.body as {name:string;kind:'text'|'voice'|'meeting';accessMode?:'open'|'restricted';description?:string};
      const normalized=name.trim();
      if(normalized.length<2)return reply.code(400).send({error:'Invalid channel name'});
      const c=await getPool().query('SELECT COUNT(*)::int AS n FROM community_channels WHERE community_id=$1',[id]);
      if(Number(c.rows[0].n)>=50)return reply.code(409).send({error:'CHANNEL_LIMIT'});
      const result=await getPool().query(
        'INSERT INTO community_channels(community_id,name,kind,access_mode,description) VALUES($1,$2,$3,$4,$5) RETURNING id,name,kind,description,access_mode AS "accessMode"',
        [id,normalized,kind,accessMode,description?.trim()||null]);
      void publishCommunityEvent(id,result.rows[0].id,'channel').catch(()=>{});
      return reply.code(201).header('Cache-Control',noCache).send({channel:result.rows[0]});
    }catch(error){
      if(typeof error==='object'&&error!==null&&'code' in error&&error.code==='23505')
        return reply.code(409).send({error:'CHANNEL_EXISTS'});
      request.log.error({err:error},'Create community channel');return reply.code(503).send({error:'Unavailable'});
    }
  });

  /** Passwords are never returned to clients; only salted scrypt hashes live in PostgreSQL. */
  app.put('/api/v1/communities/:id/channels/:channelId/password',{
    schema:{params:channelParams,body:{type:'object',required:['password'],additionalProperties:false,
      properties:{password:{anyOf:[{type:'string',minLength:8,maxLength:72},{type:'null'}]}}}}
  },async(request,reply)=>{
    if(!originValid(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,channelId}=request.params as {id:string;channelId:string};
      if(!manager(await membership(id,me)))return reply.code(403).send({error:'Forbidden'});
      const {password}=request.body as {password:string|null};
      if(password!==null&&Buffer.byteLength(password,'utf8')>256)
        return reply.code(400).send({error:'INVALID_PASSWORD'});
      const hashed=password===null?null:hashChannelPassword(password);
      const client=await getPool().connect();
      try{
        await client.query('BEGIN');
        const changed=await client.query(
          'UPDATE community_channels SET password_hash=$3 WHERE community_id=$1 AND id=$2 RETURNING id',
          [id,channelId,hashed]);
        if(!changed.rowCount){await client.query('ROLLBACK');return reply.code(404).send({error:'Channel unavailable'});}
        await client.query('DELETE FROM community_channel_password_access WHERE channel_id=$1',[channelId]);
        await client.query('DELETE FROM community_channel_password_attempts WHERE channel_id=$1',[channelId]);
        await client.query('COMMIT');
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
      void publishCommunityEvent(id,channelId,'channel').catch(()=>{});
      return reply.header('Cache-Control',noCache).send({hasPassword:password!==null});
    }catch(error){request.log.error({err:error},'Protect community channel');return reply.code(503).send({error:'Unavailable'});}
  });
  app.post('/api/v1/communities/:id/channels/:channelId/unlock',{
    schema:{params:channelParams,body:{type:'object',required:['password'],additionalProperties:false,
      properties:{password:{type:'string',minLength:1,maxLength:72}}}}
  },async(request,reply)=>{
    if(!originValid(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,channelId}=request.params as {id:string;channelId:string};
      if(!await membership(id,me))return reply.code(403).send({error:'MEMBERS_ONLY'});
      const gate=await channelGate(id,channelId,me);
      if(gate==='permission_required'||gate==='not_found')return reply.code(channelGateStatus(gate)).send({error:channelGateError(gate)});
      const {password}=request.body as {password:string};
      if(Buffer.byteLength(password,'utf8')>256)return reply.code(400).send({error:'INVALID_PASSWORD'});
      const row=await getPool().query('SELECT password_hash FROM community_channels WHERE community_id=$1 AND id=$2',[id,channelId]);
      if(!row.rowCount)return reply.code(404).send({error:'Channel unavailable'});
      if(!row.rows[0].password_hash)return reply.header('Cache-Control',noCache).send({unlocked:true});
      const attempts=await getPool().query(
        'SELECT failed_count,last_failed_at FROM community_channel_password_attempts WHERE channel_id=$1 AND user_id=$2',
        [channelId,me]);
      const last=attempts.rows[0];
      if(last&&last.failed_count>=5&&Date.now()-new Date(last.last_failed_at).getTime()<15*60*1000)
        return reply.code(429).send({error:'CHANNEL_PASSWORD_RATE_LIMIT'});
      if(!verifyChannelPassword(password,row.rows[0].password_hash as string)){
        await getPool().query(
          'INSERT INTO community_channel_password_attempts(channel_id,user_id,failed_count,last_failed_at) VALUES($1,$2,1,now()) '+
          "ON CONFLICT(channel_id,user_id) DO UPDATE SET failed_count=CASE WHEN community_channel_password_attempts.last_failed_at<now()-interval '15 minutes' THEN 1 ELSE community_channel_password_attempts.failed_count+1 END,last_failed_at=now()",
          [channelId,me]);
        return reply.code(403).send({error:'INVALID_CHANNEL_PASSWORD'});
      }
      await getPool().query('INSERT INTO community_channel_password_access(channel_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[channelId,me]);
      await getPool().query('DELETE FROM community_channel_password_attempts WHERE channel_id=$1 AND user_id=$2',[channelId,me]);
      return reply.header('Cache-Control',noCache).send({unlocked:true});
    }catch(error){request.log.error({err:error},'Unlock community channel');return reply.code(503).send({error:'Unavailable'});}
  });

  app.get('/api/v1/communities/:id/channels/:channelId/messages',{schema:{params:channelParams}},async(request,reply)=>{
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,channelId}=request.params as {id:string;channelId:string};
      const readerRole=await membership(id,me);
      if(!readerRole)return reply.code(403).send({error:'MEMBERS_ONLY'});
      const gate=await channelGate(id,channelId,me);
      if(gate!=='allowed')return reply.code(channelGateStatus(gate)).send({error:channelGateError(gate)});
      const check=await getPool().query('SELECT 1 FROM community_channels WHERE id=$1 AND community_id=$2',[channelId,id]);
      if(!check.rowCount)return reply.code(404).send({error:'Channel not found'});
      // An additive migration can deploy after the API; keep channel history readable
      // until the reactions table is actually available in the active database.
      const ready=await getPool().query("SELECT to_regclass('public.community_message_reactions') IS NOT NULL AS enabled");
      const attachmentReady=await getPool().query("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='community_messages' AND column_name='attachment_id') AS enabled");
      const attachmentProjection=attachmentReady.rows[0]?.enabled?
        'CASE WHEN m.deleted_at IS NOT NULL OR m.attachment_id IS NULL THEN NULL ELSE jsonb_build_object(\'id\',m.attachment_id,\'name\',m.attachment_name,\'type\',m.attachment_type,\'size\',m.attachment_size) END AS attachment,':
        'NULL::jsonb AS attachment,';
      const reactionProjection=ready.rows[0]?.enabled?
        'CASE WHEN m.deleted_at IS NOT NULL THEN \'[]\'::jsonb ELSE COALESCE(('+
        'SELECT jsonb_agg(jsonb_build_object(\'emoji\',rx.emoji,\'count\',rx.total,\'mine\',rx.mine) ORDER BY rx.total DESC,rx.emoji) '+
        'FROM (SELECT emoji,COUNT(*)::int AS total,BOOL_OR(user_id=$2) AS mine FROM community_message_reactions '+
        'WHERE message_id=m.id GROUP BY emoji) rx),\'[]\'::jsonb) END AS reactions ':
        "\'[]\'::jsonb AS reactions ";
      const result=await getPool().query(
        'SELECT m.id,m.client_id AS "clientId",m.author_id AS "authorId",'+
        'CASE WHEN m.deleted_at IS NULL THEN m.body ELSE NULL END AS body,m.created_at AS "createdAt",'+
        'm.edited_at AS "editedAt",m.deleted_at AS "deletedAt",m.reply_to_id AS "replyToId",'+
        'u.handle AS "authorHandle",'+
        'CASE WHEN p.is_public=true OR m.author_id=$2 OR friends.status=\'accepted\' THEN p.display_name ELSE u.handle END AS "authorName",'+
        'CASE WHEN (p.is_public=true OR m.author_id=$2 OR friends.status=\'accepted\') AND '+
        'NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id=m.author_id AND b.blocked_id=$2) OR (b.blocker_id=$2 AND b.blocked_id=m.author_id)) '+
        'THEN p.avatar_url ELSE NULL END AS "authorAvatar",'+
         'CASE WHEN original.id IS NULL THEN NULL ELSE jsonb_build_object('+
         "'id',original.id,'body',CASE WHEN original.deleted_at IS NULL THEN LEFT(original.body,220) ELSE NULL END,"+
         "'authorHandle',ou.handle,'deleted',original.deleted_at IS NOT NULL) END AS \"replyTo\",'+attachmentProjection+reactionProjection+
        'FROM community_messages m JOIN users u ON u.id=m.author_id JOIN profiles p ON p.user_id=m.author_id '+
         'LEFT JOIN community_messages original ON original.id=m.reply_to_id AND original.channel_id=m.channel_id '+
         'LEFT JOIN users ou ON ou.id=original.author_id '+
        'LEFT JOIN user_friendships friends ON friends.user_a_id=LEAST(m.author_id,$2::uuid) AND friends.user_b_id=GREATEST(m.author_id,$2::uuid) '+
        'WHERE m.channel_id=$1 ORDER BY m.created_at DESC,m.id DESC LIMIT 100',[channelId,me]);
      return reply.header('Cache-Control',noCache).send({
        messages:result.rows.reverse().map(({authorId,...row})=>({
          ...row,canReact:Boolean(ready.rows[0]?.enabled)&&authorId!==me&&!row.deletedAt,canEdit:authorId===me&&!row.deletedAt,
          canDelete:(!row.deletedAt)&&(authorId===me||['owner','admin','moderator'].includes(readerRole)),
        }))
      });
    }catch(error){request.log.error({err:error},'Read community messages');return reply.code(503).send({error:'Unavailable'});}
  });

  app.post('/api/v1/communities/:id/channels/:channelId/messages',{schema:{params:channelParams,body:messageBody}},async(request,reply)=>{
    if(!originValid(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,channelId}=request.params as {id:string;channelId:string};
      const {clientId,body,replyToId,attachment}=request.body as {clientId:string;body:string;replyToId?:string;attachment?:{id:string;name:string;type:string;size:number}};
      const clean=body.trim();
      if((!clean&&!attachment)||clean.length>4000)return reply.code(400).send({error:'Invalid message'});
      if(!await membership(id,me))return reply.code(403).send({error:'MEMBERS_ONLY'});
      const gate=await channelGate(id,channelId,me);
      if(gate!=='allowed')return reply.code(channelGateStatus(gate)).send({error:channelGateError(gate)});
      if(attachment){
        if(!communityAttachmentTypes.has(attachment.type)||attachment.name!==attachment.name.trim()||
           /[\\/\r\n\u0000-\u001f]/.test(attachment.name)||!verifiedCommunityUpload(request,id,channelId,clientId,attachment))
          return reply.code(403).send({error:'Invalid attachment upload proof'});
        const ready=await getPool().query("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='community_messages' AND column_name='attachment_id') AS enabled");
        if(!ready.rows[0]?.enabled)return reply.code(503).send({error:'ATTACHMENTS_NOT_READY'});
      }
      if(replyToId){
        const target=await getPool().query('SELECT 1 FROM community_messages WHERE id=$1 AND channel_id=$2 AND deleted_at IS NULL',[replyToId,channelId]);
        if(!target.rowCount)return reply.code(404).send({error:'REPLY_TARGET_UNAVAILABLE'});
      }
      const limit=await getPool().query(
        'SELECT COUNT(*)::int AS n FROM community_messages WHERE channel_id=$1 AND author_id=$2 AND created_at>now()-interval \'1 minute\'',
        [channelId,me]);
      if(Number(limit.rows[0].n)>=30)return reply.code(429).send({error:'MESSAGE_RATE_LIMIT'});
      const insertColumns=attachment?'(channel_id,author_id,client_id,body,reply_to_id,attachment_id,attachment_name,attachment_type,attachment_size)':'(channel_id,author_id,client_id,body,reply_to_id)';
      const insertValues=attachment?'SELECT ch.id,$3,$4,$5,$6,$7,$8,$9,$10 ':'SELECT ch.id,$3,$4,$5,$6 ';
      const saved=await getPool().query(
        'INSERT INTO community_messages'+insertColumns+' '+insertValues+
        'FROM community_channels ch JOIN community_members cm ON cm.community_id=ch.community_id AND cm.user_id=$3 '+
        "WHERE ch.id=$1 AND ch.community_id=$2 "+
        'ON CONFLICT(client_id) DO NOTHING RETURNING id',
        attachment?[channelId,id,me,clientId,clean,replyToId??null,attachment.id,attachment.name,attachment.type,attachment.size]:[channelId,id,me,clientId,clean,replyToId??null]);
      if(!saved.rowCount){
        const existing=await getPool().query('SELECT id,body,author_id FROM community_messages WHERE client_id=$1 AND channel_id=$2',[clientId,channelId]);
        if(!existing.rowCount||existing.rows[0].author_id!==me)return reply.code(404).send({error:'Channel unavailable'});
        return reply.header('Cache-Control',noCache).send({id:existing.rows[0].id,duplicate:true});
      }
      void publishCommunityEvent(id,channelId,'message').catch(()=>{});
      void pushCommunityMessage(saved.rows[0].id).catch(error=>request.log.warn({err:error},'Channel push unavailable'));
      return reply.code(201).header('Cache-Control',noCache).send({id:saved.rows[0].id});
    }catch(error){request.log.error({err:error},'Send community message');return reply.code(503).send({error:'Unavailable'});}
  });

  // The Worker authorizes and signs uploads before saving objects in private R2.
  app.get('/api/v1/communities/:id/channels/:channelId/attachments/allowed',
    {schema:{params:channelParams}},async(request,reply)=>{
      try{
        const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
        const {id,channelId}=request.params as {id:string;channelId:string};
        if(!await membership(id,me))return reply.code(403).send({error:'MEMBERS_ONLY'});
        const gate=await channelGate(id,channelId,me);
        if(gate!=='allowed')return reply.code(channelGateStatus(gate)).send({error:channelGateError(gate)});
        const ch=await getPool().query("SELECT 1 FROM community_channels WHERE id=$1 AND community_id=$2",[channelId,id]);
        if(!ch.rowCount)return reply.code(404).send({error:'Channel unavailable'});
        const ready=await getPool().query("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='community_messages' AND column_name='attachment_id') AS enabled");
        if(!ready.rows[0]?.enabled)return reply.code(503).send({error:'ATTACHMENTS_NOT_READY'});
        return reply.header('Cache-Control',noCache).send({allowed:true});
      }catch(error){request.log.error({err:error},'Community upload permission');return reply.code(503).send({error:'Unavailable'});}
    });
  app.get('/api/v1/communities/:id/channels/:channelId/attachments/:attachmentId/access',
    {schema:{params:mediaParams}},async(request,reply)=>{
      try{
        const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
        const {id,channelId,attachmentId}=request.params as {id:string;channelId:string;attachmentId:string};
        if(!await membership(id,me))return reply.code(403).send({error:'MEMBERS_ONLY'});
        const gate=await channelGate(id,channelId,me);
        if(gate!=='allowed')return reply.code(channelGateStatus(gate)).send({error:channelGateError(gate)});
        const r=await getPool().query(
          'SELECT m.attachment_name AS name,m.attachment_type AS type,m.attachment_size AS size '+
          'FROM community_messages m JOIN community_channels ch ON ch.id=m.channel_id '+
          "WHERE ch.community_id=$1 AND ch.id=$2 AND m.attachment_id=$3 AND m.deleted_at IS NULL",
          [id,channelId,attachmentId]);
        if(!r.rowCount)return reply.code(404).send({error:'Attachment unavailable'});
        return reply.header('Cache-Control',noCache).send({allowed:true,...r.rows[0]});
      }catch(error){request.log.error({err:error},'Community attachment access');return reply.code(503).send({error:'Unavailable'});}
    });

  // Each member can add or remove one reaction per emoji. Mutations are idempotent,
  // so retries never toggle a reaction twice on a slow or interrupted connection.
  async function react(request:FastifyRequest,reply:any,add:boolean){
    if(!originValid(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,channelId,messageId}=request.params as {id:string;channelId:string;messageId:string};
      const {emoji}=request.body as {emoji:string};
      if(!reactionEmojis.includes(emoji as typeof reactionEmojis[number]))
        return reply.code(400).send({error:'Invalid reaction'});
      if(!await membership(id,me))return reply.code(403).send({error:'MEMBERS_ONLY'});
      const gate=await channelGate(id,channelId,me);
      if(gate!=='allowed')return reply.code(channelGateStatus(gate)).send({error:channelGateError(gate)});
      const ready=await getPool().query("SELECT to_regclass('public.community_message_reactions') IS NOT NULL AS enabled");
      if(!ready.rows[0]?.enabled)return reply.code(503).send({error:'REACTIONS_NOT_READY'});
      const allowed=await getPool().query(
        'SELECT m.author_id,m.deleted_at FROM community_messages m JOIN community_channels ch ON ch.id=m.channel_id '+
        "WHERE m.id=$1 AND ch.id=$2 AND ch.community_id=$3 LIMIT 1",
        [messageId,channelId,id]);
      if(!allowed.rowCount||allowed.rows[0].deleted_at)return reply.code(404).send({error:'Message unavailable'});
      if(allowed.rows[0].author_id===me)return reply.code(403).send({error:'OWN_MESSAGE_REACTION'});
      if(add){
        await getPool().query(
          'INSERT INTO community_message_reactions(message_id,user_id,emoji) '+
          'SELECT m.id,$2,$3 FROM community_messages m '+
          'JOIN community_channels ch ON ch.id=m.channel_id '+
          'JOIN community_members cm ON cm.community_id=ch.community_id AND cm.user_id=$2 '+
          'WHERE m.id=$1 AND m.deleted_at IS NULL AND m.author_id<>$2 AND ch.id=$4 AND ch.community_id=$5 '+
          'ON CONFLICT DO NOTHING',[messageId,me,emoji,channelId,id]);
      }else{
        await getPool().query(
          'DELETE FROM community_message_reactions r USING community_messages m,community_channels ch,community_members cm '+
          'WHERE r.message_id=m.id AND m.channel_id=ch.id AND cm.community_id=ch.community_id AND cm.user_id=$2 '+
          'AND m.deleted_at IS NULL AND m.author_id<>$2 AND r.message_id=$1 AND r.user_id=$2 '+
          'AND r.emoji=$3 AND ch.id=$4 AND ch.community_id=$5',
          [messageId,me,emoji,channelId,id]);
      }
      const counts=await getPool().query(
        'SELECT emoji,COUNT(*)::int AS count,BOOL_OR(user_id=$2) AS mine '+
        'FROM community_message_reactions WHERE message_id=$1 GROUP BY emoji ORDER BY count DESC,emoji',
        [messageId,me]);
      return reply.header('Cache-Control',noCache).send({reactions:counts.rows});
    }catch(error){request.log.error({err:error},'React to community message');return reply.code(503).send({error:'Unavailable'});}
  }

  // Only members allowed to read this channel can inspect reaction identities.
  app.get('/api/v1/communities/:id/channels/:channelId/messages/:messageId/reactors',{
    schema:{params:reactionParams,querystring:{type:'object',required:['emoji'],additionalProperties:false,
      properties:{emoji:{type:'string',enum:[...reactionEmojis]}}}}
  },async(request,reply)=>{
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,channelId,messageId}=request.params as {id:string;channelId:string;messageId:string};
      const {emoji}=request.query as {emoji:string};
      if(!await membership(id,me))return reply.code(403).send({error:'MEMBERS_ONLY'});
      const gate=await channelGate(id,channelId,me);
      if(gate!=='allowed')return reply.code(channelGateStatus(gate)).send({error:channelGateError(gate)});
      const exists=await getPool().query('SELECT 1 FROM community_messages WHERE id=$1 AND channel_id=$2 AND deleted_at IS NULL',[messageId,channelId]);
      if(!exists.rowCount)return reply.code(404).send({error:'Message unavailable'});
      const result=await getPool().query(
        'SELECT u.handle,CASE WHEN p.is_public OR friends.status=\'accepted\' OR u.id=$2 THEN p.display_name ELSE u.handle END AS name,'+
        'CASE WHEN p.is_public OR friends.status=\'accepted\' OR u.id=$2 THEN p.avatar_url ELSE NULL END AS "avatarUrl" '+
        'FROM community_message_reactions reaction JOIN users u ON u.id=reaction.user_id JOIN profiles p ON p.user_id=u.id '+
        'LEFT JOIN user_friendships friends ON friends.user_a_id=LEAST(u.id,$2::uuid) AND friends.user_b_id=GREATEST(u.id,$2::uuid) '+
        'WHERE reaction.message_id=$1 AND reaction.emoji=$3 '+
        'AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=u.id AND b.blocked_id=$2) OR (b.blocker_id=$2 AND b.blocked_id=u.id)) '+
        'ORDER BY reaction.created_at ASC LIMIT 100',[messageId,me,emoji]);
      return reply.header('Cache-Control',noCache).send({users:result.rows});
    }catch(error){request.log.error({err:error},'List channel reactors');return reply.code(503).send({error:'Unavailable'});}
  });

  app.put('/api/v1/communities/:id/channels/:channelId/messages/:messageId/reactions',
    {schema:{params:reactionParams,body:reactionBody}},async(request,reply)=>react(request,reply,true));

  app.delete('/api/v1/communities/:id/channels/:channelId/messages/:messageId/reactions',
    {schema:{params:reactionParams,body:reactionBody}},async(request,reply)=>react(request,reply,false));
}
