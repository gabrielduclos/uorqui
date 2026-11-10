interface ProfileMediaObject {
  body: ReadableStream;
  size: number;
  range?: { offset: number; length: number };
  httpMetadata?: { contentType?: string };
}
interface ProfileMediaBucket {
  put(key: string, body: ArrayBuffer, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  get(key: string, options?: { range?: Headers }): Promise<ProfileMediaObject | null>;
  delete(key: string): Promise<void>;
  list(options:{prefix?:string;limit?:number}):Promise<{objects:{key:string}[];truncated:boolean}>;
}
interface Env {
  API_ORIGIN?: string;
  PROFILE_MEDIA?: ProfileMediaBucket;
  DM_ATTACHMENTS?: ProfileMediaBucket;
  DM_ATTACHMENT_PROOF_SECRET?: string;
  ASSETS: { fetch(input: Request | URL | string): Promise<Response> };
}

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_COMMUNITY_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_DM_BYTES = 50 * 1024 * 1024;
const COMMUNITY_AVATAR_PATH = /^\/media\/community\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.(webp|jpg|png)$/;
const COMMUNITY_AVATAR_WRITE = /^\/api\/media\/community\/([0-9a-f-]{36})$/;
const COMMUNITY_DELETE_PATH = /^\/api\/media\/community\/([0-9a-f-]{36})\/delete$/;
const DM_UPLOAD_PATH = /^\/api\/media\/dm\/([0-9a-f-]{36})$/;
const DM_MEDIA_PATH = /^\/media\/dm\/([0-9a-f-]{36})\/([0-9a-f-]{36})$/;
const COMMUNITY_ATTACHMENT_UPLOAD = /^\/api\/media\/community-attachment\/([0-9a-f-]{36})\/([0-9a-f-]{36})$/;
const COMMUNITY_ATTACHMENT_READ = /^\/media\/community-attachment\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/([0-9a-f-]{36})$/;
const DM_CANCEL_PATH = /^\/api\/v1\/dm\/conversations\/([0-9a-f-]{36})\/messages\/([0-9a-f-]{36})$/;
const DM_TYPES = new Set(['image/webp','image/jpeg','image/png','image/gif','image/heic','image/heif','video/mp4','video/webm','video/quicktime','application/pdf','text/plain','application/zip','application/octet-stream',
  'audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav','audio/x-m4a','audio/aac']);
const MEDIA_PATH = /^\/media\/profile\/([0-9a-f-]{36})\/(avatar|cover)\/([0-9a-f-]{36})\.(webp|jpg|png)$/;
const UPLOAD_PATH = /^\/api\/media\/profile\/(avatar|cover)$/;
const TYPE_EXTENSION: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function apiOrigin(raw: string | undefined, frontend: URL): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !local) return null;
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    if (url.origin === frontend.origin) return null;
    return url;
  } catch { return null; }
}

function apiHeaders(request: Request): Headers {
  const headers = new Headers({ 'Accept': 'application/json' });
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  return headers;
}

async function callApi(request: Request, origin: URL, path: string, method: 'GET' | 'PATCH' | 'POST' | 'DELETE' = 'GET', body?: object, extraHeaders?: Record<string,string>): Promise<Response> {
  const headers = apiHeaders(request);
  if (body) headers.set('content-type', 'application/json');
  if(extraHeaders) for(const [name,value] of Object.entries(extraHeaders))headers.set(name,value);
  if (method !== 'GET' && request.headers.get('origin')) headers.set('origin', request.headers.get('origin')!);
  return fetch(new URL(path, origin), {
    method, headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'manual',
  });
}

function validImage(bytes: Uint8Array, type: string): boolean {
  if (type === 'image/jpeg') return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') return bytes.length > 8 && [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n);
  if (type === 'image/webp') return bytes.length > 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  return false;
}

async function boundedBody(request: Request, max: number): Promise<ArrayBuffer | null> {
  if (!request.body) return null;
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > max) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (total === 0) return null;
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result.buffer;
}

/** Same-origin CSRF defense for cookie-authenticated media writes. */
function validWriteOrigin(request: Request, current: URL): boolean {
  const origin = request.headers.get('origin');
  return origin === current.origin && request.headers.get('sec-fetch-site') !== 'cross-site';
}

async function handleMediaWrite(request: Request, env: Env, current: URL, origin: URL, kind: 'avatar' | 'cover'): Promise<Response> {
  if (!env.PROFILE_MEDIA) return jsonError(503, 'Media storage is not configured');
  if (!validWriteOrigin(request, current)) return jsonError(403, 'Invalid upload origin');

  let who: { user?: { id?: string }; profile?: { avatarUrl?: string | null; coverUrl?: string | null } | null };
  try {
    const response = await callApi(request, origin, '/api/v1/me');
    if (!response.ok) return jsonError(response.status === 401 ? 401 : 503, 'Authentication unavailable');
    who = await response.json() as typeof who;
  } catch { return jsonError(503, 'Authentication unavailable'); }
  const userId = who.user?.id;
  if (!userId || !/^[0-9a-f-]{36}$/.test(userId) || !who.profile) return jsonError(403, 'Profile required');
  const oldUrl = kind === 'avatar' ? who.profile.avatarUrl : who.profile.coverUrl;

  let newUrl: string | null = null;
  let newKey: string | null = null;
  if (request.method === 'POST') {
    const type = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    const ext = TYPE_EXTENSION[type];
    if (!ext) return jsonError(415, 'Only WebP, JPEG and PNG images are supported');
    const body = await boundedBody(request, MAX_IMAGE_BYTES);
    if (!body) return jsonError(413, 'Image must be between 1 byte and 3 MB');
    if (!validImage(new Uint8Array(body), type)) return jsonError(415, 'Invalid image bytes');
    const assetId = crypto.randomUUID();
    newUrl = '/media/profile/' + userId + '/' + kind + '/' + assetId + '.' + ext;
    newKey = newUrl.slice(1);
    try {
      await env.PROFILE_MEDIA.put(newKey, body, { httpMetadata: { contentType: type } });
    } catch { return jsonError(503, 'Image storage unavailable'); }
  }

  try {
    const response = await callApi(request, origin, '/api/v1/me/profile', 'PATCH', {
      [kind === 'avatar' ? 'avatarUrl' : 'coverUrl']: newUrl,
    });
    if (!response.ok) {
      if (newKey) await env.PROFILE_MEDIA.delete(newKey).catch(() => {});
      return jsonError(response.status === 401 ? 401 : 503, 'Could not save profile image');
    }
    const body = await response.json() as { profile?: unknown };
    if (!body.profile) {
      if (newKey) await env.PROFILE_MEDIA.delete(newKey).catch(() => {});
      return jsonError(503, 'Profile image update was not confirmed');
    }
    // Best-effort garbage collection. The API rejects reads for stale URLs immediately.
    const oldMatch = oldUrl ? MEDIA_PATH.exec(oldUrl) : null;
    if (oldMatch?.[1] === userId && oldMatch?.[2] === kind) {
      await env.PROFILE_MEDIA.delete(oldUrl!.slice(1)).catch(() => {});
    }
    return Response.json({ profile: body.profile, url: newUrl }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    if (newKey) await env.PROFILE_MEDIA.delete(newKey).catch(() => {});
    return jsonError(503, 'Could not save profile image');
  }
}

async function handleMediaRead(request: Request, env: Env, origin: URL, matched: RegExpExecArray): Promise<Response> {
  if (!env.PROFILE_MEDIA) return jsonError(503, 'Media storage is not configured');
  const [path, ownerId, kind, asset] = matched;
  // The Fastify API enforces current image ownership AND public/private profile status.
  try {
    const response = await callApi(request, origin,
      '/api/v1/media/access/' + ownerId + '/' + kind + '/' + asset + '.' + matched[4]);
    if (!response.ok) return jsonError(response.status === 503 ? 503 : 404, 'Image not found');
    const permission = await response.json() as { allowed?: boolean };
    if (!permission.allowed) return jsonError(404, 'Image not found');
  } catch { return jsonError(503, 'Image authorization unavailable'); }

  try {
    const object = await env.PROFILE_MEDIA.get(path.slice(1));
    if (!object) return jsonError(404, 'Image not found');
    return new Response(request.method === 'HEAD' ? null : object.body, {
      status: 200,
      headers: {
        'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
        'content-length': String(object.size),
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  } catch { return jsonError(503, 'Image storage unavailable'); }
}


// Attachments are private objects under a conversation-scoped, random key.
// The API performs both upload membership and live message download authorization.
async function handleDmUpload(request: Request, env: Env, current: URL, origin: URL, conversationId: string, communityId?:string): Promise<Response> {
  if (!env.DM_ATTACHMENTS) return jsonError(503, 'Attachment storage is not configured');
  if(!env.DM_ATTACHMENT_PROOF_SECRET || env.DM_ATTACHMENT_PROOF_SECRET.length<32)
    return jsonError(503,'Attachment signing is not configured');
  if (!validWriteOrigin(request, current)) return jsonError(403, 'Invalid upload origin');
  const clientId = request.headers.get('x-uorqui-client-id') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(clientId)) return jsonError(400, 'Invalid message id');
  const rawName = request.headers.get('x-uorqui-filename') ?? '';
  let name: string;
  try { name = decodeURIComponent(rawName); } catch { return jsonError(400, 'Invalid filename'); }
  if (!name || name.length > 180 || name !== name.trim() || /[\\/\r\n\u0000-\u001f]/.test(name)) return jsonError(400, 'Invalid filename');
  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!DM_TYPES.has(type)) return jsonError(415, 'Unsupported attachment type');
  const rawCaption=request.headers.get('x-uorqui-caption')??'';
  let caption='';
  try{caption=decodeURIComponent(rawCaption);}catch{return jsonError(400,'Invalid message caption');}
  if(caption.length>4000)return jsonError(400,'Invalid message caption');
  caption=caption.trim();
  const replyToId = request.headers.get('x-uorqui-reply-to-id');
  if (replyToId && !/^[0-9a-f-]{36}$/.test(replyToId)) return jsonError(400, 'Invalid reply');
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_DM_BYTES) return jsonError(413, 'Attachment exceeds 50 MB');

  try {
    const accessPath=communityId
      ?'/api/v1/communities/'+communityId+'/channels/'+conversationId+'/attachments/allowed'
      :'/api/v1/dm/conversations/'+conversationId+'/attachments/allowed';
    const auth = await callApi(request, origin, accessPath);
    if (!auth.ok) return jsonError(auth.status === 401 ? 401 : auth.status === 403 ? 403 : auth.status === 404 ? 404 : 503, 'Attachment upload not authorized');
  } catch { return jsonError(503, 'Attachment authentication unavailable'); }

  const bytes = await boundedBody(request, MAX_DM_BYTES);
  if (!bytes) return jsonError(413, 'Attachment must be between 1 byte and 50 MB');
  const signature = new Uint8Array(bytes.slice(0, 16));
  const magic = String.fromCharCode(...signature);
  if ((type === 'image/jpeg' || type === 'image/png' || type === 'image/webp') && !validImage(new Uint8Array(bytes), type) ||
      (type === 'image/gif' && !magic.startsWith('GIF8')) ||
      (type === 'application/pdf' && !magic.startsWith('%PDF-')) ||
      (type === 'application/zip' && !magic.startsWith('PK')) ||
      ((type === 'video/webm' || type === 'audio/webm') && !(signature[0] === 0x1a && signature[1] === 0x45 && signature[2] === 0xdf && signature[3] === 0xa3)) ||
      (type === 'audio/ogg' && !magic.startsWith('OggS')) ||
      (type === 'audio/wav' && !(magic.startsWith('RIFF') && magic.slice(8,12)==='WAVE')) ||
      (type === 'audio/mpeg' && !(magic.startsWith('ID3') || (signature[0]===0xff && (signature[1] & 0xe0)===0xe0))) ||
      ((type === 'video/mp4' || type === 'video/quicktime' || type === 'image/heic' || type === 'image/heif' || type === 'audio/mp4' || type === 'audio/x-m4a') && magic.slice(4, 8) !== 'ftyp')) return jsonError(415, 'Invalid attachment format');

  const attachmentId = crypto.randomUUID();
  const proofContent=JSON.stringify(communityId
    ?[communityId,conversationId,clientId,attachmentId,name,type,bytes.byteLength]
    :[conversationId,clientId,attachmentId,name,type,bytes.byteLength]);
  const hmacKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.DM_ATTACHMENT_PROOF_SECRET),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const proofSignature=await crypto.subtle.sign('HMAC',hmacKey,new TextEncoder().encode(proofContent));
  const proof=Array.from(new Uint8Array(proofSignature),byte=>byte.toString(16).padStart(2,'0')).join('');
  const key = (communityId?'community/'+communityId+'/'+conversationId:'dm/'+conversationId)+'/'+attachmentId;
  try { await env.DM_ATTACHMENTS.put(key, bytes, { httpMetadata: { contentType: type } }); }
  catch { return jsonError(503, 'Attachment storage unavailable'); }

  try {
    const destination=communityId
      ?'/api/v1/communities/'+communityId+'/channels/'+conversationId+'/messages'
      :'/api/v1/dm/conversations/'+conversationId+'/messages';
    const saved = await callApi(request, origin, destination,'POST',{
      body:caption,clientId,...(replyToId ? {replyToId} : {}),
      attachment:{id:attachmentId,name,type,size:bytes.byteLength},
    },{'x-uorqui-attachment-proof':proof});
    if (!saved.ok) {
      await env.DM_ATTACHMENTS.delete(key).catch(() => {});
      return jsonError(saved.status === 401 ? 401 : saved.status === 404 ? 404 : saved.status === 400 ? 400 : 503,
        'Could not attach file to a message');
    }
    const result = await saved.json() as {message?:{attachment?:{id?:string}};duplicate?:boolean};
    if (communityId?result.duplicate:result.message?.attachment?.id !== attachmentId) {
      // An idempotent retry might have already created the message with
      // the old object's UUID. Delete the duplicate upload.
      await env.DM_ATTACHMENTS.delete(key).catch(() => {});
    }
    return Response.json(result, { status:saved.status,headers:{'Cache-Control':'no-store'} });
  } catch {
    // The API may have committed the message before a network failure. Keep
    // its object so a retry with the same clientId can recover it; deleting
    // it here could permanently break a successfully sent attachment.
    return jsonError(503,'Could not confirm attachment message');
  }
}

async function handleDmDownload(request: Request, env: Env, origin: URL, conversationId: string, attachmentId: string, communityId?:string): Promise<Response> {
  if (!env.DM_ATTACHMENTS) return jsonError(503, 'Attachment storage is not configured');
  let access: { allowed?: boolean; name?: string; type?: string; size?: number };
  try {
    const accessPath=communityId
      ?'/api/v1/communities/'+communityId+'/channels/'+conversationId+'/attachments/'+attachmentId+'/access'
      :'/api/v1/dm/conversations/'+conversationId+'/attachments/'+attachmentId+'/access';
    const response = await callApi(request, origin, accessPath);
    if (!response.ok) return jsonError(response.status === 503 ? 503 : 404,'Attachment unavailable');
    access = await response.json() as typeof access;
    if (!access.allowed || !access.name || !access.type) return jsonError(404, 'Attachment unavailable');
  } catch { return jsonError(503,'Attachment authorization unavailable'); }
  try {
    const path=(communityId?'community/'+communityId+'/'+conversationId:'dm/'+conversationId)+'/'+attachmentId;
    const object = await env.DM_ATTACHMENTS.get(path,
      request.headers.has('range') ? {range:request.headers} : undefined);
    if (!object) return jsonError(404,'Attachment unavailable');
    const partial=!!request.headers.get('range') && !!object.range;
    const inline = access.type.startsWith('image/') || access.type.startsWith('video/') || access.type.startsWith('audio/') || access.type === 'application/pdf';
    const fallback = access.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120) || 'attachment';
    return new Response(request.method === 'HEAD' ? null : object.body,{
      status:partial ? 206 : 200,headers:{
        'content-type':access.type,
        'content-length':String(partial ? object.range!.length : object.size),
        'accept-ranges':'bytes',
        ...(partial ? {'content-range':'bytes '+object.range!.offset+'-'+(object.range!.offset+object.range!.length-1)+'/'+object.size} : {}),
        'content-disposition':(inline ? 'inline' : 'attachment') + '; filename="' + fallback + '"; filename*=UTF-8\'\'' + encodeURIComponent(access.name),
        'cache-control':'private, no-store',
        'x-content-type-options':'nosniff',
        'content-security-policy':"default-src 'none'; sandbox",
      },
    });
  } catch { return jsonError(503,'Attachment storage unavailable'); }
}



async function readCommunityImage(request: Request, env: Env, api: URL, match: RegExpExecArray): Promise<Response> {
  if (!env.PROFILE_MEDIA) return jsonError(503,'Media not configured');
  try {
    const auth=await callApi(request,api,'/api/v1/communities/'+match[1]+'/media/'+match[2]+'.'+match[3]+'/access');
    if(!auth.ok)return jsonError(auth.status===503?503:404,'Image unavailable');
    const obj=await env.PROFILE_MEDIA.get('media/community/'+match[1]+'/'+match[2]+'.'+match[3]);
    if(!obj)return jsonError(404,'Image unavailable');
    return new Response(request.method==='HEAD'?null:obj.body,{headers:{
      'content-type':obj.httpMetadata?.contentType??'application/octet-stream',
      'content-length':String(obj.size),'cache-control':'private, no-store',
      'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox",
    }});
  }catch{return jsonError(503,'Image unavailable');}
}
async function writeCommunityImage(request: Request,env: Env,current: URL,api: URL,id:string):Promise<Response>{
  if(!env.PROFILE_MEDIA)return jsonError(503,'Media not configured');
  if(!validWriteOrigin(request,current))return jsonError(403,'Invalid upload origin');
  let old:string|null=null;
  try {
    const auth=await callApi(request,api,'/api/v1/communities/'+id+'/media/upload-access');
    if(!auth.ok)return jsonError(auth.status===401?401:auth.status===403?403:503,'Community media upload unauthorized');
    old=(await auth.json() as {avatarUrl?:string|null}).avatarUrl??null;
  }catch{return jsonError(503,'Media permission unavailable');}
  if(request.method==='DELETE'){
    try{
      const update=await callApi(request,api,'/api/v1/communities/'+id,'PATCH',{avatarUrl:null});
      if(!update.ok)return jsonError(update.status,'Could not remove avatar');
      if(old?.startsWith('/media/community/'+id+'/'))await env.PROFILE_MEDIA.delete(old.slice(1)).catch(()=>{});
      return Response.json({url:null},{headers:{'cache-control':'no-store'}});
    }catch{return jsonError(503,'Could not remove avatar');}
  }
  const type=request.headers.get('content-type')?.split(';')[0]?.toLowerCase().trim()??'';
  const ext=TYPE_EXTENSION[type];if(!ext)return jsonError(415,'Only WebP, PNG and JPEG images supported');
  const bytes=await boundedBody(request,MAX_COMMUNITY_IMAGE_BYTES);
  if(!bytes)return jsonError(413,'Image too large');
  if(!validImage(new Uint8Array(bytes),type))return jsonError(415,'Invalid image');
  const url='/media/community/'+id+'/'+crypto.randomUUID()+'.'+ext;
  try {
    await env.PROFILE_MEDIA.put(url.slice(1),bytes,{httpMetadata:{contentType:type}});
    const update=await callApi(request,api,'/api/v1/communities/'+id,'PATCH',{avatarUrl:url});
    if(!update.ok){
      await env.PROFILE_MEDIA.delete(url.slice(1)).catch(()=>{});
      return jsonError(update.status,'Could not save community photo');
    }
    if(old?.startsWith('/media/community/'+id+'/'))await env.PROFILE_MEDIA.delete(old.slice(1)).catch(()=>{});
    return Response.json({url},{headers:{'cache-control':'no-store'}});
  }catch{
    await env.PROFILE_MEDIA.delete(url.slice(1)).catch(()=>{});
    return jsonError(503,'Community image upload unavailable');
  }
}
async function deleteCommunityWithImage(request:Request,env:Env,api:URL,id:string):Promise<Response>{
  try {
    const response=await callApi(request,api,'/api/v1/communities/'+id,'DELETE');
    if(!response.ok)return jsonError(response.status,'Community deletion denied');
    const data=await response.json() as {deleted:boolean;avatarUrl?:string|null};
    if(data.avatarUrl?.startsWith('/media/community/'+id+'/'))
      await env.PROFILE_MEDIA?.delete(data.avatarUrl.slice(1)).catch(()=>{});
    return Response.json({deleted:true},{headers:{'cache-control':'no-store'}});
  }catch{return jsonError(503,'Could not delete community');}
}

/**
 * Erase R2 objects for accounts already removed from PostgreSQL. Jobs were
 * inserted in the account-deletion transaction; failed batches remain pending
 * and are retried on the next scheduled invocation.
 */
async function gcRequest(env:Env,origin:URL,method:'GET'|'POST',path:string):Promise<Response>{
  const secret=env.DM_ATTACHMENT_PROOF_SECRET;
  if(!secret||secret.length<32)throw Error('Media cleanup signing not configured');
  const minute=Math.floor(Date.now()/60000);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const text='uorqui-r2-gc-v1\n'+method+'\n'+path+'\n'+minute;
  const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text));
  const signature=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  return fetch(new URL(path,origin),{
    method,headers:{'x-uorqui-gc-minute':String(minute),'x-uorqui-gc-signature':signature},
    cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(25000),
  });
}
async function flushAccountMediaCleanup(env:Env,origin:URL){
  if(!env.DM_ATTACHMENT_PROOF_SECRET)return;
  const response=await gcRequest(env,origin,'GET','/api/v1/internal/r2-gc');
  if(!response.ok)return;
  const result=await response.json() as {jobs?:{id:string;bucket:'PROFILE_MEDIA'|'DM_ATTACHMENTS';prefix:string}[]};
  for(const job of result.jobs??[]){
    if(!/^[a-f0-9-]{36}$/i.test(job.id) || !job.prefix || job.prefix.includes('..'))continue;
    const bucket=job.bucket==='PROFILE_MEDIA'?env.PROFILE_MEDIA:job.bucket==='DM_ATTACHMENTS'?env.DM_ATTACHMENTS:null;
    if(!bucket)continue;
    try{
      const listing=await bucket.list({prefix:job.prefix,limit:100});
      let allDeleted=true;
      for(let i=0;i<listing.objects.length;i+=15){
        const batch=await Promise.allSettled(listing.objects.slice(i,i+15).map(object=>bucket.delete(object.key)));
        if(batch.some(x=>x.status==='rejected'))allDeleted=false;
      }
      if(allDeleted&&!listing.truncated){
        const path='/api/v1/internal/r2-gc/'+job.id+'/complete';
        await gcRequest(env,origin,'POST',path);
      }
    }catch(error){
      console.warn('R2 account-erasure retry scheduled',error instanceof Error?error.name:'unknown');
    }
  }
}

export default {
  // Cron Trigger keeps Render's free instance warm without a browser session.
  // /health is lightweight and intentionally does not query Neon.
  async scheduled(_event: unknown, env: Env): Promise<void> {
    if (!env.API_ORIGIN) return;
    try {
      const origin = new URL(env.API_ORIGIN);
      // No untrusted URL inputs or redirects: the target comes from our Worker binding.
      if (origin.protocol !== 'https:' || origin.username || origin.password ||
          origin.pathname !== '/' || origin.search || origin.hash) return;
      const target = new URL('/health', origin);
      const response = await fetch(target, {
        method: 'GET',
        headers: { 'Accept': 'application/json', 'User-Agent': 'Uorqui-Worker-Keepalive/1.0' },
        cache: 'no-store',
        redirect: 'manual',
        signal: AbortSignal.timeout(25_000),
      });
      await response.body?.cancel().catch(() => {});
      if (!response.ok) console.warn('Uorqui API keepalive returned HTTP', response.status);
    } catch (error) {
      // Health checks are best-effort; a Render restart or deploy can interrupt one.
      console.warn('Uorqui API keepalive could not connect',
        error instanceof Error ? error.name : 'unknown error');
    }
    // Run durable media cleanup independently of user sessions.
    try{
      const origin=new URL(env.API_ORIGIN);
      if(origin.protocol==='https:'&&!origin.username&&!origin.password)
        await flushAccountMediaCleanup(env,origin);
    }catch(error){
      console.warn('Uorqui R2 cleanup unavailable',error instanceof Error?error.name:'unknown');
    }
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const current = new URL(request.url);
    const media = MEDIA_PATH.exec(current.pathname);
    const write = UPLOAD_PATH.exec(current.pathname);
    const communityImage=COMMUNITY_AVATAR_PATH.exec(current.pathname);
    const communityWrite=COMMUNITY_AVATAR_WRITE.exec(current.pathname);
    const communityDelete=COMMUNITY_DELETE_PATH.exec(current.pathname);
    const dmUpload = DM_UPLOAD_PATH.exec(current.pathname);
    const dmMedia = DM_MEDIA_PATH.exec(current.pathname);
    const communityAttachmentUpload=COMMUNITY_ATTACHMENT_UPLOAD.exec(current.pathname);
    const communityAttachmentRead=COMMUNITY_ATTACHMENT_READ.exec(current.pathname);
    // Worker Static Assets normalizes unknown navigations (sometimes 307 to '/').
    // Explicitly return the SPA entry on public profile URLs while retaining the
    // requested /@handle in the browser for React's route parser.
    const communityInviteNavigation = /^\/invite\/[0-9a-f-]{36}\/?$/i.test(current.pathname);
    const channelInviteNavigation = /^\/channel-invite\/?$/.test(current.pathname);
    const publicProfileNavigation = /^\/(?:@|%40)[a-z][a-z0-9_]{2,31}\/?$/i.test(current.pathname);
    const emailVerificationNavigation = /^\/auth\/email-verification\/?$/.test(current.pathname);
    const legalNavigation = /^\/(termos|terms|privacidade|privacy|cookies)\/?$/.test(current.pathname);
    // Always revalidate the SPA bootstrap document. A stale index.html can
    // reference deleted hashed JS bundles and leave the login as a blank page.
    const appEntryNavigation = current.pathname === '/' || current.pathname === '/index.html';
    if ((appEntryNavigation || publicProfileNavigation || communityInviteNavigation || channelInviteNavigation || emailVerificationNavigation || legalNavigation) && (request.method === 'GET' || request.method === 'HEAD')) {
      const response = await env.ASSETS.fetch(new Request(new URL('/index.html', current), {
        method: 'GET', headers: { accept: 'text/html' },
      }));
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      if(communityInviteNavigation||channelInviteNavigation)headers.set('Referrer-Policy','no-referrer');
      return new Response(response.body, { status: response.status, headers });
    }
    const apiPath = current.pathname.startsWith('/api/');
    const healthPath = current.pathname === '/health' || current.pathname.startsWith('/health/');

    if (!media && !write && !communityImage && !communityWrite && !communityDelete && !dmUpload && !dmMedia && !communityAttachmentUpload && !communityAttachmentRead && !apiPath && !healthPath) return jsonError(404, 'Not found');
    const origin = apiOrigin(env.API_ORIGIN, current);
    if (!origin) return jsonError(503, 'API unavailable');

    if(communityImage){
      if(!['GET','HEAD'].includes(request.method))return jsonError(405,'Method not allowed');
      return readCommunityImage(request,env,origin,communityImage);
    }
    if(communityWrite){
      if(!['POST','DELETE'].includes(request.method))return jsonError(405,'Method not allowed');
      return writeCommunityImage(request,env,current,origin,communityWrite[1]);
    }
    if(communityDelete){
      if(request.method!=='DELETE')return jsonError(405,'Method not allowed');
      if(!validWriteOrigin(request,current))return jsonError(403,'Invalid origin');
      return deleteCommunityWithImage(request,env,origin,communityDelete[1]);
    }
    if (media) {
      if (!['GET', 'HEAD'].includes(request.method)) return jsonError(405, 'Method not allowed');
      return handleMediaRead(request, env, origin, media);
    }
    if (dmMedia) {
      if (!['GET','HEAD'].includes(request.method)) return jsonError(405,'Method not allowed');
      return handleDmDownload(request,env,origin,dmMedia[1],dmMedia[2]);
    }
    if(communityAttachmentRead){
      if(!['GET','HEAD'].includes(request.method))return jsonError(405,'Method not allowed');
      return handleDmDownload(request,env,origin,communityAttachmentRead[2],communityAttachmentRead[3],communityAttachmentRead[1]);
    }
    if(communityAttachmentUpload){
      if(request.method!=='POST')return jsonError(405,'Method not allowed');
      return handleDmUpload(request,env,current,origin,communityAttachmentUpload[2],communityAttachmentUpload[1]);
    }
    if (dmUpload) {
      if (request.method !== 'POST') return jsonError(405,'Method not allowed');
      return handleDmUpload(request,env,current,origin,dmUpload[1]);
    }
    if (write) {
      if (!['POST', 'DELETE'].includes(request.method)) return jsonError(405, 'Method not allowed');
      return handleMediaWrite(request, env, current, origin, write[1] as 'avatar' | 'cover');
    }

    const dmCancel=DM_CANCEL_PATH.exec(current.pathname);
    if (dmCancel && request.method === 'DELETE') {
      try {
        const response=await callApi(request,origin,current.pathname,'DELETE');
        if(response.ok && env.DM_ATTACHMENTS){
          const data=await response.clone().json() as {attachmentId?:string|null};
          if(data.attachmentId && /^[0-9a-f-]{36}$/.test(data.attachmentId)){
            await env.DM_ATTACHMENTS.delete('dm/'+dmCancel[1]+'/'+data.attachmentId).catch(() => {});
          }
        }
        const headers=new Headers(response.headers);
        headers.set('cache-control','no-store');
        return new Response(response.body,{status:response.status,headers});
      }catch{return jsonError(502,'Could not cancel message');}
    }

    const upstream = new URL(current.pathname + current.search, origin);
    try {
      // These two endpoints are public and identical for all users. A short
      // edge cache prevents every login screen from hitting Render and Neon.
      // Never cache /api/v1/me or any personal, authenticated or error response.
      const publicProbe = request.method === 'GET' && !current.search &&
        (current.pathname === '/api/v1/status' || current.pathname === '/health/ready');
      const edgeCache = publicProbe
        ? (globalThis.caches as (CacheStorage & { default?: Cache }) | undefined)?.default : undefined;
      const cacheKey = publicProbe
        ? new Request(current.origin + current.pathname, { method: 'GET' }) : undefined;
      if (edgeCache && cacheKey) {
        const hit = await edgeCache.match(cacheKey).catch(() => undefined);
        if (hit) {
          const headers = new Headers(hit.headers);
          headers.set('cache-control', 'no-store');
          headers.set('x-uorqui-probe-cache', 'HIT');
          return new Response(hit.body, {status:hit.status,headers});
        }
      }
      const forwarded = new Request(upstream.toString(), request);
      forwarded.headers.delete('host');
      const response = await fetch(forwarded, { redirect: 'manual' });
      if (publicProbe && response.ok && !response.headers.has('set-cookie') && edgeCache && cacheKey) {
        const cached = response.clone();
        const storeHeaders = new Headers(cached.headers);
        storeHeaders.set('cache-control','public, max-age=15');
        await edgeCache.put(cacheKey, new Response(cached.body, {
          status:cached.status,headers:storeHeaders,
        })).catch(() => {});
      }
      const headers = new Headers(response.headers);
      headers.set('cache-control', 'no-store');
      if (publicProbe) headers.set('x-uorqui-probe-cache', 'MISS');
      // If this header is present on a 429 in DevTools, the block was returned
      // by the upstream API/provider rather than produced by this Worker.
      if (response.status === 429) headers.set('x-uorqui-upstream-429','1');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch { return jsonError(502, 'API unavailable'); }
  },
};
