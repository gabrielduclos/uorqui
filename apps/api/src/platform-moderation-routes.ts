import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getPool } from './db/client.js';
import { publishCommunityEvent } from './community-events.js';
import { publishDmConversationEvent } from './dm-events.js';

type SessionReader = (request: FastifyRequest) => Promise<{user:{id:string}}|null>;
type ReportAction = 'review'|'resolve'|'dismiss'|'remove';

const uuid={type:'string',format:'uuid'} as const;
const reportParams={type:'object',additionalProperties:false,required:['id'],properties:{id:uuid}};
const reviewBody={type:'object',additionalProperties:false,required:['action'],
  properties:{action:{type:'string',enum:['review','resolve','dismiss','remove']},
    note:{type:'string',maxLength:1000}}};
const filterSchema={type:'object',additionalProperties:false,properties:{
  status:{type:'string',enum:['all','pending','reviewing','resolved','dismissed']},
  kind:{type:'string',enum:['all','post','direct_message','community_message']},
  page:{type:'integer',minimum:0,maximum:200}
}};
const noStore='private, no-store';
const originValid=(request:FastifyRequest)=>
  request.headers.origin===(process.env.WEB_ORIGIN??'http://localhost:5173');

/** Platform moderation is not a community role. Default deny: only explicit
 * account UUIDs in a server-side environment variable can review private data.
 * Never trust a handle, email address, localStorage flag or request body for access.
 */
function isPlatformModerator(id:string):boolean{
  if(!/^[0-9a-f-]{36}$/i.test(id))return false;
  return (process.env.PLATFORM_MODERATOR_USER_IDS??'')
    .split(',').some(value=>value.trim().toLowerCase()===id.toLowerCase());
}

export function registerPlatformModerationRoutes(app:FastifyInstance,readSession:SessionReader){
  async function identity(request:FastifyRequest):Promise<string|null>{
    const session=await readSession(request);
    if(!session)return null;
    const found=await getPool().query('SELECT id FROM users WHERE id=$1',[session.user.id]);
    return found.rows[0]?.id??null;
  }

  app.get('/api/v1/moderation/access',async(request,reply)=>{
    try{
      const me=await identity(request);
      if(!me)return reply.code(401).send({error:'Unauthorized'});
      return reply.header('Cache-Control',noStore).send({moderator:isPlatformModerator(me)});
    }catch(error){
      request.log.error({err:error},'Check moderation access');
      return reply.code(503).send({error:'Unavailable'});
    }
  });

  app.get('/api/v1/moderation/reports',{schema:{querystring:filterSchema}},
    async(request,reply)=>{
      try{
        const me=await identity(request);
        if(!me)return reply.code(401).send({error:'Unauthorized'});
        if(!isPlatformModerator(me))return reply.code(403).send({error:'MODERATOR_REQUIRED'});
        const {status='all',kind='all',page=0}=request.query as {
          status?:string;kind?:string;page?:number;
        };
        const where="WHERE ($1='all' OR r.status=$1) AND ($2='all' OR r.target_kind=$2)";
        const result=await getPool().query(
          'SELECT r.id,r.target_kind AS "targetKind",r.target_id AS "targetId", '+
          'r.reason,r.details,r.evidence,r.status,r.created_at AS "createdAt", '+
          'reporter.handle AS "reporterHandle",author.handle AS "authorHandle", '+
          '(SELECT COUNT(*)::int FROM moderation_report_actions a WHERE a.report_id=r.id) AS "actionCount" '+
          'FROM content_reports r JOIN users reporter ON reporter.id=r.reporter_id '+
          'LEFT JOIN users author ON author.id=r.target_author_id '+
          where+' ORDER BY r.created_at DESC,r.id DESC LIMIT 26 OFFSET $3',
          [status,kind,page*25]);
        const count=await getPool().query(
          'SELECT COUNT(*)::int AS total FROM content_reports r '+where,[status,kind]);
        return reply.header('Cache-Control',noStore).send({
          reports:result.rows.slice(0,25),total:count.rows[0]?.total??0,
          hasMore:result.rows.length>25,page
        });
      }catch(error){
        request.log.error({err:error},'List moderation reports');
        return reply.code(503).send({error:'REPORTS_UNAVAILABLE'});
      }
    });

  app.get('/api/v1/moderation/reports/:id/actions',{schema:{params:reportParams}},
    async(request,reply)=>{
      try{
        const me=await identity(request);
        if(!me)return reply.code(401).send({error:'Unauthorized'});
        if(!isPlatformModerator(me))return reply.code(403).send({error:'MODERATOR_REQUIRED'});
        const {id}=request.params as {id:string};
        const existing=await getPool().query('SELECT 1 FROM content_reports WHERE id=$1',[id]);
        if(!existing.rowCount)return reply.code(404).send({error:'Report unavailable'});
        const actions=await getPool().query(
          'SELECT a.id,a.action,a.previous_status AS "previousStatus",'+
          'a.next_status AS "nextStatus",a.note,a.created_at AS "createdAt",'+
          'u.handle AS "moderatorHandle" FROM moderation_report_actions a '+
          'LEFT JOIN users u ON u.id=a.moderator_id WHERE a.report_id=$1 ORDER BY a.created_at,a.id',
          [id]);
        return reply.header('Cache-Control',noStore).send({actions:actions.rows});
      }catch(error){
        request.log.error({err:error},'Report audit history');
        return reply.code(503).send({error:'REPORTS_UNAVAILABLE'});
      }
    });

  app.post('/api/v1/moderation/reports/:id/review',
    {schema:{params:reportParams,body:reviewBody}},async(request,reply)=>{
      if(!originValid(request))return reply.code(403).send({error:'Invalid origin'});
      try{
        const me=await identity(request);
        if(!me)return reply.code(401).send({error:'Unauthorized'});
        if(!isPlatformModerator(me))return reply.code(403).send({error:'MODERATOR_REQUIRED'});
        const {id}=request.params as {id:string};
        const {action,note}=request.body as {action:ReportAction;note?:string};
        const trimmed=note?.trim()??'';
        if(action==='remove'&&!trimmed)return reply.code(400).send({error:'NOTE_REQUIRED'});
        const pool=getPool();
        const client=await pool.connect();
        let notification:{type:'dm';id:string}|{type:'channel';id:string;channelId:string}|null=null;
        try{
          await client.query('BEGIN');
          const found=await client.query(
            'SELECT id,target_kind,target_id,status FROM content_reports WHERE id=$1 FOR UPDATE',[id]);
          if(!found.rowCount){
            await client.query('ROLLBACK');return reply.code(404).send({error:'Report unavailable'});
          }
          const report=found.rows[0] as {
            id:string;target_kind:string;target_id:string;status:string;
          };
          if(!['pending','reviewing'].includes(report.status)){
            await client.query('ROLLBACK');return reply.code(409).send({error:'REPORT_ALREADY_CLOSED'});
          }
          if(action==='review'&&report.status==='reviewing'){
            await client.query('ROLLBACK');return reply.code(409).send({error:'ALREADY_REVIEWING'});
          }
          if(action==='remove'){
            if(report.target_kind==='post'){
              const changed=await client.query(
                'UPDATE feed_posts SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id',
                [report.target_id]);
              if(!changed.rowCount){await client.query('ROLLBACK');return reply.code(409).send({error:'CONTENT_UNAVAILABLE'});}
            }else if(report.target_kind==='direct_message'){
              const changed=await client.query(
                'UPDATE direct_messages SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING conversation_id',
                [report.target_id]);
              if(!changed.rowCount){await client.query('ROLLBACK');return reply.code(409).send({error:'CONTENT_UNAVAILABLE'});}
              notification={type:'dm',id:changed.rows[0].conversation_id};
            }else if(report.target_kind==='community_message'){
              const changed=await client.query(
                'UPDATE community_messages m SET deleted_at=now(),deleted_by_id=$2 '+
                'WHERE m.id=$1 AND m.deleted_at IS NULL RETURNING m.channel_id',
                [report.target_id,me]);
              if(!changed.rowCount){await client.query('ROLLBACK');return reply.code(409).send({error:'CONTENT_UNAVAILABLE'});}
              const channelId=changed.rows[0].channel_id as string;
              const group=await client.query('SELECT community_id FROM community_channels WHERE id=$1',[channelId]);
              if(group.rowCount) notification={type:'channel',id:group.rows[0].community_id,channelId};
            }else{
              await client.query('ROLLBACK');return reply.code(409).send({error:'INVALID_TARGET'});
            }
          }
          const nextStatus=action==='review'?'reviewing':action==='dismiss'?'dismissed':'resolved';
          await client.query('UPDATE content_reports SET status=$2 WHERE id=$1',[id,nextStatus]);
          await client.query(
            'INSERT INTO moderation_report_actions (report_id,moderator_id,action,previous_status,next_status,note) '+
            'VALUES ($1,$2,$3,$4,$5,$6)',[id,me,action,report.status,nextStatus,trimmed||null]);
          await client.query('COMMIT');
          if(notification?.type==='dm'){
            await publishDmConversationEvent(notification.id,'update')
              .catch(error=>request.log.warn({err:error},'DM moderation event failed'));
          }else if(notification?.type==='channel'){
            await publishCommunityEvent(notification.id,notification.channelId,'message')
              .catch(error=>request.log.warn({err:error},'Community moderation event failed'));
          }
          return reply.header('Cache-Control',noStore).send({id,status:nextStatus,action});
        }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
        finally{client.release();}
      }catch(error){
        request.log.error({err:error},'Review moderation report');
        return reply.code(503).send({error:'REPORTS_UNAVAILABLE'});
      }
    });
}
