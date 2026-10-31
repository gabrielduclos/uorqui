import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getPool } from './db/client.js';
import { publishDmUserEvent } from './dm-events.js';

type SessionReader = (request: FastifyRequest) => Promise<{ user: { id: string } } | null>;
const handleSchema = { type: 'string', pattern: '^[a-z][a-z0-9_]{2,31}$' } as const;
const params = { type: 'object', required: ['handle'], additionalProperties: false, properties: { handle: handleSchema } };
const body = { type: 'object', required: ['handle'], additionalProperties: false, properties: { handle: handleSchema } };
const noCache = 'private, no-store';

function allowedOrigin(request: FastifyRequest) {
  return request.headers.origin === (process.env.WEB_ORIGIN ?? 'http://localhost:5173');
}
function pair(a: string,b: string): [string,string] { return a < b ? [a,b] : [b,a]; }

export function registerFriendRoutes(app: FastifyInstance, readSession: SessionReader) {
  async function me(request: FastifyRequest) {
    const session = await readSession(request);
    if (!session) return null;
    const result = await getPool().query('SELECT id FROM users WHERE id=$1',[session.user.id]);
    return (result.rows[0]?.id as string | undefined) ?? null;
  }
  async function lookup(handle: string, publicOnly: boolean) {
    const result = await getPool().query(
      'SELECT u.id FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.handle=$1' +
      (publicOnly ? ' AND p.is_public=true' : '') + ' LIMIT 1',[handle]);
    return (result.rows[0]?.id as string | undefined) ?? null;
  }
  async function notify(a: string,b: string) {
    await Promise.all([a,b].map(id => publishDmUserEvent(id,'friendship-update'))).catch(() => {});
  }

  app.get('/api/v1/friends', async (request,reply) => {
    try {
      const self = await me(request);
      if (!self) return reply.code(401).send({error:'Unauthorized'});
      const result = await getPool().query(
        'SELECT u.handle, CASE WHEN p.is_public=true OR f.status=\'accepted\' OR f.requested_by_id<>$1 THEN p.display_name ELSE u.handle END AS "displayName",' +
        'CASE WHEN p.is_public=true OR f.status=\'accepted\' OR f.requested_by_id<>$1 THEN p.avatar_url ELSE NULL END AS "avatarUrl",' +
        ' f.status,f.requested_by_id AS "requesterId",f.created_at AS "requestedAt" ' +
        'FROM user_friendships f JOIN users u ON u.id=CASE WHEN f.user_a_id=$1 THEN f.user_b_id ELSE f.user_a_id END ' +
        'JOIN profiles p ON p.user_id=u.id WHERE (f.user_a_id=$1 OR f.user_b_id=$1) ' +
        'AND f.status IN (\'pending\',\'accepted\') ORDER BY lower(p.display_name),u.handle LIMIT 600',
        [self]);
      const friends: unknown[] = [], received: unknown[] = [], sent: unknown[] = [];
      for (const entry of result.rows) {
        const { status,requesterId,...person } = entry;
        if (status === 'accepted') friends.push(person);
        else if (requesterId === self) sent.push(person);
        else received.push(person);
      }
      return reply.header('Cache-Control',noCache).send({friends,received,sent});
    } catch (error) {
      request.log.error({err:error},'Friends list');
      return reply.code(503).send({error:'Service unavailable'});
    }
  });

  app.get('/api/v1/friends/relationship/:handle',{schema:{params}},async(request,reply)=>{
    try {
      const self=await me(request);
      if(!self)return reply.code(401).send({error:'Unauthorized'});
      const {handle}=request.params as {handle:string};
      const other=await lookup(handle,false);
      if(!other || other===self)return reply.header('Cache-Control',noCache).send({status:'none'});
      const [a,b]=pair(self,other);
      const found=await getPool().query('SELECT status,requested_by_id FROM user_friendships WHERE user_a_id=$1 AND user_b_id=$2',[a,b]);
      if(!found.rowCount || !['accepted','pending'].includes(found.rows[0].status))return reply.header('Cache-Control',noCache).send({status:'none'});
      const status=found.rows[0].status==='accepted'?'friends':found.rows[0].requested_by_id===self?'sent':'received';
      return reply.header('Cache-Control',noCache).send({status});
    }catch(error){
      request.log.error({err:error},'Friendship status');
      return reply.code(503).send({error:'Service unavailable'});
    }
  });

  app.post('/api/v1/friends/requests',{schema:{body}},async(request,reply)=>{
    if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const self=await me(request);
      if(!self)return reply.code(401).send({error:'Unauthorized'});
      const {handle}=request.body as {handle:string};
      // Exact known @handle is valid for private users; they are never listed in public search.
      const other=await lookup(handle,false);
      if(!other || other===self)return reply.code(404).send({error:'Profile unavailable'});
      const [a,b]=pair(self,other);
      const current=await getPool().query('SELECT status,requested_by_id,updated_at FROM user_friendships WHERE user_a_id=$1 AND user_b_id=$2',[a,b]);
      if(current.rowCount){
        const row=current.rows[0];
        if(row.status==='accepted')return reply.header('Cache-Control',noCache).send({status:'friends'});
        if(row.status==='pending')
          return row.requested_by_id===self ? reply.header('Cache-Control',noCache).send({status:'sent'})
            :reply.code(409).send({error:'INCOMING_REQUEST_EXISTS'});
        const delayMs=row.status==='declined'?7*86400000:86400000;
        if(Date.now()-new Date(row.updated_at).getTime()<delayMs)
          return reply.code(429).send({error:'REQUEST_COOLDOWN'});
      }
      const limits=await getPool().query(
        'SELECT COUNT(*) FILTER (WHERE status=\'pending\')::int AS pending,' +
        'COUNT(*) FILTER (WHERE updated_at>now()-interval \'24 hours\')::int AS daily ' +
        'FROM user_friendships WHERE requested_by_id=$1',[self]);
      if(Number(limits.rows[0].pending)>=25 || Number(limits.rows[0].daily)>=10)
        return reply.code(429).send({error:'REQUEST_LIMIT'});
      const updated=await getPool().query(
        'INSERT INTO user_friendships(user_a_id,user_b_id,requested_by_id,status) VALUES($1,$2,$3,\'pending\') ' +
        'ON CONFLICT(user_a_id,user_b_id) DO UPDATE SET requested_by_id=EXCLUDED.requested_by_id,' +
        ' status=\'pending\',created_at=now(),updated_at=now() ' +
        'WHERE user_friendships.status IN (\'canceled\',\'declined\') ' +
        'AND user_friendships.updated_at <= now() - ' +
        '(CASE WHEN user_friendships.status=\'declined\' THEN interval \'7 days\' ELSE interval \'24 hours\' END) ' +
        'RETURNING user_a_id',[a,b,self]);
      if(!updated.rowCount)return reply.code(409).send({error:'Request state changed'});
      await notify(self,other);
      return reply.code(201).header('Cache-Control',noCache).send({status:'sent'});
    }catch(error){
      request.log.error({err:error},'Friend request');
      return reply.code(503).send({error:'Service unavailable'});
    }
  });

  app.post('/api/v1/friends/requests/:handle/accept',{schema:{params}},async(request,reply)=>{
    if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
    try {
      const self=await me(request);if(!self)return reply.code(401).send({error:'Unauthorized'});
      const other=await lookup((request.params as {handle:string}).handle,false);
      if(!other || self===other)return reply.code(404).send({error:'Request unavailable'});
      const [a,b]=pair(self,other);
      const count=await getPool().query(
        'SELECT COUNT(*)::int AS n FROM user_friendships WHERE status=\'accepted\' AND (user_a_id=$1 OR user_b_id=$1)',[self]);
      if(Number(count.rows[0].n)>=500)return reply.code(409).send({error:'Friends limit reached'});
      const result=await getPool().query(
        'UPDATE user_friendships SET status=\'accepted\',updated_at=now() ' +
        'WHERE user_a_id=$1 AND user_b_id=$2 AND requested_by_id=$3 AND status=\'pending\' RETURNING user_a_id',
        [a,b,other]);
      if(!result.rowCount)return reply.code(404).send({error:'Request unavailable'});
      await notify(self,other);
      return reply.header('Cache-Control',noCache).send({status:'friends'});
    }catch(error){request.log.error({err:error},'Accept friend');return reply.code(503).send({error:'Service unavailable'});}
  });

  app.post('/api/v1/friends/requests/:handle/decline',{schema:{params}},async(request,reply)=>{
    if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
    try {
      const self=await me(request);if(!self)return reply.code(401).send({error:'Unauthorized'});
      const other=await lookup((request.params as {handle:string}).handle,false);
      if(!other || self===other)return reply.code(404).send({error:'Request unavailable'});
      const [a,b]=pair(self,other);
      const result=await getPool().query(
        'UPDATE user_friendships SET status=\'declined\',updated_at=now() ' +
        'WHERE user_a_id=$1 AND user_b_id=$2 AND requested_by_id=$3 AND status=\'pending\' RETURNING user_a_id',
        [a,b,other]);
      if(!result.rowCount)return reply.code(404).send({error:'Request unavailable'});
      await notify(self,other);
      return reply.header('Cache-Control',noCache).send({status:'none'});
    }catch(error){request.log.error({err:error},'Decline friend');return reply.code(503).send({error:'Service unavailable'});}
  });

  app.delete('/api/v1/friends/:handle',{schema:{params}},async(request,reply)=>{
    if(!allowedOrigin(request))return reply.code(403).send({error:'Invalid origin'});
    try {
      const self=await me(request);if(!self)return reply.code(401).send({error:'Unauthorized'});
      const other=await lookup((request.params as {handle:string}).handle,false);
      if(!other || self===other)return reply.code(204).send();
      const [a,b]=pair(self,other);
      const result=await getPool().query(
        'UPDATE user_friendships SET status=\'canceled\',updated_at=now() ' +
        'WHERE user_a_id=$1 AND user_b_id=$2 AND (status=\'accepted\' OR (status=\'pending\' AND requested_by_id=$3)) RETURNING user_a_id',
        [a,b,self]);
      if(result.rowCount)await notify(self,other);
      return reply.header('Cache-Control',noCache).code(204).send();
    }catch(error){request.log.error({err:error},'Remove friend');return reply.code(503).send({error:'Service unavailable'});}
  });
}
