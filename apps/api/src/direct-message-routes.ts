import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getPool } from './db/client.js';
import { subscribeDmEvents, publishDmConversationEvent } from './dm-events.js';

type SessionReader = (request: FastifyRequest) => Promise<{ user: { id: string } } | null>;
const uuidParam = { type: 'string', format: 'uuid' } as const;

function allowedOrigin(request: FastifyRequest) {
  return request.headers.origin === (process.env.WEB_ORIGIN ?? 'http://localhost:5173');
}
async function identity(request: FastifyRequest, getSession: SessionReader): Promise<string | null> {
  const session = await getSession(request);
  if (!session) return null;
  const user = await getPool().query('SELECT id FROM users WHERE id=$1', [session.user.id]);
  return user.rows[0]?.id ?? null;
}
async function belongs(conversationId: string, userId: string): Promise<boolean> {
  const r = await getPool().query(
    'SELECT id FROM direct_conversations WHERE id=$1 AND (participant_a_id=$2 OR participant_b_id=$2)',
    [conversationId,userId]);
  return r.rowCount === 1;
}
const attachmentProjection = 'CASE WHEN attachment_id IS NULL THEN NULL ELSE json_build_object(\'id\',attachment_id,\'name\',attachment_name,\'type\',attachment_type,\'size\',attachment_size) END AS "attachment"';
const messageColumns = 'id, conversation_id AS "conversationId", author_id AS "authorId", body, client_id AS "clientId", created_at AS "createdAt", read_at AS "readAt", delivered_at AS "deliveredAt", edited_at AS "editedAt", deleted_at AS "deletedAt", (forwarded_from_id IS NOT NULL) AS "forwarded", reply_to_id AS "replyToId", '+attachmentProjection;
const allowedAttachmentTypes = new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','video/mp4','video/webm','video/quicktime','application/pdf','text/plain','application/zip','application/octet-stream',
  'audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav','audio/x-m4a','audio/aac']);
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
function verifiedAttachmentUpload(request:FastifyRequest, conversationId:string, clientId:string,
  attachment:{id:string;name:string;type:string;size:number}) {
  // Server-to-server proof: the public Fastify endpoint must not accept fake
  // R2 attachment metadata posted directly by a browser or another client.
  const secret=process.env.DM_ATTACHMENT_PROOF_SECRET;
  const proof=request.headers['x-uorqui-attachment-proof'];
  if(!secret || secret.length<32 || typeof proof!=='string' || !/^[0-9a-f]{64}$/.test(proof))return false;
  const canonical=JSON.stringify([conversationId,clientId,attachment.id,attachment.name,attachment.type,attachment.size]);
  const expected=createHmac('sha256',secret).update(canonical).digest('hex');
  return timingSafeEqual(Buffer.from(proof,'hex'),Buffer.from(expected,'hex'));
}
const pathParams = { type:'object', required:['id'], properties:{ id:uuidParam } };
const noCache = 'no-store';

/** Destination privacy is evaluated on every write, not inferred from UI state. */
async function canMessage(conversationId: string, me: string): Promise<boolean> {
  const result = await getPool().query(
    'SELECT 1 FROM direct_conversations c JOIN profiles p ON p.user_id = ' +
    'CASE WHEN c.participant_a_id=$2 THEN c.participant_b_id ELSE c.participant_a_id END ' +
    'LEFT JOIN user_friendships f ON f.user_a_id=LEAST(c.participant_a_id,c.participant_b_id) ' +
    'AND f.user_b_id=GREATEST(c.participant_a_id,c.participant_b_id) ' +
    "WHERE c.id=$1 AND (c.participant_a_id=$2 OR c.participant_b_id=$2) AND (p.is_public=true OR f.status='accepted')",
    [conversationId,me],
  );
  return result.rowCount === 1;
}
const mayPostSql =
  "EXISTS (SELECT 1 FROM direct_conversations c JOIN profiles p ON p.user_id = CASE WHEN c.participant_a_id=$2 THEN c.participant_b_id ELSE c.participant_a_id END " +
  "LEFT JOIN user_friendships f ON f.user_a_id=LEAST(c.participant_a_id,c.participant_b_id) AND f.user_b_id=GREATEST(c.participant_a_id,c.participant_b_id) " +
  "WHERE c.id=$1 AND (c.participant_a_id=$2 OR c.participant_b_id=$2) AND (p.is_public=true OR f.status='accepted'))";


export function registerDirectMessageRoutes(app:FastifyInstance, getSession: SessionReader) {
  app.get('/api/v1/dm/events', async (request, reply) => {
    // EventSource uses the same-origin session cookie; no tokens in URLs.
    // Connection lifetime is bounded so revoked/expired sessions are rechecked.
    let me: string | null;
    try {
      me = await identity(request, getSession);
    } catch (error) {
      request.log.error({ err: error }, 'DM event authentication failed');
      return reply.code(503).send({ error: 'Unavailable' });
    }
    if (!me) return reply.code(401).send({ error: 'Unauthorized' });
    if ((request.headers.accept ?? '').indexOf('text/event-stream') === -1) {
      return reply.code(406).send({ error: 'Expected event stream' });
    }

    const response = reply.raw;
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'private, no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
    });
    reply.hijack();
    // Initial ready event triggers a refresh after establishing the subscription,
    // covering changes that occurred during the initial HTTP handshake.
    let ended = false;
    const write = (chunk: string) => {
      if (ended || response.destroyed || response.writableEnded) return;
      try { response.write(chunk); } catch { finish(); }
    };
    const unsubscribe = await subscribeDmEvents(me, event => {
      write('event: dm-update\ndata: ' + JSON.stringify(event) + '\n\n');
    });
    const heartbeat = setInterval(() => write(': heartbeat\n\n'), 15_000);
    const expires = setTimeout(() => finish(), 5 * 60_000);
    function finish() {
      if (ended) return;
      ended = true;
      clearInterval(heartbeat);
      clearTimeout(expires);
      unsubscribe();
      if (!response.writableEnded) response.end();
    }
    response.once('close', finish);
    if (response.destroyed) { finish(); return; }
    write('retry: 2000\n\n');
    write('event: ready\ndata: {}\n\n');
  });

  app.get('/api/v1/dm/people', {
    schema:{ querystring:{ type:'object', additionalProperties:false, required:['q'],
      properties:{ q:{type:'string',minLength:2,maxLength:40} } } },
  }, async (request,reply) => {
    try {
      const me = await identity(request,getSession);
      if (!me) return reply.code(401).send({error:'Unauthorized'});
      const q=(request.query as {q:string}).q.trim().replace(/^@/,'');
      if(q.length<2) return reply.code(400).send({error:'Search too short'});
      const escaped = '%' + q.replace(/[\\%_]/g,'\\$&') + '%';
      const r=await getPool().query(
        'SELECT u.handle, p.display_name AS "displayName", p.avatar_url AS "avatarUrl" FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id<>$1 AND p.is_public=true AND (u.handle ILIKE $2 OR p.display_name ILIKE $2) ORDER BY u.handle LIMIT 20',
        [me,escaped]);
      return reply.header('Cache-Control',noCache).send({people:r.rows});
    } catch(e){request.log.error({err:e},'DM people search');return reply.code(503).send({error:'Unavailable'});}
  });
  app.get('/api/v1/dm/conversations', async (request,reply) => {
    try {
      const me=await identity(request,getSession);
      if(!me) return reply.code(401).send({error:'Unauthorized'});
      const query=[
        'SELECT c.id, c.created_at AS "createdAt", u.handle AS "peerHandle",',
        'CASE WHEN p.is_public=true OR f.status=\'accepted\' THEN p.display_name ELSE u.handle END AS "peerName",',
        'CASE WHEN p.is_public=true OR f.status=\'accepted\' THEN p.avatar_url ELSE NULL END AS "peerAvatarUrl",',
        '(p.is_public=true OR COALESCE(f.status=\'accepted\',false)) AS "canMessage",',
        `NULLIF(m.body,'') AS "lastBody", m.attachment_type AS "lastAttachmentType", m.created_at AS "lastAt", m.author_id AS "lastAuthorId", (m.deleted_at IS NOT NULL) AS "lastDeleted",`,
        'reaction.emoji AS "lastReactionEmoji", reaction.notified_at AS "lastReactionAt", reaction.message_id AS "lastReactionMessageId",',
        'reaction.user_id AS "lastReactionAuthorId",',
        '(COALESCE(unread.n,0) + COALESCE(unread_reactions.n,0))::int AS "unreadCount",',
        'COALESCE(unread_reactions.n,0)::int AS "unreadReactionCount",',
        'incoming.pending_received_at AS "pendingReceivedAt"',
        'FROM direct_conversations c',
        'JOIN users u ON u.id=CASE WHEN c.participant_a_id=$1 THEN c.participant_b_id ELSE c.participant_a_id END',
        'JOIN profiles p ON p.user_id=u.id',
        'LEFT JOIN user_friendships f ON f.user_a_id=LEAST(c.participant_a_id,c.participant_b_id) AND f.user_b_id=GREATEST(c.participant_a_id,c.participant_b_id)',
        'LEFT JOIN LATERAL (SELECT body,attachment_type,created_at,author_id,deleted_at FROM direct_messages WHERE conversation_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1) m ON true',
        'LEFT JOIN LATERAL (SELECT COUNT(*) AS n FROM direct_messages WHERE conversation_id=c.id AND author_id<>$1 AND (read_at IS NULL OR (edited_at IS NOT NULL AND read_at < edited_at)) AND deleted_at IS NULL) unread ON true',
        'LEFT JOIN LATERAL (SELECT MAX(COALESCE(edited_at,created_at)) AS pending_received_at FROM direct_messages',
        ' WHERE conversation_id=c.id AND author_id<>$1 AND deleted_at IS NULL AND (delivered_at IS NULL OR (edited_at IS NOT NULL AND delivered_at < edited_at))) incoming ON true',
        'LEFT JOIN LATERAL (SELECT r.emoji,r.notified_at,r.message_id,r.user_id FROM direct_message_reactions r JOIN direct_messages dm ON dm.id=r.message_id',
        '  WHERE dm.conversation_id=c.id AND (dm.author_id=$1 OR r.user_id=$1) AND dm.deleted_at IS NULL AND r.notified_at IS NOT NULL ORDER BY r.notified_at DESC,r.message_id DESC LIMIT 1) reaction ON true',
        'LEFT JOIN LATERAL (SELECT COUNT(*) AS n FROM direct_message_reactions r JOIN direct_messages dm ON dm.id=r.message_id',
        '  WHERE dm.conversation_id=c.id AND dm.author_id=$1 AND dm.deleted_at IS NULL AND r.notified_at IS NOT NULL AND r.read_at IS NULL) unread_reactions ON true',
        'WHERE c.participant_a_id=$1 OR c.participant_b_id=$1',
        'ORDER BY GREATEST(COALESCE(m.created_at,c.created_at),COALESCE(reaction.notified_at,c.created_at)) DESC LIMIT 100'
      ].join(' ');
      const r=await getPool().query(query,[me]);
      return reply.header('Cache-Control',noCache).send({conversations:r.rows});
    } catch(e){request.log.error({err:e},'DM list');return reply.code(503).send({error:'Unavailable'});}
  });
  app.post('/api/v1/dm/conversations', {
    schema:{body:{type:'object',additionalProperties:false,required:['handle'],properties:{
      handle:{type:'string',pattern:'^[a-z][a-z0-9_]{2,31}$'}
    }}}
  },async(request,reply)=>{
    if(!allowedOrigin(request)) return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await identity(request,getSession);
      if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {handle}=request.body as {handle:string};
      const match=await getPool().query('SELECT u.id FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.handle=$1 AND u.id<>$2 AND (p.is_public=true OR EXISTS(SELECT 1 FROM user_friendships f WHERE f.user_a_id=LEAST(u.id,$2::uuid) AND f.user_b_id=GREATEST(u.id,$2::uuid) AND f.status=\'accepted\')) LIMIT 1',[handle,me]);
      if(!match.rowCount)return reply.code(404).send({error:'User unavailable'});
      const [a,b]=[me,match.rows[0].id as string].sort();
      const r=await getPool().query('INSERT INTO direct_conversations(participant_a_id,participant_b_id) VALUES($1,$2) ON CONFLICT(participant_a_id,participant_b_id) DO UPDATE SET participant_a_id=EXCLUDED.participant_a_id RETURNING id',[a,b]);
      await publishDmConversationEvent(r.rows[0].id as string, 'conversation').catch(error => request.log.warn({err:error},'DM event unavailable'));
      return reply.header('Cache-Control',noCache).send({id:r.rows[0].id});
    }catch(e){request.log.error({err:e},'DM open');return reply.code(503).send({error:'Unavailable'});}
  });
  app.get('/api/v1/dm/conversations/:id/messages',{
    schema:{params:pathParams,querystring:{type:'object',additionalProperties:false,properties:{around:uuidParam}}}
  },async(request,reply)=>{
    try{
      const me=await identity(request,getSession);
      if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      if(!await belongs(id,me))return reply.code(404).send({error:'Not found'});
      const {around}=request.query as {around?:string};
      let anchor: {created_at: string; id: string} | undefined;
      if(around){
        const source=await getPool().query('SELECT created_at,id FROM direct_messages WHERE id=$1 AND conversation_id=$2',[around,id]);
        if(!source.rowCount)return reply.code(404).send({error:'Message unavailable'});
        anchor=source.rows[0];
      }
      const reactions = `COALESCE((SELECT json_agg(json_build_object('emoji', grouped.emoji, 'count', grouped.n)) FROM
        (SELECT emoji, COUNT(*)::int AS n FROM direct_message_reactions WHERE message_id=dm.id GROUP BY emoji ORDER BY emoji) grouped), '[]'::json) AS reactions`;
      const query='SELECT '+messageColumns+', '+reactions+
        ', (SELECT emoji FROM direct_message_reactions WHERE message_id=dm.id AND user_id=$2) AS "myReaction"'+
        ', (SELECT json_build_object(\'id\',original.id,\'body\',CASE WHEN original.deleted_at IS NULL THEN COALESCE(NULLIF(original.body,\'\'),CASE WHEN original.attachment_type LIKE \'image/%\' THEN \'📷 Foto\' WHEN original.attachment_type LIKE \'video/%\' THEN \'🎬 Vídeo\' WHEN original.attachment_type LIKE \'audio/%\' THEN \'🎤 Áudio\' WHEN original.attachment_type IS NOT NULL THEN \'📎 Arquivo\' END) ELSE \'\' END,'+
        '\'authorId\',original.author_id,\'deleted\',original.deleted_at IS NOT NULL) FROM direct_messages original'+
        ' WHERE original.id=dm.reply_to_id AND original.conversation_id=dm.conversation_id) AS "replyTo"'+
        (anchor
          ? ' FROM (SELECT * FROM (SELECT * FROM direct_messages WHERE conversation_id=$1 AND (created_at,id) <= ($3::timestamptz,$4::uuid) ORDER BY created_at DESC,id DESC LIMIT 50) older UNION ALL SELECT * FROM (SELECT * FROM direct_messages WHERE conversation_id=$1 AND (created_at,id) > ($3::timestamptz,$4::uuid) ORDER BY created_at ASC,id ASC LIMIT 50) newer) dm ORDER BY created_at ASC,id ASC'
          : ' FROM (SELECT * FROM direct_messages WHERE conversation_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100) dm ORDER BY created_at ASC,id ASC');
      const r=await getPool().query(query,anchor?[id,me,anchor.created_at,anchor.id]:[id,me]);
      return reply.header('Cache-Control',noCache).send({messages:r.rows});
    }catch(e){request.log.error({err:e},'DM messages');return reply.code(503).send({error:'Unavailable'});}
  });
  // The Worker owns private R2 uploads. Its upload request is checked here
  // before bytes enter the bucket, and downloads are authorized per message.
  app.get('/api/v1/dm/conversations/:id/attachments/allowed',{schema:{params:pathParams}},async(request,reply)=>{
    try {
      const me=await identity(request,getSession);
      if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      if(!await belongs(id,me))return reply.code(404).send({error:'Not found'});
      if(!await canMessage(id,me))return reply.code(403).send({error:'PRIVATE_PROFILE_FRIENDS_ONLY'});
      return reply.header('Cache-Control',noCache).send({allowed:true});
    }catch(e){request.log.error({err:e},'DM attachment upload access');return reply.code(503).send({error:'Unavailable'});}
  });
  const attachmentParams={type:'object',required:['id','attachmentId'],additionalProperties:false,properties:{id:uuidParam,attachmentId:uuidParam}};
  app.get('/api/v1/dm/conversations/:id/attachments/:attachmentId/access',{schema:{params:attachmentParams}},async(request,reply)=>{
    try {
      const me=await identity(request,getSession);
      if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,attachmentId}=request.params as {id:string;attachmentId:string};
      if(!await belongs(id,me))return reply.code(404).send({error:'Not found'});
      const r=await getPool().query(
        'SELECT attachment_name AS name,attachment_type AS type,attachment_size AS size FROM direct_messages WHERE conversation_id=$1 AND attachment_id=$2 AND deleted_at IS NULL',
        [id,attachmentId]);
      if(!r.rowCount)return reply.code(404).send({error:'Not found'});
      return reply.header('Cache-Control',noCache).send({allowed:true,...r.rows[0]});
    }catch(e){request.log.error({err:e},'DM attachment download access');return reply.code(503).send({error:'Unavailable'});}
  });
  app.post('/api/v1/dm/conversations/:id/messages',{
    schema:{params:pathParams,body:{type:'object',additionalProperties:false,required:['body','clientId'],
      properties:{body:{type:'string',maxLength:4000},clientId:uuidParam,replyToId:uuidParam,attachment:{
        type:'object',additionalProperties:false,required:['id','name','type','size'],
        properties:{id:uuidParam,name:{type:'string',minLength:1,maxLength:180},
          type:{type:'string',maxLength:100},size:{type:'integer',minimum:1,maximum:52428800}}
      }}}}
  },async(request,reply)=>{
    if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await identity(request,getSession);
      if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      if(!await belongs(id,me))return reply.code(404).send({error:'Not found'});
      if(!await canMessage(id,me))return reply.code(403).send({error:'PRIVATE_PROFILE_FRIENDS_ONLY'});
      const {body,clientId,replyToId,attachment}=request.body as {body:string;clientId:string;replyToId?:string;attachment?:{id:string;name:string;type:string;size:number}};
      const text=body.trim();
      if((!text&&!attachment)||text.length>4000)return reply.code(400).send({error:'Invalid message'});
      if(attachment && !verifiedAttachmentUpload(request,id,clientId,attachment))
        return reply.code(403).send({error:'Invalid attachment upload proof'});
      if(attachment && (!allowedAttachmentTypes.has(attachment.type) ||
        attachment.name.trim()!==attachment.name || /[\\/\r\n\u0000-\u001f]/.test(attachment.name) ||
        attachment.size>MAX_ATTACHMENT_BYTES)) return reply.code(400).send({error:'Invalid attachment'});
      // An already-persisted retry must remain idempotent even if its reply source was deleted later.
      const existing=await getPool().query('SELECT '+messageColumns+' FROM direct_messages WHERE client_id=$1 AND conversation_id=$2 AND author_id=$3',[clientId,id,me]);
      if(existing.rowCount)return reply.header('Cache-Control',noCache).send({message:existing.rows[0]});
      if(replyToId){
        const source=await getPool().query('SELECT id FROM direct_messages WHERE id=$1 AND conversation_id=$2 AND deleted_at IS NULL',[replyToId,id]);
        if(!source.rowCount)return reply.code(404).send({error:'Reply target unavailable'});
      }
      const q='INSERT INTO direct_messages(conversation_id,author_id,body,client_id,reply_to_id,attachment_id,attachment_name,attachment_type,attachment_size) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9 WHERE '+mayPostSql+' ON CONFLICT(client_id) DO NOTHING RETURNING '+messageColumns;
      const r=await getPool().query(q,[id,me,text,clientId,replyToId??null,attachment?.id??null,attachment?.name??null,attachment?.type??null,attachment?.size??null]);
      if(r.rowCount){
        await publishDmConversationEvent(id,'message').catch(error=>request.log.warn({err:error},'DM notification failed'));
        return reply.code(201).header('Cache-Control',noCache).send({message:r.rows[0]});
      }
      const prev=await getPool().query('SELECT '+messageColumns+' FROM direct_messages WHERE client_id=$1 AND conversation_id=$2 AND author_id=$3',[clientId,id,me]);
      if(!prev.rowCount)return reply.code(409).send({error:'Message ID conflict'});
      return reply.header('Cache-Control',noCache).send({message:prev.rows[0]});
    }catch(e){request.log.error({err:e},'DM send');return reply.code(503).send({error:'Unavailable'});}
  });
  // Edited text is a new content revision for receipts: read_at and delivered_at
  // keep the previous revision's timestamps until the recipient acknowledges
  // the edit. A client considers receipts older than edited_at stale.
  // read_at itself is retained so canceling a previously read message stays blocked.
  // Delivery is separate from reading. Receiving the message in an active client
  // acknowledges delivery even when the conversation is only in the inbox.
  app.post('/api/v1/dm/conversations/:id/received',{schema:{params:pathParams}},async(request,reply)=>{
    if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await identity(request,getSession);
      if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      if(!await belongs(id,me))return reply.code(404).send({error:'Not found'});
      const r=await getPool().query('UPDATE direct_messages SET delivered_at=now() WHERE conversation_id=$1 AND author_id<>$2 AND (delivered_at IS NULL OR (edited_at IS NOT NULL AND delivered_at < edited_at)) AND deleted_at IS NULL RETURNING id',[id,me]);
      if(r.rowCount)await publishDmConversationEvent(id,'received').catch(error=>request.log.warn({err:error},'DM delivery notification failed'));
      return reply.header('Cache-Control',noCache).send({received:r.rowCount??0});
    }catch(e){request.log.error({err:e},'DM received');return reply.code(503).send({error:'Unavailable'});}
  });
  app.post('/api/v1/dm/conversations/:id/read',{schema:{params:pathParams}},async(request,reply)=>{
    if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await identity(request,getSession);
      if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      if(!await belongs(id,me))return reply.code(404).send({error:'Not found'});
      const r=await getPool().query('UPDATE direct_messages SET read_at=now(), delivered_at=CASE WHEN delivered_at IS NULL OR (edited_at IS NOT NULL AND delivered_at < edited_at) THEN now() ELSE delivered_at END WHERE conversation_id=$1 AND author_id<>$2 AND (read_at IS NULL OR (edited_at IS NOT NULL AND read_at < edited_at)) AND deleted_at IS NULL RETURNING id',[id,me]);
      // Only the original author can acknowledge reactions, and only from the opened conversation.
      const reactions=await getPool().query(
        'UPDATE direct_message_reactions reaction SET read_at=now() FROM direct_messages m WHERE reaction.message_id=m.id AND m.conversation_id=$1 AND m.author_id=$2 AND m.deleted_at IS NULL AND reaction.notified_at IS NOT NULL AND reaction.read_at IS NULL RETURNING reaction.message_id',[id,me]);
      if(r.rowCount || reactions.rowCount) await publishDmConversationEvent(id,'read').catch(error=>request.log.warn({err:error},'DM read notification failed'));
      return reply.header('Cache-Control',noCache).send({read:r.rowCount??0,reactionsRead:reactions.rowCount??0});
    }catch(e){request.log.error({err:e},'DM read');return reply.code(503).send({error:'Unavailable'});}
  });

  // Actions always check conversation membership, and own-message mutations check the author.
  // Unread cancellation permanently removes the message, without a tombstone.
  const messagePath = '/api/v1/dm/conversations/:id/messages/:messageId';
  const messageParams = { type:'object', required:['id','messageId'], additionalProperties:false,
    properties:{id:uuidParam,messageId:uuidParam} };
  app.patch(messagePath,{schema:{params:messageParams,body:{type:'object',additionalProperties:false,
    required:['body'],properties:{body:{type:'string',minLength:1,maxLength:4000}}}}},async(request,reply)=>{
    if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
    try {
      const me=await identity(request,getSession);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,messageId}=request.params as {id:string;messageId:string};
      if(!await belongs(id,me))return reply.code(404).send({error:'Not found'});
      if(!await canMessage(id,me))return reply.code(403).send({error:'PRIVATE_PROFILE_FRIENDS_ONLY'});
      const text=(request.body as {body:string}).body.trim();
      if(!text||text.length>4000)return reply.code(400).send({error:'Invalid message'});
      const r=await getPool().query('UPDATE direct_messages SET body=$1, edited_at=now() WHERE id=$2 AND conversation_id=$3 AND author_id=$4 AND deleted_at IS NULL RETURNING '+messageColumns,[text,messageId,id,me]);
      if(!r.rowCount)return reply.code(404).send({error:'Message unavailable'});
      await publishDmConversationEvent(id,'update').catch(error=>request.log.warn({err:error},'DM edit notification failed'));
      return reply.header('Cache-Control',noCache).send({message:r.rows[0]});
    }catch(e){request.log.error({err:e},'DM edit');return reply.code(503).send({error:'Unavailable'});}
  });
  app.delete(messagePath,{schema:{params:messageParams}},async(request,reply)=>{
    if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
    try {
      const me=await identity(request,getSession);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,messageId}=request.params as {id:string;messageId:string};
      if(!await belongs(id,me))return reply.code(404).send({error:'Not found'});
      // Atomic unread-only cancel: the message vanishes from history entirely.
      // Concurrent read receipts cannot race past this WHERE predicate.
      const r=await getPool().query('DELETE FROM direct_messages WHERE id=$1 AND conversation_id=$2 AND author_id=$3 AND read_at IS NULL RETURNING id,attachment_id',[messageId,id,me]);
      if(!r.rowCount){
        const existing=await getPool().query('SELECT read_at FROM direct_messages WHERE id=$1 AND conversation_id=$2 AND author_id=$3',[messageId,id,me]);
        if(existing.rowCount && existing.rows[0].read_at)return reply.code(409).send({error:'Message already read'});
        return reply.code(404).send({error:'Message unavailable'});
      }
      // Reactions cascade and reply references become null through their foreign keys.
      await publishDmConversationEvent(id,'update').catch(error=>request.log.warn({err:error},'DM cancel notification failed'));
      return reply.header('Cache-Control',noCache).send({canceled:true,attachmentId:r.rows[0].attachment_id??null});
    }catch(e){request.log.error({err:e},'DM delete');return reply.code(503).send({error:'Unavailable'});}
  });
  const reactionsPath = messagePath + '/reaction';
  app.put(reactionsPath,{schema:{params:messageParams,body:{type:'object',additionalProperties:false,required:['emoji'],
    properties:{emoji:{type:'string',enum:['👍','❤️','😂','😮','😢','🎉']}}}}},async(request,reply)=>{
    if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
    try {
      const me=await identity(request,getSession);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,messageId}=request.params as {id:string;messageId:string};
      if(!await belongs(id,me))return reply.code(404).send({error:'Not found'});
      if(!await canMessage(id,me))return reply.code(403).send({error:'PRIVATE_PROFILE_FRIENDS_ONLY'});
      const emoji=(request.body as {emoji:string}).emoji;
      const r=await getPool().query(
        'INSERT INTO direct_message_reactions (message_id,user_id,emoji,notified_at) SELECT m.id,$1,$2,now() FROM direct_messages m WHERE m.id=$3 AND m.conversation_id=$4 AND m.author_id<>$1 AND m.deleted_at IS NULL ON CONFLICT (message_id,user_id) DO UPDATE SET emoji=EXCLUDED.emoji, notified_at=CASE WHEN direct_message_reactions.emoji IS DISTINCT FROM EXCLUDED.emoji THEN now() ELSE direct_message_reactions.notified_at END, read_at=CASE WHEN direct_message_reactions.emoji IS DISTINCT FROM EXCLUDED.emoji THEN NULL ELSE direct_message_reactions.read_at END RETURNING message_id',
        [me,emoji,messageId,id]);
      if(!r.rowCount)return reply.code(404).send({error:'Message unavailable'});
      await publishDmConversationEvent(id,'update').catch(error=>request.log.warn({err:error},'DM reaction notification failed'));
      return reply.header('Cache-Control',noCache).send({emoji});
    }catch(e){request.log.error({err:e},'DM react');return reply.code(503).send({error:'Unavailable'});}
  });
  app.delete(reactionsPath,{schema:{params:messageParams}},async(request,reply)=>{
    if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
    try {
      const me=await identity(request,getSession);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,messageId}=request.params as {id:string;messageId:string};
      if(!await belongs(id,me))return reply.code(404).send({error:'Not found'});
      if(!await canMessage(id,me))return reply.code(403).send({error:'PRIVATE_PROFILE_FRIENDS_ONLY'});
      await getPool().query('DELETE FROM direct_message_reactions WHERE message_id=$1 AND user_id=$2 AND EXISTS (SELECT 1 FROM direct_messages WHERE id=$1 AND conversation_id=$3)',[messageId,me,id]);
      await publishDmConversationEvent(id,'update').catch(error=>request.log.warn({err:error},'DM reaction notification failed'));
      return reply.header('Cache-Control',noCache).send({emoji:null});
    }catch(e){request.log.error({err:e},'DM unreact');return reply.code(503).send({error:'Unavailable'});}
  });
  app.post(messagePath+'/forward',{schema:{params:messageParams,body:{type:'object',additionalProperties:false,
    required:['targetConversationId','clientId'],properties:{targetConversationId:uuidParam,clientId:uuidParam}}}},async(request,reply)=>{
    if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
    try {
      const me=await identity(request,getSession);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,messageId}=request.params as {id:string;messageId:string};
      const {targetConversationId,clientId}=request.body as {targetConversationId:string;clientId:string};
      if(!await belongs(id,me)||!await belongs(targetConversationId,me))return reply.code(404).send({error:'Not found'});
      if(!await canMessage(targetConversationId,me))return reply.code(403).send({error:'PRIVATE_PROFILE_FRIENDS_ONLY'});
      if(id===targetConversationId)return reply.code(400).send({error:'Choose another conversation'});
      const q='INSERT INTO direct_messages (conversation_id,author_id,body,client_id,forwarded_from_id) '+
        'SELECT $1,$2,body,$3,id FROM direct_messages WHERE id=$4 AND conversation_id=$5 AND deleted_at IS NULL AND '+mayPostSql+' '+
        'ON CONFLICT(client_id) DO NOTHING RETURNING '+messageColumns;
      const r=await getPool().query(q,[targetConversationId,me,clientId,messageId,id]);
      if(r.rowCount){
        await publishDmConversationEvent(targetConversationId,'message').catch(error=>request.log.warn({err:error},'DM forward notification failed'));
        return reply.code(201).header('Cache-Control',noCache).send({message:r.rows[0]});
      }
      const prior=await getPool().query('SELECT '+messageColumns+' FROM direct_messages WHERE client_id=$1 AND conversation_id=$2 AND author_id=$3 AND forwarded_from_id=$4',[clientId,targetConversationId,me,messageId]);
      if(prior.rowCount)return reply.header('Cache-Control',noCache).send({message:prior.rows[0]});
      return reply.code(404).send({error:'Message unavailable'});
    }catch(e){request.log.error({err:e},'DM forward');return reply.code(503).send({error:'Unavailable'});}
  });
}
