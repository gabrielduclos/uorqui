import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getPool } from './db/client.js';
import { validRequestOrigin } from './request-origin.js';
import { publishDmUserEvent } from './dm-events.js';

type SessionReader = (request: FastifyRequest) => Promise<{ user: { id: string } } | null>;
const bodySchema = {
  type: 'object', additionalProperties: false, required: ['kind','instanceId'],
  properties: {
    kind: { type: 'string', enum: ['desktop','mobile'] },
    instanceId: { type: 'string', format: 'uuid' },
    takeover: { type: 'boolean' },
  },
};
const releaseSchema = {
  type: 'object', additionalProperties: false, required: ['kind','instanceId'],
  properties: { kind: { type: 'string', enum: ['desktop','mobile'] }, instanceId: { type: 'string', format: 'uuid' } },
};
type Kind = 'desktop' | 'mobile';
type Claim = { kind: Kind; instanceId: string; takeover?: boolean };

/** Atomically keep one live desktop tab and one live mobile PWA/tab per user.
 * The server never revokes the Better Auth session: only foreground ownership
 * of the workspace changes. Heartbeats cannot steal another instance's lease.
 */
export function registerAppInstanceRoutes(app: FastifyInstance, readSession: SessionReader) {
  async function authorize(request: FastifyRequest, reply: FastifyReply) {
    reply.header('Cache-Control','private, no-store');
    if (!validRequestOrigin(request)) { reply.code(403).send({error:'INVALID_ORIGIN'}); return null; }
    const session = await readSession(request);
    if (!session) { reply.code(401).send({error:'UNAUTHORIZED'}); return null; }
    return session.user.id;
  }
  function unavailable(request: FastifyRequest, reply: FastifyReply, error: unknown) {
    // Deploy order is not guaranteed: a new frontend/API can arrive before
    // migration 0043. Do not lock every existing user out during rollout.
    if(typeof error==='object'&&error!==null&&'code' in error&&error.code==='42P01')
      return reply.send({active:true,managed:false});
    request.log.error({err:error},'App instance lease unavailable');
    return reply.code(503).send({error:'INSTANCE_UNAVAILABLE'});
  }

  app.post('/api/v1/instances/claim',{schema:{body:bodySchema}},async(request,reply)=>{
    const userId=await authorize(request,reply);if(!userId)return;
    const {kind,instanceId,takeover=false}=request.body as Claim;
    try {
      // CONFLICT + predicate is one PostgreSQL atomic decision across all
      // Render replicas. A competing heartbeat never retakes a claimed slot.
      const acquired=await getPool().query<{instance_id:string}>(`
        INSERT INTO app_instance_leases (user_id,kind,instance_id,expires_at)
        VALUES ($1,$2,$3,now()+interval '60 seconds')
        ON CONFLICT (user_id,kind) DO UPDATE
          SET instance_id=EXCLUDED.instance_id,
              expires_at=EXCLUDED.expires_at,updated_at=now()
        WHERE app_instance_leases.expires_at<=now()
          OR app_instance_leases.instance_id=EXCLUDED.instance_id
          OR $4::boolean
        RETURNING instance_id`,[userId,kind,instanceId,takeover]);
      if(!acquired.rowCount)return reply.code(409).send({active:false,error:'INSTANCE_IN_USE'});
      // Existing visible tabs recheck immediately on an explicit takeover;
      // polling remains the cross-browser fallback if SSE is unavailable.
      if(takeover)await publishDmUserEvent(userId,'instance-lease').catch(()=>{});
      return {active:true,managed:true,leaseSeconds:60};
    } catch(error) { return unavailable(request,reply,error); }
  });

  app.post('/api/v1/instances/release',{schema:{body:releaseSchema}},async(request,reply)=>{
    const userId=await authorize(request,reply);if(!userId)return;
    const {kind,instanceId}=request.body as Claim;
    try{
      const result=await getPool().query(
        'DELETE FROM app_instance_leases WHERE user_id=$1 AND kind=$2 AND instance_id=$3',
        [userId,kind,instanceId]);
      return {released:Boolean(result.rowCount)};
    }catch(error){
      if(typeof error==='object'&&error!==null&&'code' in error&&error.code==='42P01')
        return {released:false};
      request.log.error({err:error},'App instance release failed');
      return reply.code(503).send({error:'INSTANCE_UNAVAILABLE'});
    }
  });
}
