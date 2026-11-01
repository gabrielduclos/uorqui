import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getPool } from './db/client.js';

type SessionReader=(request:FastifyRequest)=>Promise<{user:{id:string}}|null>;
const uuid={type:'string',format:'uuid'} as const;
const handle={type:'string',pattern:'^[a-z][a-z0-9_]{2,31}$'} as const;
const idParams={type:'object',required:['id'],additionalProperties:false,properties:{id:uuid}};
const memberParams={type:'object',required:['id','handle'],additionalProperties:false,properties:{id:uuid,handle}};
const channelParams={type:'object',required:['id','channelId'],additionalProperties:false,properties:{id:uuid,channelId:uuid}};
const messageParams={type:'object',required:['id','channelId','messageId'],additionalProperties:false,properties:{id:uuid,channelId:uuid,messageId:uuid}};
const roleBody={type:'object',required:['role'],additionalProperties:false,properties:{role:{type:'string',enum:['admin','moderator','member']}}};
const banBody={type:'object',required:['handle'],additionalProperties:false,properties:{handle,reason:{type:'string',maxLength:300}}};
const channelBody={type:'object',required:['name'],additionalProperties:false,properties:{name:{type:'string',minLength:2,maxLength:64}}};
const editBody={type:'object',required:['body'],additionalProperties:false,properties:{body:{type:'string',minLength:1,maxLength:4000}}};
const communitySettingsBody={type:'object',additionalProperties:false,minProperties:1,properties:{
  name:{type:'string',minLength:2,maxLength:120},
  description:{type:'string',maxLength:500},
  avatarUrl:{anyOf:[{type:'string',pattern:'^/media/community/[0-9a-f-]{36}/[0-9a-f-]{36}\\.(webp|jpg|png)$'},{type:'null'}]}
}};
const communityMediaParams={type:'object',required:['id','asset'],additionalProperties:false,properties:{
  id:uuid,asset:{type:'string',pattern:'^[0-9a-f-]{36}\\.(webp|jpg|png)$'}
}};
const ranks:Record<string,number>={owner:4,admin:3,moderator:2,member:1};
const noCache='private, no-store';
const origin=(req:FastifyRequest)=>req.headers.origin===(process.env.WEB_ORIGIN??'http://localhost:5173');

export function registerCommunityModerationRoutes(app:FastifyInstance,reader:SessionReader){
  async function self(request:FastifyRequest){
    const s=await reader(request);if(!s)return null;
    const r=await getPool().query('SELECT id FROM users WHERE id=$1',[s.user.id]);
    return (r.rows[0]?.id as string|undefined)??null;
  }
  async function role(id:string,me:string){
    const r=await getPool().query('SELECT role FROM community_members WHERE community_id=$1 AND user_id=$2',[id,me]);
    return (r.rows[0]?.role as string|undefined)??null;
  }

  // Metadata is controlled by owner/admin. The media Worker verifies an upload
  // against this endpoint before writing to R2, and uses PATCH after the put.
  app.get('/api/v1/communities/:id/media/upload-access',{schema:{params:idParams}},async(request,reply)=>{
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      if((ranks[(await role(id,me))??'']??0)<3)return reply.code(403).send({error:'ADMIN_REQUIRED'});
      const r=await getPool().query('SELECT avatar_url AS "avatarUrl" FROM communities WHERE id=$1',[id]);
      if(!r.rowCount)return reply.code(404).send({error:'Community not found'});
      return reply.header('Cache-Control',noCache).send({authorized:true,avatarUrl:r.rows[0].avatarUrl});
    }catch(error){request.log.error({err:error},'Community media upload permission');return reply.code(503).send({error:'Unavailable'});}
  });

  app.get('/api/v1/communities/:id/media/:asset/access',{schema:{params:communityMediaParams}},async(request,reply)=>{
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,asset}=request.params as {id:string;asset:string};
      const r=await getPool().query(
        'SELECT 1 FROM communities c LEFT JOIN community_members m ON m.community_id=c.id AND m.user_id=$2 '+
        'LEFT JOIN community_join_requests invite ON invite.community_id=c.id AND invite.user_id=$2 AND invite.kind=\'invite\' AND invite.status=\'pending\' '+
        'WHERE c.id=$1 AND c.avatar_url=$3 AND NOT EXISTS '+
        '(SELECT 1 FROM community_bans b WHERE b.community_id=c.id AND b.user_id=$2) '+
        "AND (c.visibility<>'private' OR m.user_id IS NOT NULL OR invite.user_id IS NOT NULL)",
        [id,me,'/media/community/'+id+'/'+asset]);
      if(!r.rowCount)return reply.code(404).send({error:'Image unavailable'});
      return reply.header('Cache-Control',noCache).send({authorized:true});
    }catch(error){request.log.error({err:error},'Community avatar permission');return reply.code(503).send({error:'Unavailable'});}
  });

  app.patch('/api/v1/communities/:id',{schema:{params:idParams,body:communitySettingsBody}},async(request,reply)=>{
    if(!origin(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      const updates=request.body as {name?:string;description?:string;avatarUrl?:string|null};
      const roleValue=await role(id,me);
      if(!roleValue||ranks[roleValue]<3)return reply.code(403).send({error:'ADMIN_REQUIRED'});
      const name=updates.name?.trim();
      if(name!==undefined&&name.length<2)return reply.code(400).send({error:'Invalid community name'});
      const url=updates.avatarUrl;
      if(url!==undefined&&url!==null&&!url.startsWith('/media/community/'+id+'/'))
        return reply.code(400).send({error:'Invalid community image'});
      const r=await getPool().query(
        'UPDATE communities SET name=COALESCE($3,name),description=CASE WHEN $4::boolean THEN $5 ELSE description END,'+
        'avatar_url=CASE WHEN $6::boolean THEN $7 ELSE avatar_url END '+
        'WHERE id=$1 AND EXISTS(SELECT 1 FROM community_members WHERE community_id=$1 AND user_id=$2 AND role IN (\'owner\',\'admin\')) '+
        'RETURNING id,name,description,avatar_url AS "avatarUrl"',
        [id,me,name??null,updates.description!==undefined,updates.description?.trim()??null,url!==undefined,url??null]);
      if(!r.rowCount)return reply.code(403).send({error:'ADMIN_REQUIRED'});
      return reply.header('Cache-Control',noCache).send({community:r.rows[0]});
    }catch(error){request.log.error({err:error},'Edit community');return reply.code(503).send({error:'Unavailable'});}
  });

  app.delete('/api/v1/communities/:id',{schema:{params:idParams}},async(request,reply)=>{
    if(!origin(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      const r=await getPool().query('DELETE FROM communities WHERE id=$1 AND owner_id=$2 RETURNING avatar_url AS "avatarUrl"',[id,me]);
      if(!r.rowCount)return reply.code(403).send({error:'OWNER_REQUIRED'});
      return reply.header('Cache-Control',noCache).send({deleted:true,avatarUrl:r.rows[0].avatarUrl});
    }catch(error){request.log.error({err:error},'Delete community');return reply.code(503).send({error:'Unavailable'});}
  });

  app.get('/api/v1/communities/:id/moderation',{schema:{params:idParams}},async(request,reply)=>{
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      const myRole=await role(id,me);
      if(!myRole||ranks[myRole]<2)return reply.code(403).send({error:'MODERATOR_REQUIRED'});
      const [members,bans]=await Promise.all([
        getPool().query(
          'SELECT u.handle,CASE WHEN p.is_public=true OR u.id=$2 OR friends.status=\'accepted\' THEN p.display_name ELSE u.handle END AS "displayName",'+
          'cm.role,cm.joined_at AS "joinedAt" FROM community_members cm '+
          'JOIN users u ON u.id=cm.user_id JOIN profiles p ON p.user_id=cm.user_id '+
          'LEFT JOIN user_friendships friends ON friends.user_a_id=LEAST(cm.user_id,$2::uuid) AND friends.user_b_id=GREATEST(cm.user_id,$2::uuid) '+
          'WHERE cm.community_id=$1 ORDER BY cm.joined_at,u.handle LIMIT 500',[id,me]),
        getPool().query(
          'SELECT u.handle,b.reason,b.created_at AS "bannedAt" FROM community_bans b JOIN users u ON u.id=b.user_id '+
          'WHERE b.community_id=$1 ORDER BY b.created_at DESC LIMIT 500',[id])
      ]);
      return reply.header('Cache-Control',noCache).send({members:members.rows,bans:bans.rows,myRole});
    }catch(error){request.log.error({err:error},'List community moderation');return reply.code(503).send({error:'Unavailable'});}
  });

  app.post('/api/v1/communities/:id/members/:handle/role',{schema:{params:memberParams,body:roleBody}},async(request,reply)=>{
    if(!origin(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,handle:h}=request.params as {id:string;handle:string};
      const {role:next}=request.body as {role:'admin'|'moderator'|'member'};
      const client=await getPool().connect();
      try {
        await client.query('BEGIN');
        const people=await client.query(
          'SELECT m.user_id,m.role,u.handle FROM community_members m JOIN users u ON u.id=m.user_id '+
          'WHERE m.community_id=$1 AND (m.user_id=$2 OR u.handle=$3) FOR UPDATE OF m',[id,me,h]);
        const actor=people.rows.find(p=>p.user_id===me),target=people.rows.find(p=>p.handle===h);
        if(!actor||!target){await client.query('ROLLBACK');return reply.code(404).send({error:'Member not found'});}
        if(target.user_id===me||target.role==='owner'||ranks[actor.role]<=ranks[target.role]||
          ranks[actor.role]<=ranks[next]||ranks[actor.role]<3){
          await client.query('ROLLBACK');return reply.code(403).send({error:'ROLE_NOT_ALLOWED'});
        }
        await client.query('UPDATE community_members SET role=$3 WHERE community_id=$1 AND user_id=$2',[id,target.user_id,next]);
        await client.query('COMMIT');
        return reply.header('Cache-Control',noCache).send({handle:h,role:next});
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    }catch(error){request.log.error({err:error},'Set community role');return reply.code(503).send({error:'Unavailable'});}
  });

  async function removeMember(request:FastifyRequest,reply:any,ban:boolean,targetHandle?:string){
    if(!origin(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,handle:requestedHandle}=request.params as {id:string;handle?:string};
      const h=targetHandle??requestedHandle;
      const reason=ban?((request.body as {handle:string;reason?:string}).reason??'').trim():null;
      const client=await getPool().connect();
      try {
        await client.query('BEGIN');
        const people=await client.query(
          'SELECT m.user_id,m.role,u.handle FROM community_members m JOIN users u ON u.id=m.user_id '+
          'WHERE m.community_id=$1 AND (m.user_id=$2 OR u.handle=$3) FOR UPDATE OF m',[id,me,h]);
        const actor=people.rows.find(p=>p.user_id===me),target=people.rows.find(p=>p.handle===h);
        if(!actor||ranks[actor.role]<2){await client.query('ROLLBACK');return reply.code(403).send({error:'MODERATOR_REQUIRED'});}
        // For bans the target may have left. Resolve by exact handle without disclosing nonmembers.
        const other=target?.user_id??(ban?(await client.query('SELECT id FROM users WHERE handle=$1',[h])).rows[0]?.id:null);
        if(!other){await client.query('ROLLBACK');return reply.code(404).send({error:'Member not found'});}
        if(other===me||target?.role==='owner'||(target&&ranks[actor.role]<=ranks[target.role])){
          await client.query('ROLLBACK');return reply.code(403).send({error:'ROLE_NOT_ALLOWED'});
        }
        if(ban){
          await client.query(
            'INSERT INTO community_bans(community_id,user_id,banned_by_id,reason) VALUES($1,$2,$3,$4) '+
            'ON CONFLICT(community_id,user_id) DO UPDATE SET banned_by_id=EXCLUDED.banned_by_id,reason=EXCLUDED.reason,created_at=now()',
            [id,other,me,reason||null]);
          await client.query('DELETE FROM community_join_requests WHERE community_id=$1 AND user_id=$2',[id,other]);
        }
        await client.query('DELETE FROM community_members WHERE community_id=$1 AND user_id=$2',[id,other]);
        await client.query('DELETE FROM community_voice_sessions WHERE user_id=$2 AND channel_id IN (SELECT id FROM community_channels WHERE community_id=$1)',[id,other]);
        await client.query('COMMIT');
        return reply.header('Cache-Control',noCache).send({handle:h,status:ban?'banned':'removed'});
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    }catch(error){request.log.error({err:error},'Remove community member');return reply.code(503).send({error:'Unavailable'});}
  }

  app.delete('/api/v1/communities/:id/members/:handle',{schema:{params:memberParams}},async(request,reply)=>removeMember(request,reply,false));

  app.post('/api/v1/communities/:id/bans',{schema:{params:idParams,body:banBody}},async(request,reply)=>{
    // The target handle comes from the body; reuse role-aware atomic enforcement.
    const h=(request.body as {handle:string}).handle;
    return removeMember(request,reply,true,h);
  });

  app.delete('/api/v1/communities/:id/bans/:handle',{schema:{params:memberParams}},async(request,reply)=>{
    if(!origin(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,handle:h}=request.params as {id:string;handle:string};
      const myRole=await role(id,me);
      if(!myRole||ranks[myRole]<3)return reply.code(403).send({error:'ADMIN_REQUIRED'});
      await getPool().query('DELETE FROM community_bans USING users u WHERE community_bans.community_id=$1 '+
        'AND community_bans.user_id=u.id AND u.handle=$2',[id,h]);
      return reply.header('Cache-Control',noCache).code(204).send();
    }catch(error){request.log.error({err:error},'Unban community member');return reply.code(503).send({error:'Unavailable'});}
  });

  app.patch('/api/v1/communities/:id/channels/:channelId',{schema:{params:channelParams,body:channelBody}},async(request,reply)=>{
    if(!origin(request))return reply.code(403).send({error:'Invalid origin'});
    try {
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,channelId}=request.params as {id:string;channelId:string};
      if((ranks[(await role(id,me))??'']??0)<3)return reply.code(403).send({error:'ADMIN_REQUIRED'});
      const name=(request.body as {name:string}).name.trim();
      if(name.length<2)return reply.code(400).send({error:'Invalid channel'});
      const changed=await getPool().query('UPDATE community_channels SET name=$3 WHERE community_id=$1 AND id=$2 RETURNING id,name,kind',[id,channelId,name]);
      if(!changed.rowCount)return reply.code(404).send({error:'Channel not found'});
      return reply.header('Cache-Control',noCache).send({channel:changed.rows[0]});
    }catch(error){
      if(typeof error==='object'&&error!==null&&'code' in error&&error.code==='23505')return reply.code(409).send({error:'CHANNEL_EXISTS'});
      request.log.error({err:error},'Rename channel');return reply.code(503).send({error:'Unavailable'});
    }
  });

  app.delete('/api/v1/communities/:id/channels/:channelId',{schema:{params:channelParams}},async(request,reply)=>{
    if(!origin(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,channelId}=request.params as {id:string;channelId:string};
      const client=await getPool().connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,65431))',[id]);
        const actor=await client.query('SELECT role FROM community_members WHERE community_id=$1 AND user_id=$2',[id,me]);
        if(!actor.rowCount||ranks[actor.rows[0].role]<3){await client.query('ROLLBACK');return reply.code(403).send({error:'ADMIN_REQUIRED'});}
        const channel=await client.query('SELECT kind FROM community_channels WHERE community_id=$1 AND id=$2',[id,channelId]);
        if(!channel.rowCount){await client.query('ROLLBACK');return reply.code(404).send({error:'Channel not found'});}
        if(channel.rows[0].kind==='text'){
          const n=await client.query("SELECT COUNT(*)::int AS n FROM community_channels WHERE community_id=$1 AND kind='text'",[id]);
          if(Number(n.rows[0].n)<=1){await client.query('ROLLBACK');return reply.code(409).send({error:'LAST_TEXT_CHANNEL'});}
        }
        await client.query('DELETE FROM community_channels WHERE community_id=$1 AND id=$2',[id,channelId]);
        await client.query('COMMIT');
        return reply.code(204).send();
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    }catch(error){request.log.error({err:error},'Delete channel');return reply.code(503).send({error:'Unavailable'});}
  });

  app.patch('/api/v1/communities/:id/channels/:channelId/messages/:messageId',
    {schema:{params:messageParams,body:editBody}},async(request,reply)=>{
      if(!origin(request))return reply.code(403).send({error:'Invalid origin'});
      try{
        const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
        const {id,channelId,messageId}=request.params as {id:string;channelId:string;messageId:string};
        const content=(request.body as {body:string}).body.trim();
        if(!content||content.length>4000)return reply.code(400).send({error:'Invalid message'});
        const changed=await getPool().query(
          'UPDATE community_messages msg SET body=$5,edited_at=now() FROM community_channels channel '+
          'JOIN community_members member ON member.community_id=channel.community_id AND member.user_id=$4 '+
          "WHERE msg.id=$1 AND msg.channel_id=$2 AND channel.id=$2 AND channel.community_id=$3 AND channel.kind='text' "+
          'AND msg.author_id=$4 AND msg.deleted_at IS NULL RETURNING msg.id,msg.body,msg.edited_at AS "editedAt"',
          [messageId,channelId,id,me,content]);
        if(!changed.rowCount)return reply.code(404).send({error:'Message not editable'});
        return reply.header('Cache-Control',noCache).send({message:changed.rows[0]});
      }catch(error){request.log.error({err:error},'Edit channel message');return reply.code(503).send({error:'Unavailable'});}
    });

  app.delete('/api/v1/communities/:id/channels/:channelId/messages/:messageId',
    {schema:{params:messageParams}},async(request,reply)=>{
      if(!origin(request))return reply.code(403).send({error:'Invalid origin'});
      try{
        const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
        const {id,channelId,messageId}=request.params as {id:string;channelId:string;messageId:string};
        const changed=await getPool().query(
          'UPDATE community_messages msg SET deleted_at=now(),deleted_by_id=$4 FROM community_channels channel '+
          'JOIN community_members member ON member.community_id=channel.community_id AND member.user_id=$4 '+
          "WHERE msg.id=$1 AND msg.channel_id=$2 AND channel.id=$2 AND channel.community_id=$3 AND channel.kind='text' "+
          "AND msg.deleted_at IS NULL AND (msg.author_id=$4 OR member.role IN ('owner','admin','moderator')) RETURNING msg.id",
          [messageId,channelId,id,me]);
        if(!changed.rowCount)return reply.code(404).send({error:'Message not deletable'});
        return reply.header('Cache-Control',noCache).code(204).send();
      }catch(error){request.log.error({err:error},'Delete channel message');return reply.code(503).send({error:'Unavailable'});}
    });
}
