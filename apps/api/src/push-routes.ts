import type {FastifyInstance,FastifyRequest} from 'fastify';
import {createCipheriv,createECDH,createHmac,createPrivateKey,randomBytes,sign,timingSafeEqual} from 'node:crypto';
import {getPool} from './db/client.js';
import {publishDmConversationEvent} from './dm-events.js';

type SessionReader=(request:FastifyRequest)=>Promise<{user:{id:string}}|null>;
type Subscription={endpoint:string;p256dh:string;auth:string;user_id:string};
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const base64=/^[A-Za-z0-9_-]+$/;
const receiptTtl=60*60*24;
const subscriptionBody={type:'object',additionalProperties:false,required:['subscription'],
  properties:{subscription:{type:'object',additionalProperties:false,required:['endpoint','keys'],
    properties:{endpoint:{type:'string',maxLength:2048},expirationTime:{type:['integer','null']},
      keys:{type:'object',additionalProperties:false,required:['p256dh','auth'],
        properties:{p256dh:{type:'string',minLength:80,maxLength:120},
          auth:{type:'string',minLength:16,maxLength:80}}}}}}};
const deliveryBody={type:'object',additionalProperties:false,required:['messageId','conversationId','proof'],
  properties:{messageId:{type:'string',format:'uuid'},conversationId:{type:'string',format:'uuid'},
    proof:{type:'string',maxLength:1000}}};
const noCache='private, no-store';
const publicKey=()=>process.env.VAPID_PUBLIC_KEY?.trim()??'';
const privateKey=()=>process.env.VAPID_PRIVATE_KEY?.trim()??'';
const enabled=()=>publicKey().length>0&&privateKey().length>0;
function originValid(request:FastifyRequest){
  return request.headers.origin===(process.env.WEB_ORIGIN??'http://localhost:5173');
}
/** Limit outbound requests to legitimate push provider endpoints: user supplied
 * URLs must NEVER turn this sender into an SSRF proxy.
 */
export function trustedPushEndpoint(endpoint:string){
  try{
    const url=new URL(endpoint);
    const host=url.hostname.toLowerCase();
    return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.hash&&
      endpoint.length<=2048&&
      (host==='fcm.googleapis.com'||host==='android.googleapis.com'||
        host==='web.push.apple.com'||host.endsWith('.push.apple.com')||
        host==='updates.push.services.mozilla.com'||host.endsWith('.push.services.mozilla.com')||
        host.endsWith('.notify.windows.com'));
  }catch{return false;}
}
function keyValid(value:string,min:number,max:number){
  if(!base64.test(value))return false;
  const bytes=Buffer.from(value,'base64url');
  return bytes.length>=min&&bytes.length<=max;
}
const b64=(value:Buffer|string)=>Buffer.from(value).toString('base64url');
function hmac(key:Buffer,data:Buffer){
  return createHmac('sha256',key).update(data).digest();
}
function expand(prk:Buffer,info:Buffer,n:number){
  return hmac(prk,Buffer.concat([info,Buffer.from([1])])).subarray(0,n);
}
function vapidSignature(endpoint:string){
  const pub=Buffer.from(publicKey(),'base64url');
  const prv=Buffer.from(privateKey(),'base64url');
  if(pub.length!==65||pub[0]!==4||prv.length!==32)throw Error('Invalid VAPID key material');
  const signingKey=createPrivateKey({key:{
    kty:'EC',crv:'P-256',x:b64(pub.subarray(1,33)),y:b64(pub.subarray(33,65)),d:b64(prv)
  },format:'jwk'});
  const header=b64(JSON.stringify({typ:'JWT',alg:'ES256'}));
  const body=b64(JSON.stringify({aud:new URL(endpoint).origin,
    exp:Math.floor(Date.now()/1000)+43200,sub:process.env.VAPID_SUBJECT??'mailto:push@uorqui.app'}));
  const unsigned=header+'.'+body;
  const signature=sign('sha256',Buffer.from(unsigned),{key:signingKey,dsaEncoding:'ieee-p1363'});
  return 'vapid t='+unsigned+'.'+b64(signature)+', k='+publicKey();
}
/** RFC8291 aes128gcm; ported from legacy Uorqui's functioning Web Push sender. */
function encrypt(subscription:Subscription,payload:string){
  const recipient=Buffer.from(subscription.p256dh,'base64url');
  const auth=Buffer.from(subscription.auth,'base64url');
  const ecdh=createECDH('prime256v1');
  ecdh.generateKeys();
  const serverPub=ecdh.getPublicKey();
  const shared=ecdh.computeSecret(recipient);
  const ikm=expand(hmac(auth,shared),
    Buffer.concat([Buffer.from('WebPush: info\0'),recipient,serverPub]),32);
  const salt=randomBytes(16);
  const prk=hmac(salt,ikm);
  const cek=expand(prk,Buffer.from('Content-Encoding: aes128gcm\0'),16);
  const nonce=expand(prk,Buffer.from('Content-Encoding: nonce\0'),12);
  const cipher=createCipheriv('aes-128-gcm',cek,nonce);
  const plaintext=Buffer.concat([Buffer.from(payload),Buffer.from([2])]);
  const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final(),cipher.getAuthTag()]);
  const rs=Buffer.alloc(4);rs.writeUInt32BE(4096);
  return Buffer.concat([salt,rs,Buffer.from([65]),serverPub,ciphertext]);
}
const receiptKey=()=>privateKey()?Buffer.from(privateKey(),'base64url'):null;
export function signPushDelivery(userId:string,conversationId:string,messageId:string,revision:string){
  const secret=receiptKey();
  if(!secret)throw Error('Push not configured');
  const payload=b64(JSON.stringify({u:userId,c:conversationId,m:messageId,r:revision,
    e:Math.floor(Date.now()/1000)+receiptTtl}));
  const signature=b64(hmac(secret,Buffer.from('uorqui-push-v1:'+payload)));
  return payload+'.'+signature;
}
function verifyPushDelivery(token:string,userId:string,conversationId:string,messageId:string){
  try{
    const [payload,signature,...extra]=token.split('.');
    const secret=receiptKey();
    if(!secret||!payload||!signature||extra.length||!base64.test(payload)||!base64.test(signature))return null;
    const expected=hmac(secret,Buffer.from('uorqui-push-v1:'+payload));
    const actual=Buffer.from(signature,'base64url');
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
    const value=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')) as
      {u:string;c:string;m:string;r:string;e:number};
    if(value.u!==userId||value.c!==conversationId||value.m!==messageId||
      typeof value.r!=='string'||!Number.isSafeInteger(value.e)||
      value.e<Math.floor(Date.now()/1000))return null;
    return value.r;
  }catch{return null;}
}
async function sendPush(subscription:Subscription,payload:object){
  if(!trustedPushEndpoint(subscription.endpoint))return 400;
  const body=encrypt(subscription,JSON.stringify(payload));
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch(subscription.endpoint,{method:'POST',signal:controller.signal,headers:{
      authorization:vapidSignature(subscription.endpoint),ttl:'86400',urgency:'high',
      'content-encoding':'aes128gcm','content-type':'application/octet-stream'
    },body});
    return response.status;
  }finally{clearTimeout(timeout);}
}
export async function pushDirectMessage(messageId:string){
  if(!enabled())return;
  const row=await getPool().query(
    'SELECT m.id,m.conversation_id,m.author_id,m.body,m.attachment_type,'+
    'COALESCE(m.edited_at,m.created_at) AS revision,'+
    'CASE WHEN c.participant_a_id=m.author_id THEN c.participant_b_id ELSE c.participant_a_id END AS recipient,'+
    'COALESCE(p.display_name,u.handle) AS sender '+
    'FROM direct_messages m JOIN direct_conversations c ON c.id=m.conversation_id '+
    'JOIN users u ON u.id=m.author_id LEFT JOIN profiles p ON p.user_id=m.author_id '+
    'WHERE m.id=$1 AND m.deleted_at IS NULL',[messageId]);
  if(!row.rowCount)return;
  const m=row.rows[0];
  const subscriptions=await getPool().query<Subscription>(
    'SELECT s.endpoint,s.p256dh,s.auth,s.user_id FROM push_subscriptions s '+
    'LEFT JOIN notification_preferences np ON np.user_id=s.user_id '+
    'WHERE s.user_id=$1 AND COALESCE(np.direct_message,true)=true ORDER BY s.updated_at DESC LIMIT 10',
    [m.recipient]);
  await Promise.allSettled(subscriptions.rows.map(async sub=>{
    const proof=signPushDelivery(m.recipient,m.conversation_id,m.id,new Date(m.revision).toISOString());
    try{
      const status=await sendPush(sub,{kind:'dm',recipientId:m.recipient,conversationId:m.conversation_id,
        messageId:m.id,title:String(m.sender).slice(0,80),
        body:m.attachment_type?'Novo anexo recebido':'Nova mensagem privada',proof});
      if(status===404||status===410)await getPool().query('DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2',[sub.endpoint,m.recipient]);
    }catch{/* Best effort: existing live inbox delivery remains authoritative. */}
  }));
}
export async function pushCommunityMessage(messageId:string){
  if(!enabled())return;
  const row=await getPool().query(
    'SELECT m.id,m.channel_id,ch.community_id,c.name,ch.name AS channel_name,m.author_id '+
    'FROM community_messages m JOIN community_channels ch ON ch.id=m.channel_id '+
    'JOIN communities c ON c.id=ch.community_id WHERE m.id=$1 AND m.deleted_at IS NULL',[messageId]);
  if(!row.rowCount)return;
  const m=row.rows[0];
  // Limit per message to avoid unbounded network calls on large public communities.
  const recipients=await getPool().query<Subscription>(
    'SELECT DISTINCT ON (s.endpoint) s.endpoint,s.p256dh,s.auth,s.user_id '+
    'FROM push_subscriptions s JOIN community_members cm ON cm.user_id=s.user_id AND cm.community_id=$1 '+
    'LEFT JOIN notification_preferences np ON np.user_id=s.user_id '+
    'WHERE s.user_id<>$2 AND COALESCE(np.community_message,true)=true AND NOT EXISTS (SELECT 1 FROM community_bans b WHERE b.community_id=$1 AND b.user_id=s.user_id) '+
    'ORDER BY s.endpoint LIMIT 200',[m.community_id,m.author_id]);
  await Promise.allSettled(recipients.rows.map(async sub=>{
    try{
      const status=await sendPush(sub,{kind:'community',recipientId:sub.user_id,
        communityId:m.community_id,channelId:m.channel_id,
        title:String(m.name).slice(0,80),body:'Nova mensagem em #'+String(m.channel_name).slice(0,50)});
      if(status===404||status===410)await getPool().query('DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2',[sub.endpoint,sub.user_id]);
    }catch{/* Best effort. */}
  }));
}
export async function pushActivityNotification(notificationId:string){
  if(!enabled())return;
  const row=await getPool().query(
    'SELECT n.id,n.kind,n.recipient_id,n.actor_id,u.handle,'+
    'COALESCE(p.display_name,u.handle) AS actor_name '+
    'FROM activity_notifications n JOIN users u ON u.id=n.actor_id '+
    'LEFT JOIN profiles p ON p.user_id=n.actor_id '+
    'LEFT JOIN notification_preferences np ON np.user_id=n.recipient_id '+
    'WHERE n.id=$1 AND n.read_at IS NULL '+
    'AND COALESCE(CASE n.kind '+
    "WHEN 'post_like' THEN np.post_like WHEN 'post_comment' THEN np.post_comment "+
    "WHEN 'friend_request' THEN np.friend_request WHEN 'friend_accepted' THEN np.friend_accepted "+
    "WHEN 'follow' THEN np.follow ELSE false END,true)=true "+
    'AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE '+
    '(b.blocker_id=n.recipient_id AND b.blocked_id=n.actor_id) OR '+
    '(b.blocked_id=n.recipient_id AND b.blocker_id=n.actor_id))',[notificationId]);
  if(!row.rowCount)return;
  const n=row.rows[0];
  const verb:Record<string,string>={
    post_like:'curtiu sua publicação',
    post_comment:'comentou na sua publicação',
    friend_request:'enviou uma solicitação de amizade',
    friend_accepted:'aceitou sua solicitação de amizade',
    follow:'começou a seguir você'
  };
  const subs=await getPool().query<Subscription>(
    'SELECT endpoint,p256dh,auth,user_id FROM push_subscriptions WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 10',
    [n.recipient_id]);
  await Promise.allSettled(subs.rows.map(async sub=>{
    try{
      const status=await sendPush(sub,{kind:'activity',recipientId:n.recipient_id,
        notificationId:n.id,title:String(n.actor_name).slice(0,80),
        body:verb[n.kind]??'Nova atividade no Uorqui'});
      if(status===404||status===410)await getPool().query('DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2',[sub.endpoint,n.recipient_id]);
    }catch{/* Push is best-effort; the in-app notification remains persisted. */}
  }));
}

export function registerPushRoutes(app:FastifyInstance,readSession:SessionReader){
  async function me(request:FastifyRequest){
    const session=await readSession(request);
    if(!session||!UUID.test(session.user.id))return null;
    const row=await getPool().query('SELECT id FROM users WHERE id=$1',[session.user.id]);
    return row.rows[0]?.id as string|undefined;
  }
  app.get('/api/v1/push/config',async(_request,reply)=>
    reply.header('Cache-Control',noCache).send({enabled:enabled(),publicKey:enabled()?publicKey():null}));
  app.post('/api/v1/push/subscription',{schema:{body:subscriptionBody}},async(request,reply)=>{
    if(!originValid(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const userId=await me(request);if(!userId)return reply.code(401).send({error:'Unauthorized'});
      if(!enabled())return reply.code(503).send({error:'PUSH_NOT_CONFIGURED'});
      const sub=(request.body as {subscription:{endpoint:string;keys:{p256dh:string;auth:string}}}).subscription;
      if(!trustedPushEndpoint(sub.endpoint)||!keyValid(sub.keys.p256dh,65,65)||!keyValid(sub.keys.auth,16,16))
        return reply.code(400).send({error:'INVALID_SUBSCRIPTION'});
      await getPool().query('INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth) VALUES($1,$2,$3,$4) '+
        'ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,updated_at=now()',
        [userId,sub.endpoint,sub.keys.p256dh,sub.keys.auth]);
      await getPool().query('DELETE FROM push_subscriptions WHERE user_id=$1 AND id NOT IN '+
        '(SELECT id FROM push_subscriptions WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 10)',[userId]);
      return reply.header('Cache-Control',noCache).send({registered:true});
    }catch(error){request.log.error({err:error},'Push subscription');return reply.code(503).send({error:'PUSH_UNAVAILABLE'});}
  });
  app.delete('/api/v1/push/subscription',{schema:{body:{type:'object',additionalProperties:false,
    required:['endpoint'],properties:{endpoint:{type:'string',maxLength:2048}}}}},async(request,reply)=>{
    if(!originValid(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const userId=await me(request);if(!userId)return reply.code(401).send({error:'Unauthorized'});
      await getPool().query('DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2',
        [userId,(request.body as {endpoint:string}).endpoint]);
      return reply.header('Cache-Control',noCache).send({revoked:true});
    }catch{return reply.code(503).send({error:'PUSH_UNAVAILABLE'});}
  });
  app.post('/api/v1/push/delivered',{schema:{body:deliveryBody}},async(request,reply)=>{
    if(!originValid(request))return reply.code(403).send({error:'Invalid origin'});
    try{
      const userId=await me(request);if(!userId)return reply.code(401).send({error:'Unauthorized'});
      const {messageId,conversationId,proof}=request.body as {messageId:string;conversationId:string;proof:string};
      const revision=verifyPushDelivery(proof,userId,conversationId,messageId);
      if(!revision)return reply.code(403).send({error:'INVALID_DELIVERY_PROOF'});
      const r=await getPool().query(
        'UPDATE direct_messages m SET delivered_at=now() FROM direct_conversations c '+
        'WHERE m.id=$1 AND m.conversation_id=$2 AND m.conversation_id=c.id '+
        'AND m.author_id<>$3 AND (c.participant_a_id=$3 OR c.participant_b_id=$3) '+
        "AND m.deleted_at IS NULL AND date_trunc('milliseconds',COALESCE(m.edited_at,m.created_at))=$4::timestamptz "+
        'AND (m.delivered_at IS NULL OR (m.edited_at IS NOT NULL AND m.delivered_at<m.edited_at)) '+
        'RETURNING m.id',[messageId,conversationId,userId,revision]);
      if(r.rowCount)await publishDmConversationEvent(conversationId,'received')
        .catch(error=>request.log.warn({err:error},'Push receipt event unavailable'));
      return reply.header('Cache-Control',noCache).send({received:(r.rowCount??0)>0});
    }catch(error){request.log.error({err:error},'Push delivery acknowledgement');return reply.code(503).send({error:'PUSH_UNAVAILABLE'});}
  });
}
