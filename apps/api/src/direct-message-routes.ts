import type { FastifyInstance, FastifyRequest } from 'fastify';
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
const messageColumns = 'id, conversation_id AS "conversationId", author_id AS "authorId", body, client_id AS "clientId", created_at AS "createdAt", read_at AS "readAt"';
const pathParams = { type:'object', required:['id'], properties:{ id:uuidParam } };
const noCache = 'no-store';

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
    const unsubscribe = subscribeDmEvents(me, event => {
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
        'p.display_name AS "peerName", p.avatar_url AS "peerAvatarUrl",',
        'm.body AS "lastBody", m.created_at AS "lastAt", m.author_id AS "lastAuthorId",',
        'COALESCE(unread.n,0)::int AS "unreadCount"',
        'FROM direct_conversations c',
        'JOIN users u ON u.id=CASE WHEN c.participant_a_id=$1 THEN c.participant_b_id ELSE c.participant_a_id END',
        'JOIN profiles p ON p.user_id=u.id',
        'LEFT JOIN LATERAL (SELECT body,created_at,author_id FROM direct_messages WHERE conversation_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1) m ON true',
        'LEFT JOIN LATERAL (SELECT COUNT(*) AS n FROM direct_messages WHERE conversation_id=c.id AND author_id<>$1 AND read_at IS NULL) unread ON true',
        'WHERE c.participant_a_id=$1 OR c.participant_b_id=$1',
        'ORDER BY COALESCE(m.created_at,c.created_at) DESC LIMIT 100'
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
      const match=await getPool().query('SELECT u.id FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.handle=$1 AND u.id<>$2 AND p.is_public=true LIMIT 1',[handle,me]);
      if(!match.rowCount)return reply.code(404).send({error:'User unavailable'});
      const [a,b]=[me,match.rows[0].id as string].sort();
      const r=await getPool().query('INSERT INTO direct_conversations(participant_a_id,participant_b_id) VALUES($1,$2) ON CONFLICT(participant_a_id,participant_b_id) DO UPDATE SET participant_a_id=EXCLUDED.participant_a_id RETURNING id',[a,b]);
      await publishDmConversationEvent(r.rows[0].id as string, 'conversation').catch(error => request.log.warn({err:error},'DM event unavailable'));
      return reply.header('Cache-Control',noCache).send({id:r.rows[0].id});
    }catch(e){request.log.error({err:e},'DM open');return reply.code(503).send({error:'Unavailable'});}
  });
  app.get('/api/v1/dm/conversations/:id/messages',{
    schema:{params:pathParams}
  },async(request,reply)=>{
    try{
      const me=await identity(request,getSession);
      if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      if(!await belongs(id,me))return reply.code(404).send({error:'Not found'});
      const query='SELECT '+messageColumns+' FROM (SELECT * FROM direct_messages WHERE conversation_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100) dm ORDER BY created_at ASC,id ASC';
      const r=await getPool().query(query,[id]);
      return reply.header('Cache-Control',noCache).send({messages:r.rows});
    }catch(e){request.log.error({err:e},'DM messages');return reply.code(503).send({error:'Unavailable'});}
  });
  app.post('/api/v1/dm/conversations/:id/messages',{
    schema:{params:pathParams,body:{type:'object',additionalProperties:false,required:['body','clientId'],
      properties:{body:{type:'string',minLength:1,maxLength:4000},clientId:uuidParam}}}
  },async(request,reply)=>{
    if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await identity(request,getSession);
      if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      if(!await belongs(id,me))return reply.code(404).send({error:'Not found'});
      const {body,clientId}=request.body as {body:string;clientId:string};
      const text=body.trim();
      if(!text||text.length>4000)return reply.code(400).send({error:'Invalid message'});
      const q='INSERT INTO direct_messages(conversation_id,author_id,body,client_id) VALUES($1,$2,$3,$4) ON CONFLICT(client_id) DO NOTHING RETURNING '+messageColumns;
      const r=await getPool().query(q,[id,me,text,clientId]);
      if(r.rowCount){
        await publishDmConversationEvent(id,'message').catch(error=>request.log.warn({err:error},'DM notification failed'));
        return reply.code(201).header('Cache-Control',noCache).send({message:r.rows[0]});
      }
      const prev=await getPool().query('SELECT '+messageColumns+' FROM direct_messages WHERE client_id=$1 AND conversation_id=$2 AND author_id=$3',[clientId,id,me]);
      if(!prev.rowCount)return reply.code(409).send({error:'Message ID conflict'});
      return reply.header('Cache-Control',noCache).send({message:prev.rows[0]});
    }catch(e){request.log.error({err:e},'DM send');return reply.code(503).send({error:'Unavailable'});}
  });
  app.post('/api/v1/dm/conversations/:id/read',{schema:{params:pathParams}},async(request,reply)=>{
    if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await identity(request,getSession);
      if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=request.params as {id:string};
      if(!await belongs(id,me))return reply.code(404).send({error:'Not found'});
      const r=await getPool().query('UPDATE direct_messages SET read_at=now() WHERE conversation_id=$1 AND author_id<>$2 AND read_at IS NULL RETURNING id',[id,me]);
      if(r.rowCount) await publishDmConversationEvent(id,'read').catch(error=>request.log.warn({err:error},'DM read notification failed'));
      return reply.header('Cache-Control',noCache).send({read:r.rowCount??0});
    }catch(e){request.log.error({err:e},'DM read');return reply.code(503).send({error:'Unavailable'});}
  });
}
