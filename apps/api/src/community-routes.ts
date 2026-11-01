import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getPool } from './db/client.js';

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
  name:{type:'string',minLength:2,maxLength:64},kind:{type:'string',enum:['text','voice']}
}};
const messageBody={type:'object',required:['clientId','body'],additionalProperties:false,properties:{
  clientId:uuid,body:{type:'string',minLength:1,maxLength:4000}
}};
const reactionEmojis=['👍','❤️','😂','😮','😢','🔥','👏','🎉','💯','💜','✅','🤔','🙌','👎','😍','🥰','🙏','😎'] as const;
const reactionBody={type:'object',required:['emoji'],additionalProperties:false,properties:{emoji:{type:'string',enum:[...reactionEmojis]}}};
const inviteBody={type:'object',required:['handle'],additionalProperties:false,properties:{handle:{type:'string',pattern:'^[a-z][a-z0-9_]{2,31}$'}}};
const noCache='private, no-store';
const manager=(role:string|null)=>role==='owner'||role==='admin';
const originValid=(request:FastifyRequest)=>request.headers.origin===(process.env.WEB_ORIGIN??'http://localhost:5173');

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

  app.get('/api/v1/communities/:id',{schema:{params:groupParams}},async(request,reply)=>{
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      const data=await group(id,me);if(!data)return reply.code(404).send({error:'Not found'});
      let channels:unknown[]=[],pendingRequests:unknown[]=[];
      if(data.myRole){
        const result=await getPool().query(
          'SELECT id,name,kind,created_at AS "createdAt" FROM community_channels WHERE community_id=$1 ORDER BY created_at,id',[id]);
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
        return reply.code(201).header('Cache-Control',noCache).send({status:'pending'});
      }
      const inserted=await getPool().query("INSERT INTO community_members(community_id,user_id,role) "+
        "SELECT $1,$2,'member' WHERE NOT EXISTS (SELECT 1 FROM community_bans WHERE community_id=$1 AND user_id=$2) "+
        "ON CONFLICT DO NOTHING RETURNING user_id",[id,me]);
      if(!inserted.rowCount && !await membership(id,me))return reply.code(403).send({error:'COMMUNITY_BANNED'});
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
      return reply.code(204).send();
    }catch(error){request.log.error({err:error},'Leave community');return reply.code(503).send({error:'Unavailable'});}
  });

  app.post('/api/v1/communities/:id/channels',{schema:{params:groupParams,body:channelBody}},async(request,reply)=>{
    if(!originValid(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      if(!manager(await membership(id,me)))return reply.code(403).send({error:'Forbidden'});
      const {name,kind}=request.body as {name:string;kind:'text'|'voice'};
      const normalized=name.trim();
      if(normalized.length<2)return reply.code(400).send({error:'Invalid channel name'});
      const c=await getPool().query('SELECT COUNT(*)::int AS n FROM community_channels WHERE community_id=$1',[id]);
      if(Number(c.rows[0].n)>=50)return reply.code(409).send({error:'CHANNEL_LIMIT'});
      const result=await getPool().query(
        'INSERT INTO community_channels(community_id,name,kind) VALUES($1,$2,$3) RETURNING id,name,kind',
        [id,normalized,kind]);
      return reply.code(201).header('Cache-Control',noCache).send({channel:result.rows[0]});
    }catch(error){
      if(typeof error==='object'&&error!==null&&'code' in error&&error.code==='23505')
        return reply.code(409).send({error:'CHANNEL_EXISTS'});
      request.log.error({err:error},'Create community channel');return reply.code(503).send({error:'Unavailable'});
    }
  });

  app.get('/api/v1/communities/:id/channels/:channelId/messages',{schema:{params:channelParams}},async(request,reply)=>{
    try{
      const me=await self(request);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,channelId}=request.params as {id:string;channelId:string};
      const readerRole=await membership(id,me);
      if(!readerRole)return reply.code(403).send({error:'MEMBERS_ONLY'});
      const check=await getPool().query('SELECT 1 FROM community_channels WHERE id=$1 AND community_id=$2 AND kind=\'text\'',[channelId,id]);
      if(!check.rowCount)return reply.code(404).send({error:'Text channel not found'});
      // An additive migration can deploy after the API; keep channel history readable
      // until the reactions table is actually available in the active database.
      const ready=await getPool().query("SELECT to_regclass('public.community_message_reactions') IS NOT NULL AS enabled");
      const reactionProjection=ready.rows[0]?.enabled?
        'CASE WHEN m.deleted_at IS NOT NULL THEN \'[]\'::jsonb ELSE COALESCE(('+
        'SELECT jsonb_agg(jsonb_build_object(\'emoji\',rx.emoji,\'count\',rx.total,\'mine\',rx.mine) ORDER BY rx.total DESC,rx.emoji) '+
        'FROM (SELECT emoji,COUNT(*)::int AS total,BOOL_OR(user_id=$2) AS mine FROM community_message_reactions '+
        'WHERE message_id=m.id GROUP BY emoji) rx),\'[]\'::jsonb) END AS reactions ':
        "\'[]\'::jsonb AS reactions ";
      const result=await getPool().query(
        'SELECT m.id,m.client_id AS "clientId",m.author_id AS "authorId",'+
        'CASE WHEN m.deleted_at IS NULL THEN m.body ELSE NULL END AS body,m.created_at AS "createdAt",'+
        'm.edited_at AS "editedAt",m.deleted_at AS "deletedAt",'+
        'u.handle AS "authorHandle",'+
        'CASE WHEN p.is_public=true OR m.author_id=$2 OR friends.status=\'accepted\' THEN p.display_name ELSE u.handle END AS "authorName",'+
        'CASE WHEN (p.is_public=true OR m.author_id=$2 OR friends.status=\'accepted\') AND '+
        'NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id=m.author_id AND b.blocked_id=$2) OR (b.blocker_id=$2 AND b.blocked_id=m.author_id)) '+
        'THEN p.avatar_url ELSE NULL END AS "authorAvatar",'+reactionProjection+
        'FROM community_messages m JOIN users u ON u.id=m.author_id JOIN profiles p ON p.user_id=m.author_id '+
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
      const {clientId,body}=request.body as {clientId:string;body:string};
      const clean=body.trim();
      if(!clean||clean.length>4000)return reply.code(400).send({error:'Invalid message'});
      if(!await membership(id,me))return reply.code(403).send({error:'MEMBERS_ONLY'});
      const limit=await getPool().query(
        'SELECT COUNT(*)::int AS n FROM community_messages WHERE channel_id=$1 AND author_id=$2 AND created_at>now()-interval \'1 minute\'',
        [channelId,me]);
      if(Number(limit.rows[0].n)>=30)return reply.code(429).send({error:'MESSAGE_RATE_LIMIT'});
      const saved=await getPool().query(
        'INSERT INTO community_messages(channel_id,author_id,client_id,body) '+
        'SELECT ch.id,$3,$4,$5 FROM community_channels ch '+
        'JOIN community_members cm ON cm.community_id=ch.community_id AND cm.user_id=$3 '+
        'WHERE ch.id=$1 AND ch.community_id=$2 AND ch.kind=\'text\' '+
        'ON CONFLICT(client_id) DO NOTHING RETURNING id',[channelId,id,me,clientId,clean]);
      if(!saved.rowCount){
        const existing=await getPool().query('SELECT id,body,author_id FROM community_messages WHERE client_id=$1 AND channel_id=$2',[clientId,channelId]);
        if(!existing.rowCount||existing.rows[0].author_id!==me)return reply.code(404).send({error:'Channel unavailable'});
        return reply.header('Cache-Control',noCache).send({id:existing.rows[0].id,duplicate:true});
      }
      return reply.code(201).header('Cache-Control',noCache).send({id:saved.rows[0].id});
    }catch(error){request.log.error({err:error},'Send community message');return reply.code(503).send({error:'Unavailable'});}
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
      const ready=await getPool().query("SELECT to_regclass('public.community_message_reactions') IS NOT NULL AS enabled");
      if(!ready.rows[0]?.enabled)return reply.code(503).send({error:'REACTIONS_NOT_READY'});
      const allowed=await getPool().query(
        'SELECT m.author_id,m.deleted_at FROM community_messages m JOIN community_channels ch ON ch.id=m.channel_id '+
        "WHERE m.id=$1 AND ch.id=$2 AND ch.community_id=$3 AND ch.kind='text' LIMIT 1",
        [messageId,channelId,id]);
      if(!allowed.rowCount||allowed.rows[0].deleted_at)return reply.code(404).send({error:'Message unavailable'});
      if(allowed.rows[0].author_id===me)return reply.code(403).send({error:'OWN_MESSAGE_REACTION'});
      if(add){
        await getPool().query(
          'INSERT INTO community_message_reactions(message_id,user_id,emoji) '+
          'SELECT m.id,$2,$3 FROM community_messages m '+
          'JOIN community_channels ch ON ch.id=m.channel_id '+
          'JOIN community_members cm ON cm.community_id=ch.community_id AND cm.user_id=$2 '+
          'WHERE m.id=$1 AND m.deleted_at IS NULL AND m.author_id<>$2 AND ch.id=$4 AND ch.community_id=$5 AND ch.kind=\'text\' '+
          'ON CONFLICT DO NOTHING',[messageId,me,emoji,channelId,id]);
      }else{
        await getPool().query(
          'DELETE FROM community_message_reactions r USING community_messages m,community_channels ch,community_members cm '+
          'WHERE r.message_id=m.id AND m.channel_id=ch.id AND cm.community_id=ch.community_id AND cm.user_id=$2 '+
          'AND m.deleted_at IS NULL AND m.author_id<>$2 AND r.message_id=$1 AND r.user_id=$2 '+
          'AND r.emoji=$3 AND ch.id=$4 AND ch.community_id=$5 AND ch.kind=\'text\'',
          [messageId,me,emoji,channelId,id]);
      }
      const counts=await getPool().query(
        'SELECT emoji,COUNT(*)::int AS count,BOOL_OR(user_id=$2) AS mine '+
        'FROM community_message_reactions WHERE message_id=$1 GROUP BY emoji ORDER BY count DESC,emoji',
        [messageId,me]);
      return reply.header('Cache-Control',noCache).send({reactions:counts.rows});
    }catch(error){request.log.error({err:error},'React to community message');return reply.code(503).send({error:'Unavailable'});}
  }

  app.put('/api/v1/communities/:id/channels/:channelId/messages/:messageId/reactions',
    {schema:{params:reactionParams,body:reactionBody}},async(request,reply)=>react(request,reply,true));

  app.delete('/api/v1/communities/:id/channels/:channelId/messages/:messageId/reactions',
    {schema:{params:reactionParams,body:reactionBody}},async(request,reply)=>react(request,reply,false));
}
