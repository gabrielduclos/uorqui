import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getPool } from './db/client.js';

type SessionReader=(request:FastifyRequest)=>Promise<{user:{id:string}}|null>;
const uuid={type:'string',format:'uuid'} as const;
const postParams={type:'object',required:['id'],additionalProperties:false,properties:{id:uuid}};
const followParams={type:'object',required:['handle'],additionalProperties:false,properties:{handle:{type:'string',pattern:'^[a-z][a-z0-9_]{2,31}$'}}};
const mediaParams={type:'object',required:['mediaId'],additionalProperties:false,properties:{mediaId:uuid}};
const slotParams={type:'object',required:['id','position'],additionalProperties:false,properties:{id:uuid,position:{type:'integer',minimum:0,maximum:5}}};
const commentParams={type:'object',required:['id','commentId'],additionalProperties:false,properties:{id:uuid,commentId:uuid}};
const postBody={type:'object',required:['body','mediaCount'],additionalProperties:false,properties:{body:{type:'string',maxLength:4000},mediaCount:{type:'integer',minimum:0,maximum:6}}};
const commentBody={type:'object',required:['body'],additionalProperties:false,properties:{body:{type:'string',minLength:1,maxLength:1000}}};
const postEdit={type:'object',required:['body'],additionalProperties:false,properties:{body:{type:'string',maxLength:4000}}};
const uploadBody={type:'object',required:['id','type','size'],additionalProperties:false,properties:{id:uuid,type:{type:'string',maxLength:80},size:{type:'integer',minimum:1,maximum:52428800}}};
const feedTypes=new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','video/mp4','video/webm','video/quicktime']);
const cache='private, no-store';
const allowedOrigin=(request:FastifyRequest)=>request.headers.origin===(process.env.WEB_ORIGIN??'http://localhost:5173');
const viewableSql=`
 p.deleted_at IS NULL AND p.published_at IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE
   (b.blocker_id=p.author_id AND b.blocked_id=$1::uuid) OR
   (b.blocker_id=$1::uuid AND b.blocked_id=p.author_id))
 AND (p.author_id=$1::uuid OR author_profile.is_public=true OR EXISTS (
   SELECT 1 FROM user_friendships f
   WHERE f.user_a_id=LEAST(p.author_id,$1::uuid) AND f.user_b_id=GREATEST(p.author_id,$1::uuid)
   AND f.status='accepted'))
`;
const followSql=`EXISTS (SELECT 1 FROM feed_follows f
  WHERE f.followed_id=p.author_id AND f.follower_id=$1::uuid)`;
const fields=`
 p.id,p.body,p.media_count AS "mediaCount",p.created_at AS "createdAt",p.published_at AS "publishedAt",
 to_char(p.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorTime",
 u.handle AS "authorHandle",author_profile.display_name AS "authorName",
 CASE WHEN NOT EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id=p.author_id AND b.blocked_id=$1::uuid
   OR b.blocked_id=p.author_id AND b.blocker_id=$1::uuid) THEN author_profile.avatar_url ELSE NULL END AS "authorAvatar",
 (p.author_id=$1::uuid) AS "mine",
 EXISTS (SELECT 1 FROM feed_follows ff WHERE ff.followed_id=p.author_id AND ff.follower_id=$1::uuid) AS "following",
 (SELECT COUNT(*)::int FROM feed_likes l WHERE l.post_id=p.id) AS "likeCount",
 EXISTS(SELECT 1 FROM feed_likes l WHERE l.post_id=p.id AND l.user_id=$1::uuid) AS "liked",
 (SELECT COUNT(*)::int FROM feed_comments c WHERE c.post_id=p.id AND to_jsonb(c)->>'deleted_at' IS NULL) AS "commentCount",
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'type',m.type,'size',m.size,'position',m.position)
 ORDER BY m.position) FROM feed_media m WHERE m.post_id=p.id),'[]'::jsonb) AS media
`;
const from=` FROM feed_posts p JOIN users u ON u.id=p.author_id JOIN profiles author_profile ON author_profile.user_id=p.author_id `;

export function registerFeedRoutes(app:FastifyInstance,readSession:SessionReader){
  async function self(req:FastifyRequest){
    const session=await readSession(req);
    if(!session)return null;
    const exists=await getPool().query('SELECT id FROM users WHERE id=$1',[session.user.id]);
    return exists.rows[0]?.id as string|undefined ?? null;
  }
  async function available(){
    const result=await getPool().query("SELECT to_regclass('public.feed_posts') IS NOT NULL AND to_regclass('public.feed_media') IS NOT NULL AND to_regclass('public.feed_follows') IS NOT NULL AND to_regclass('public.feed_likes') IS NOT NULL AND to_regclass('public.feed_comments') IS NOT NULL AS ready");
    return !!result.rows[0]?.ready;
  }
  function failed(req:FastifyRequest,reply:any,err:unknown,what:string){
    req.log.error({err},what);return reply.code(503).send({error:'Feed unavailable'});
  }
  async function visible(postId:string,me:string){
    const result=await getPool().query(
      'SELECT p.id'+from+' WHERE p.id=$2 AND '+viewableSql,[me,postId]);
    return result.rowCount===1;
  }

  app.get('/api/v1/feed/posts',{schema:{querystring:{
    type:'object',additionalProperties:false,properties:{
      filter:{type:'string',enum:['for-you','following','videos']},
      cursor:{type:'string',maxLength:100}
    }
  }}},async(req,reply)=>{
    try{
      const me=await self(req);if(!me)return reply.code(401).send({error:'Unauthorized'});
      if(!await available())return reply.code(503).send({error:'FEED_NOT_READY'});
      const {filter='for-you',cursor}=req.query as {filter?:'for-you'|'following'|'videos';cursor?:string};
      let keyTime:string|null=null,keyId:string|null=null;
      if(cursor){
        const [date,id,...extra]=cursor.split('|');
        if(extra.length||!date||!id||!/^\d{4}-\d\d-\d\dT/.test(date)||
          Number.isNaN(Date.parse(date))||!/^[0-9a-f-]{36}$/.test(id))return reply.code(400).send({error:'Invalid cursor'});
        keyTime=date;keyId=id;
      }
      const where=filter==='following'?' AND (p.author_id=$1::uuid OR '+followSql+')':
        filter==='videos'?" AND EXISTS (SELECT 1 FROM feed_media fm WHERE fm.post_id=p.id AND fm.type LIKE 'video/%')":'';
      const result=await getPool().query('SELECT '+fields+from+' WHERE '+viewableSql+where+
        ' AND ($2::timestamptz IS NULL OR (p.published_at,p.id)<($2::timestamptz,$3::uuid)) '+
        'ORDER BY p.published_at DESC,p.id DESC LIMIT 13',[me,keyTime,keyId]);
      const rows=result.rows.slice(0,12),last=rows.at(-1);
      return reply.header('Cache-Control',cache).send({
        posts:rows,nextCursor:result.rows.length>12&&last?last.cursorTime+'|'+last.id:null
      });
    }catch(err){return failed(req,reply,err,'Feed list');}
  });

  app.get('/api/v1/feed/posts/:id',{schema:{params:postParams}},async(req,reply)=>{
    try{
      const me=await self(req);if(!me)return reply.code(401).send({error:'Unauthorized'});
      if(!await available())return reply.code(503).send({error:'FEED_NOT_READY'});
      const {id}=req.params as {id:string};
      const r=await getPool().query('SELECT '+fields+from+' WHERE p.id=$2 AND '+viewableSql,[me,id]);
      if(!r.rowCount)return reply.code(404).send({error:'Not found'});
      return reply.header('Cache-Control',cache).send({post:r.rows[0]});
    }catch(err){return failed(req,reply,err,'Feed post');}
  });

  app.post('/api/v1/feed/posts',{schema:{body:postBody}},async(req,reply)=>{
    if(!allowedOrigin(req))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(req);if(!me)return reply.code(401).send({error:'Unauthorized'});
      if(!await available())return reply.code(503).send({error:'FEED_NOT_READY'});
      const {body,mediaCount}=req.body as {body:string;mediaCount:number},clean=body.trim();
      if(!clean&&!mediaCount)return reply.code(400).send({error:'Empty post'});
      const recent=await getPool().query("SELECT count(*)::int AS n FROM feed_posts WHERE author_id=$1 AND created_at>now()-interval '1 hour'",[me]);
      if(recent.rows[0].n>=25)return reply.code(429).send({error:'POST_RATE_LIMIT'});
      const r=await getPool().query(
        'INSERT INTO feed_posts(author_id,body,media_count,published_at) VALUES ($1,$2,$3,'+
        'CASE WHEN $3=0 THEN now() ELSE NULL END) RETURNING id,published_at AS "publishedAt"',
        [me,clean,mediaCount]);
      return reply.code(201).header('Cache-Control',cache).send({post:r.rows[0]});
    }catch(err){return failed(req,reply,err,'Create feed post');}
  });

  app.get('/api/v1/feed/posts/:id/draft',{schema:{params:postParams}},async(req,reply)=>{
    try{
      const me=await self(req);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=req.params as {id:string};
      const r=await getPool().query('SELECT p.media_count AS "mediaCount",p.published_at AS "publishedAt",'+
        "COALESCE(jsonb_agg(jsonb_build_object('id',m.id,'position',m.position,'type',m.type)) FILTER(WHERE m.id IS NOT NULL),'[]'::jsonb) AS media "+
        'FROM feed_posts p LEFT JOIN feed_media m ON m.post_id=p.id WHERE p.id=$1 AND p.author_id=$2 AND p.deleted_at IS NULL '+
        'GROUP BY p.id',[id,me]);
      if(!r.rowCount)return reply.code(404).send({error:'Not found'});
      return reply.header('Cache-Control',cache).send({draft:r.rows[0]});
    }catch(err){return failed(req,reply,err,'Feed draft');}
  });

  app.get('/api/v1/feed/posts/:id/media/:position/allowed',{schema:{params:slotParams}},async(req,reply)=>{
    try{
      const me=await self(req);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,position}=req.params as {id:string;position:number};
      const r=await getPool().query(
        'SELECT 1 FROM feed_posts p WHERE p.id=$1 AND p.author_id=$2 AND p.deleted_at IS NULL '+
        'AND p.published_at IS NULL AND p.created_at>now()-interval \'24 hours\' AND $3<p.media_count',
        [id,me,position]);
      if(!r.rowCount)return reply.code(404).send({error:'Draft unavailable'});
      const existing=await getPool().query('SELECT 1 FROM feed_media WHERE post_id=$1 AND position=$2',[id,position]);
      if(existing.rowCount)return reply.code(409).send({error:'ALREADY_UPLOADED'});
      return reply.header('Cache-Control',cache).send({allowed:true});
    }catch(err){return failed(req,reply,err,'Feed upload permission');}
  });

  app.post('/api/v1/feed/posts/:id/media/:position',{schema:{params:slotParams,body:uploadBody}},async(req,reply)=>{
    if(!allowedOrigin(req))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(req);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,position}=req.params as {id:string;position:number};
      const data=req.body as {id:string;type:string;size:number};
      if(!feedTypes.has(data.type))return reply.code(415).send({error:'Unsupported media'});
      const secret=process.env.DM_ATTACHMENT_PROOF_SECRET;
      const proof=req.headers['x-uorqui-attachment-proof'];
      if(!secret||secret.length<32||typeof proof!=='string'||!/^[0-9a-f]{64}$/.test(proof))
        return reply.code(403).send({error:'Invalid media proof'});
      const value=JSON.stringify([id,position,data.id,data.type,data.size]);
      const expected=createHmac('sha256',secret).update(value).digest('hex');
      if(!timingSafeEqual(Buffer.from(proof,'hex'),Buffer.from(expected,'hex')))
        return reply.code(403).send({error:'Invalid media proof'});
      const client=await getPool().connect();
      try{
        await client.query('BEGIN');
        const r=await client.query('SELECT media_count FROM feed_posts WHERE id=$1 AND author_id=$2 AND deleted_at IS NULL '+
          "AND published_at IS NULL AND created_at>now()-interval '24 hours' FOR UPDATE",[id,me]);
        if(!r.rowCount||position>=r.rows[0].media_count){await client.query('ROLLBACK');return reply.code(404).send({error:'Draft unavailable'});}
        const others=await client.query('SELECT type FROM feed_media WHERE post_id=$1',[id]);
        if(others.rows.length && (data.type.startsWith('video/')||others.rows.some(x=>x.type.startsWith('video/')))){
          await client.query('ROLLBACK');return reply.code(400).send({error:'Video posts contain one video only'});
        }
        if(data.type.startsWith('video/')&&r.rows[0].media_count!==1){
          await client.query('ROLLBACK');return reply.code(400).send({error:'Video posts contain one video only'});
        }
        const added=await client.query('INSERT INTO feed_media(id,post_id,position,type,size) VALUES($1,$2,$3,$4,$5) '+
          'ON CONFLICT(post_id,position) DO NOTHING RETURNING id',[data.id,id,position,data.type,data.size]);
        if(!added.rowCount){await client.query('ROLLBACK');return reply.code(409).send({error:'MEDIA_SLOT_TAKEN'});}
        await client.query('COMMIT');
        return reply.code(201).header('Cache-Control',cache).send({media:{...data,position}});
      }catch(err){await client.query('ROLLBACK').catch(()=>{});throw err;}
      finally{client.release();}
    }catch(err){return failed(req,reply,err,'Link feed media');}
  });

  app.post('/api/v1/feed/posts/:id/publish',{schema:{params:postParams}},async(req,reply)=>{
    if(!allowedOrigin(req))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(req);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=req.params as {id:string};
      const r=await getPool().query(
        'UPDATE feed_posts p SET published_at=COALESCE(p.published_at,now()) WHERE id=$1 AND author_id=$2 AND deleted_at IS NULL '+
        'AND (published_at IS NOT NULL OR (media_count>0 AND (SELECT count(*) FROM feed_media WHERE post_id=p.id)=p.media_count)) '+
        'RETURNING id,published_at AS "publishedAt"',[id,me]);
      if(!r.rowCount)return reply.code(409).send({error:'UPLOAD_INCOMPLETE'});
      return reply.header('Cache-Control',cache).send({post:r.rows[0]});
    }catch(err){return failed(req,reply,err,'Publish feed post');}
  });

  app.patch('/api/v1/feed/posts/:id',{schema:{params:postParams,body:postEdit}},async(req,reply)=>{
    if(!allowedOrigin(req))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(req);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=req.params as {id:string};const clean=(req.body as {body:string}).body.trim();
      const r=await getPool().query('UPDATE feed_posts SET body=$3 WHERE id=$1 AND author_id=$2 AND deleted_at IS NULL '+
        'AND ($3<>\'\' OR media_count>0) RETURNING id',[id,me,clean]);
      if(!r.rowCount)return reply.code(404).send({error:'Post unavailable'});
      return reply.header('Cache-Control',cache).send({updated:true});
    }catch(err){return failed(req,reply,err,'Edit feed post');}
  });

  app.delete('/api/v1/feed/posts/:id',{schema:{params:postParams}},async(req,reply)=>{
    if(!allowedOrigin(req))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(req);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=req.params as {id:string};
      const r=await getPool().query('UPDATE feed_posts SET deleted_at=now() WHERE id=$1 AND author_id=$2 AND deleted_at IS NULL RETURNING id',[id,me]);
      if(!r.rowCount)return reply.code(404).send({error:'Post unavailable'});
      return reply.header('Cache-Control',cache).send({deleted:true});
    }catch(err){return failed(req,reply,err,'Delete feed post');}
  });

  app.get('/api/v1/feed/media/:mediaId/access',{schema:{params:mediaParams}},async(req,reply)=>{
    try{
      const me=await self(req);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {mediaId}=req.params as {mediaId:string};
      const r=await getPool().query(
        'SELECT m.id,m.post_id AS "postId",m.type,m.size FROM feed_media m '+
        'JOIN feed_posts p ON p.id=m.post_id JOIN profiles author_profile ON author_profile.user_id=p.author_id '+
        'WHERE m.id=$2 AND p.deleted_at IS NULL AND ('+
        '(p.author_id=$1::uuid) OR (p.published_at IS NOT NULL AND '+viewableSql+'))',[me,mediaId]);
      if(!r.rowCount)return reply.code(404).send({error:'Media unavailable'});
      return reply.header('Cache-Control',cache).send({allowed:true,...r.rows[0]});
    }catch(err){return failed(req,reply,err,'Feed media access');}
  });

  async function followTarget(handle:string,me:string){
    const r=await getPool().query(
      "SELECT u.id,p.is_public AS \"isPublic\", "+
      "EXISTS(SELECT 1 FROM user_blocks b WHERE "+
      "(b.blocker_id=u.id AND b.blocked_id=$1::uuid) OR (b.blocker_id=$1::uuid AND b.blocked_id=u.id)) AS blocked, "+
      "EXISTS(SELECT 1 FROM user_friendships f WHERE f.user_a_id=LEAST(u.id,$1::uuid) "+
      "AND f.user_b_id=GREATEST(u.id,$1::uuid) AND f.status='accepted') AS friends, "+
      "EXISTS(SELECT 1 FROM feed_follows ff WHERE ff.follower_id=$1::uuid AND ff.followed_id=u.id) AS following "+
      'FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.handle=$2 LIMIT 1',
      [me,handle]
    );
    return r.rows[0] as {id:string;isPublic:boolean;blocked:boolean;friends:boolean;following:boolean}|undefined;
  }
  app.get('/api/v1/feed/follows/:handle',{schema:{params:followParams}},async(req,reply)=>{
    try{
      const me=await self(req);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {handle}=req.params as {handle:string};
      const target=await followTarget(handle,me);
      if(!target||target.blocked)return reply.code(404).send({error:'Profile unavailable'});
      return reply.header('Cache-Control',cache).send({following:target.following,mine:target.id===me});
    }catch(err){return failed(req,reply,err,'Follow status');}
  });
  app.put('/api/v1/feed/follows/:handle',{schema:{params:followParams}},async(req,reply)=>{
    if(!allowedOrigin(req))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(req);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {handle}=req.params as {handle:string};
      const target=await followTarget(handle,me);
      if(!target||target.blocked||target.id===me)return reply.code(404).send({error:'Profile unavailable'});
      if(!target.isPublic&&!target.friends)return reply.code(403).send({error:'PRIVATE_PROFILE'});
      if(!target.following){
        const count=await getPool().query(
          "SELECT count(*)::int AS n,count(*) FILTER(WHERE created_at>now()-interval '24 hours')::int AS daily "+
          'FROM feed_follows WHERE follower_id=$1',[me]);
        if(count.rows[0].n>=1000||count.rows[0].daily>=150)return reply.code(429).send({error:'FOLLOW_LIMIT'});
      }
      await getPool().query('INSERT INTO feed_follows(follower_id,followed_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[me,target.id]);
      return reply.header('Cache-Control',cache).send({following:true});
    }catch(err){return failed(req,reply,err,'Follow user');}
  });
  app.delete('/api/v1/feed/follows/:handle',{schema:{params:followParams}},async(req,reply)=>{
    if(!allowedOrigin(req))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(req);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {handle}=req.params as {handle:string};
      const target=await followTarget(handle,me);
      if(!target||target.blocked)return reply.code(404).send({error:'Profile unavailable'});
      await getPool().query('DELETE FROM feed_follows WHERE follower_id=$1 AND followed_id=$2',[me,target.id]);
      return reply.header('Cache-Control',cache).send({following:false});
    }catch(err){return failed(req,reply,err,'Unfollow user');}
  });

  app.put('/api/v1/feed/posts/:id/like',{schema:{params:postParams}},async(req,reply)=>{
    if(!allowedOrigin(req))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(req);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=req.params as {id:string};
      if(!await visible(id,me))return reply.code(404).send({error:'Post unavailable'});
      await getPool().query('INSERT INTO feed_likes(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,me]);
      return reply.header('Cache-Control',cache).send({liked:true});
    }catch(err){return failed(req,reply,err,'Like post');}
  });
  app.delete('/api/v1/feed/posts/:id/like',{schema:{params:postParams}},async(req,reply)=>{
    if(!allowedOrigin(req))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(req);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=req.params as {id:string};
      if(!await visible(id,me))return reply.code(404).send({error:'Post unavailable'});
      await getPool().query('DELETE FROM feed_likes WHERE post_id=$1 AND user_id=$2',[id,me]);
      return reply.header('Cache-Control',cache).send({liked:false});
    }catch(err){return failed(req,reply,err,'Unlike post');}
  });

  app.get('/api/v1/feed/posts/:id/comments',{schema:{params:postParams}},async(req,reply)=>{
    try{
      const me=await self(req);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=req.params as {id:string};
      if(!await visible(id,me))return reply.code(404).send({error:'Post unavailable'});
      const r=await getPool().query(
        'SELECT c.id,CASE WHEN (to_jsonb(c)->>'deleted_at') IS NOT NULL THEN \'\' ELSE c.body END AS body, '+
        'c.created_at AS "createdAt",((to_jsonb(c)->>'deleted_at') IS NOT NULL) AS deleted, '+
        'CASE WHEN (to_jsonb(c)->>'deleted_at') IS NULL THEN u.handle ELSE NULL END AS "authorHandle", '+
        "CASE WHEN (to_jsonb(c)->>'deleted_at') IS NOT NULL THEN NULL WHEN pr.is_public OR c.author_id=$2::uuid OR EXISTS (SELECT 1 FROM user_friendships f WHERE f.user_a_id=LEAST(c.author_id,$2::uuid) AND f.user_b_id=GREATEST(c.author_id,$2::uuid) AND f.status='accepted') THEN pr.display_name ELSE u.handle END AS \"authorName\", "+
        "CASE WHEN (to_jsonb(c)->>'deleted_at') IS NOT NULL THEN NULL WHEN pr.is_public OR c.author_id=$2::uuid OR EXISTS (SELECT 1 FROM user_friendships f WHERE f.user_a_id=LEAST(c.author_id,$2::uuid) AND f.user_b_id=GREATEST(c.author_id,$2::uuid) AND f.status='accepted') THEN pr.avatar_url ELSE NULL END AS \"authorAvatar\", "+
        '(c.author_id=$2::uuid) AS mine,((to_jsonb(c)->>'deleted_at') IS NULL AND (c.author_id=$2::uuid OR p.author_id=$2::uuid)) AS "canDelete" '+
        'FROM feed_comments c JOIN feed_posts p ON p.id=c.post_id JOIN users u ON u.id=c.author_id JOIN profiles pr ON pr.user_id=c.author_id '+
        'WHERE c.post_id=$1 AND ((to_jsonb(c)->>'deleted_at') IS NOT NULL OR NOT EXISTS (SELECT 1 FROM user_blocks b WHERE '+
        '(b.blocker_id=c.author_id AND b.blocked_id=$2) OR (b.blocker_id=$2 AND b.blocked_id=c.author_id))) '+
        'ORDER BY c.created_at DESC,c.id DESC LIMIT 80',[id,me]);
      return reply.header('Cache-Control',cache).send({comments:r.rows.reverse()});
    }catch(err){return failed(req,reply,err,'Feed comments');}
  });
  app.post('/api/v1/feed/posts/:id/comments',{schema:{params:postParams,body:commentBody}},async(req,reply)=>{
    if(!allowedOrigin(req))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(req);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id}=req.params as {id:string};const clean=(req.body as {body:string}).body.trim();
      if(!clean)return reply.code(400).send({error:'Empty comment'});
      if(!await visible(id,me))return reply.code(404).send({error:'Post unavailable'});
      const recent=await getPool().query("SELECT count(*)::int AS n FROM feed_comments WHERE author_id=$1 AND created_at>now()-interval '1 minute'",[me]);
      if(recent.rows[0].n>=20)return reply.code(429).send({error:'COMMENT_RATE_LIMIT'});
      const r=await getPool().query('INSERT INTO feed_comments(post_id,author_id,body) VALUES($1,$2,$3) RETURNING id',[id,me,clean]);
      return reply.code(201).header('Cache-Control',cache).send({id:r.rows[0].id});
    }catch(err){return failed(req,reply,err,'Add feed comment');}
  });
  app.delete('/api/v1/feed/posts/:id/comments/:commentId',{schema:{params:commentParams}},async(req,reply)=>{
    if(!allowedOrigin(req))return reply.code(403).send({error:'Invalid origin'});
    try{
      const me=await self(req);if(!me)return reply.code(401).send({error:'Unauthorized'});
      const {id,commentId}=req.params as {id:string;commentId:string};
      // Either the commenter or the author of the post can moderate the comment.
      // Keep a tombstone in its original position without exposing deleted content.
      const r=await getPool().query(
        'UPDATE feed_comments c SET deleted_at=now(),deleted_by_id=$3,body=\'[deleted]\' '+
        'WHERE c.id=$1 AND c.post_id=$2 AND c.deleted_at IS NULL '+
        'AND EXISTS (SELECT 1 FROM feed_posts p WHERE p.id=c.post_id AND p.deleted_at IS NULL '+
        'AND (p.author_id=$3 OR c.author_id=$3)) RETURNING c.id',[commentId,id,me]);
      if(!r.rowCount)return reply.code(404).send({error:'Comment unavailable'});
      return reply.code(204).send();
    }catch(err){return failed(req,reply,err,'Delete feed comment');}
  });
}
