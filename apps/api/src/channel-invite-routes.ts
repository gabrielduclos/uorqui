import {createHash,randomBytes} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {getPool} from './db/client.js';
import {validRequestOrigin} from './request-origin.js';
import {publishCommunityEvent,publishCommunityMembershipForUser} from './community-events.js';

type Reader=(request:FastifyRequest)=>Promise<{user:{id:string}}|null>;
const uuid={type:'string',format:'uuid'} as const;
const handle={type:'string',pattern:'^[a-z][a-z0-9_]{2,31}$',maxLength:32} as const;
const tokenPattern='^[A-Za-z0-9_-]{43}$';
const tokenBody={type:'object',required:['token'],additionalProperties:false,
  properties:{token:{type:'string',pattern:tokenPattern,minLength:43,maxLength:43}}} as const;
const createBody={type:'object',additionalProperties:false,properties:{handle}} as const;
const channelParams={type:'object',required:['id','channelId'],additionalProperties:false,
  properties:{id:uuid,channelId:uuid}} as const;
const noStore='private, no-store';
const digest=(token:string)=>createHash('sha256').update(token).digest('hex');

export function registerChannelInviteRoutes(app:FastifyInstance,session:Reader){
  async function self(request:FastifyRequest):Promise<string|null>{
    const auth=await session(request);
    return auth?.user.id??null;
  }
  const issuerAllowed=(role:string|null,grant:boolean)=>
    role==='owner'||role==='admin'||(role==='moderator'&&grant);

  /** One-use 256-bit bearer token. Never persist or log the token; only SHA-256. */
  app.post('/api/v1/communities/:id/channels/:channelId/invites',{
    schema:{params:channelParams,body:createBody}
  },async(request,reply)=>{
    reply.header('Cache-Control',noStore).header('Referrer-Policy','no-referrer');
    if(!validRequestOrigin(request))return reply.code(403).send({error:'INVALID_ORIGIN'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,channelId}=request.params as {id:string;channelId:string};
      const {handle:recipientHandle}=request.body as {handle?:string};
      const client=await getPool().connect();
      try{
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 90371))',[channelId+':'+me]);
        const access=await client.query<{role:string;granted:boolean}>(
          'SELECT cm.role,EXISTS(SELECT 1 FROM community_channel_member_access g '+
          'WHERE g.channel_id=ch.id AND g.user_id=$3) AS granted '+
          'FROM community_channels ch JOIN community_members cm ON cm.community_id=ch.community_id AND cm.user_id=$3 '+
          "WHERE ch.community_id=$1 AND ch.id=$2 AND ch.access_mode='restricted' "+
          "AND NOT EXISTS(SELECT 1 FROM community_bans b WHERE b.community_id=$1 AND b.user_id=$3)",
          [id,channelId,me]);
        const member=access.rows[0];
        if(!member||!issuerAllowed(member.role,member.granted)){
          await client.query('ROLLBACK');return reply.code(403).send({error:'CHANNEL_INVITE_FORBIDDEN'});
        }
        let recipientId:string|null=null;
        if(recipientHandle){
          const recipient=await client.query<{id:string}>(
            'SELECT u.id FROM users u WHERE u.handle=$1 AND NOT EXISTS '+
            '(SELECT 1 FROM community_bans b WHERE b.community_id=$2 AND b.user_id=u.id)',
            [recipientHandle,id]);
          if(!recipient.rows[0]){
            await client.query('ROLLBACK');return reply.code(404).send({error:'RECIPIENT_UNAVAILABLE'});
          }
          recipientId=recipient.rows[0].id;
        }
        const limit=await client.query<{n:number}>(
          'SELECT count(*)::integer AS n FROM community_channel_invite_links '+
          'WHERE channel_id=$1 AND created_by_id=$2 AND revoked_at IS NULL AND redeemed_at IS NULL AND expires_at>now()',
          [channelId,me]);
        if((limit.rows[0]?.n??0)>=10){
          await client.query('ROLLBACK');
          return reply.header('Retry-After','3600').code(429).send({error:'CHANNEL_INVITE_LIMIT'});
        }
        const token=randomBytes(32).toString('base64url');
        const created=await client.query<{expiresAt:string}>(
          'INSERT INTO community_channel_invite_links '+
          '(token_hash,community_id,channel_id,created_by_id,recipient_id,expires_at) '+
          "VALUES($1,$2,$3,$4,$5,now()+interval '24 hours') RETURNING expires_at AS \"expiresAt\"",
          [digest(token),id,channelId,me,recipientId]);
        await client.query('COMMIT');
        return reply.code(201).send({token,expiresAt:created.rows[0].expiresAt,recipientBound:!!recipientId});
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    }catch(e){request.log.error({err:e},'Create restricted channel invite');return reply.code(503).send({error:'Unavailable'});}
  });

  app.post('/api/v1/channel-invites/preview',{schema:{body:tokenBody}},async(request,reply)=>{
    reply.header('Cache-Control',noStore).header('Referrer-Policy','no-referrer');
    if(!validRequestOrigin(request))return reply.code(403).send({error:'INVALID_ORIGIN'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {token}=request.body as {token:string};
      const result=await getPool().query<{
        communityId:string;channelId:string;communityName:string;channelName:string;
        hasPassword:boolean;meetingApproval:boolean;recipientId:string|null;role:string|null;granted:boolean
      }>(
        'SELECT li.community_id AS "communityId",li.channel_id AS "channelId",c.name AS "communityName", '+
        'ch.name AS "channelName",ch.password_hash IS NOT NULL AS "hasPassword", '+
        "(ch.kind='meeting' AND ch.meeting_join_policy='approval') AS \"meetingApproval\", "+
        'li.recipient_id AS "recipientId",issuer.role, '+
        'EXISTS(SELECT 1 FROM community_channel_member_access g WHERE g.channel_id=li.channel_id '+
        'AND g.user_id=li.created_by_id) AS granted '+
        'FROM community_channel_invite_links li JOIN communities c ON c.id=li.community_id '+
        'JOIN community_channels ch ON ch.id=li.channel_id AND ch.community_id=li.community_id '+
        'LEFT JOIN community_members issuer ON issuer.community_id=li.community_id AND issuer.user_id=li.created_by_id '+
        "WHERE li.token_hash=$1 AND li.revoked_at IS NULL AND li.redeemed_at IS NULL AND li.expires_at>now() "+
        "AND ch.access_mode='restricted' "+
        'AND NOT EXISTS(SELECT 1 FROM community_bans b WHERE b.community_id=li.community_id AND b.user_id=$2) '+
        'AND NOT EXISTS(SELECT 1 FROM community_bans b WHERE b.community_id=li.community_id AND b.user_id=li.created_by_id)',
        [digest(token),me]);
      const row=result.rows[0];
      if(!row||!issuerAllowed(row.role,row.granted)||(row.recipientId&&row.recipientId!==me))
        return reply.code(404).send({error:'CHANNEL_INVITE_UNAVAILABLE'});
      return reply.send({invitation:{
        communityId:row.communityId,channelId:row.channelId,communityName:row.communityName,
        channelName:row.channelName,hasPassword:row.hasPassword,meetingApproval:row.meetingApproval,
      }});
    }catch(e){request.log.error({err:e},'Preview restricted channel invite');return reply.code(503).send({error:'Unavailable'});}
  });

  app.post('/api/v1/channel-invites/redeem',{schema:{body:tokenBody}},async(request,reply)=>{
    reply.header('Cache-Control',noStore).header('Referrer-Policy','no-referrer');
    if(!validRequestOrigin(request))return reply.code(403).send({error:'INVALID_ORIGIN'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {token}=request.body as {token:string};
      const client=await getPool().connect();
      let communityId:string|null=null,channelId:string|null=null;
      try{
        await client.query('BEGIN');
        // FOR UPDATE consumes a token atomically: never two successful redeemers.
        const found=await client.query<{
          communityId:string;channelId:string;recipientId:string|null;createdById:string;
          role:string|null;granted:boolean;restricted:boolean
        }>(
          'SELECT li.community_id AS "communityId",li.channel_id AS "channelId",li.recipient_id AS "recipientId", '+
          'li.created_by_id AS "createdById",issuer.role, '+
          'EXISTS(SELECT 1 FROM community_channel_member_access g WHERE g.channel_id=li.channel_id '+
          'AND g.user_id=li.created_by_id) AS granted, '+
          "(ch.access_mode='restricted') AS restricted "+
          'FROM community_channel_invite_links li JOIN community_channels ch '+
          'ON ch.id=li.channel_id AND ch.community_id=li.community_id '+
          'LEFT JOIN community_members issuer ON issuer.community_id=li.community_id AND issuer.user_id=li.created_by_id '+
          'WHERE li.token_hash=$1 AND li.revoked_at IS NULL AND li.redeemed_at IS NULL AND li.expires_at>now() '+
          'FOR UPDATE OF li',
          [digest(token)]);
        const row=found.rows[0];
        if(!row||!row.restricted||!issuerAllowed(row.role,row.granted)||
           (row.recipientId&&row.recipientId!==me)){
          await client.query('ROLLBACK');return reply.code(410).send({error:'CHANNEL_INVITE_UNAVAILABLE'});
        }
        const ban=await client.query(
          'SELECT 1 FROM community_bans WHERE community_id=$1 AND user_id=ANY($2::uuid[])',
          [row.communityId,[me,row.createdById]]);
        if(ban.rowCount){await client.query('ROLLBACK');return reply.code(403).send({error:'COMMUNITY_BANNED'});}
        await client.query(
          "INSERT INTO community_members(community_id,user_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING",
          [row.communityId,me]);
        await client.query(
          'INSERT INTO community_channel_member_access(channel_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [row.channelId,me]);
        await client.query('DELETE FROM community_join_requests WHERE community_id=$1 AND user_id=$2',
          [row.communityId,me]);
        await client.query(
          'UPDATE community_channel_invite_links SET redeemed_at=now(),redeemed_by_id=$2 WHERE token_hash=$1',
          [digest(token),me]);
        await client.query('COMMIT');
        communityId=row.communityId;channelId=row.channelId;
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
      if(communityId&&channelId){
        void publishCommunityMembershipForUser(communityId,me).catch(()=>{});
        void publishCommunityEvent(communityId,null,'membership').catch(()=>{});
        return reply.send({joined:true,communityId,channelId});
      }
      return reply.code(503).send({error:'Unavailable'});
    }catch(e){request.log.error({err:e},'Redeem restricted channel invite');return reply.code(503).send({error:'Unavailable'});}
  });

  app.post('/api/v1/channel-invites/revoke',{schema:{body:tokenBody}},async(request,reply)=>{
    reply.header('Cache-Control',noStore);
    if(!validRequestOrigin(request))return reply.code(403).send({error:'INVALID_ORIGIN'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {token}=request.body as {token:string};
      // The issuer may revoke their unspent link, even after losing channel privileges.
      const result=await getPool().query(
        'UPDATE community_channel_invite_links SET revoked_at=now() '+
        'WHERE token_hash=$1 AND created_by_id=$2 AND revoked_at IS NULL AND redeemed_at IS NULL RETURNING token_hash',
        [digest(token),me]);
      return reply.send({revoked:!!result.rowCount});
    }catch(e){request.log.error({err:e},'Revoke restricted channel invite');return reply.code(503).send({error:'Unavailable'});}
  });
}
