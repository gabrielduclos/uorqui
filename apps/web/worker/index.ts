interface ProfileMediaObject {
  body: ReadableStream;
  size: number;
  httpMetadata?: { contentType?: string };
}
interface ProfileMediaBucket {
  put(key: string, body: ArrayBuffer, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  get(key: string): Promise<ProfileMediaObject | null>;
  delete(key: string): Promise<void>;
}
interface Env {
  API_ORIGIN?: string;
  PROFILE_MEDIA?: ProfileMediaBucket;
  DM_ATTACHMENTS?: ProfileMediaBucket;
  ASSETS: { fetch(input: Request | URL | string): Promise<Response> };
}

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_DM_BYTES = 20 * 1024 * 1024;
const DM_UPLOAD_PATH = /^\/api\/media\/dm\/([0-9a-f-]{36})$/;
const DM_MEDIA_PATH = /^\/media\/dm\/([0-9a-f-]{36})\/([0-9a-f-]{36})$/;
const DM_CANCEL_PATH = /^\/api\/v1\/dm\/conversations\/([0-9a-f-]{36})\/messages\/([0-9a-f-]{36})$/;
const DM_TYPES = new Set(['image/webp','image/jpeg','image/png','image/gif','video/mp4','video/webm','application/pdf','text/plain','application/zip','application/octet-stream']);
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

async function callApi(request: Request, origin: URL, path: string, method: 'GET' | 'PATCH' | 'POST' | 'DELETE' = 'GET', body?: object): Promise<Response> {
  const headers = apiHeaders(request);
  if (body) headers.set('content-type', 'application/json');
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
async function handleDmUpload(request: Request, env: Env, current: URL, origin: URL, conversationId: string): Promise<Response> {
  if (!env.DM_ATTACHMENTS) return jsonError(503, 'Attachment storage is not configured');
  if (!validWriteOrigin(request, current)) return jsonError(403, 'Invalid upload origin');
  const clientId = request.headers.get('x-uorqui-client-id') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(clientId)) return jsonError(400, 'Invalid message id');
  const rawName = request.headers.get('x-uorqui-filename') ?? '';
  let name: string;
  try { name = decodeURIComponent(rawName); } catch { return jsonError(400, 'Invalid filename'); }
  if (!name || name.length > 180 || name !== name.trim() || /[\\/\r\n\u0000-\u001f]/.test(name)) return jsonError(400, 'Invalid filename');
  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!DM_TYPES.has(type)) return jsonError(415, 'Unsupported attachment type');
  const replyToId = request.headers.get('x-uorqui-reply-to-id');
  if (replyToId && !/^[0-9a-f-]{36}$/.test(replyToId)) return jsonError(400, 'Invalid reply');
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_DM_BYTES) return jsonError(413, 'Attachment exceeds 20 MB');

  try {
    const auth = await callApi(request, origin, '/api/v1/dm/conversations/' + conversationId + '/attachments/allowed');
    if (!auth.ok) return jsonError(auth.status === 401 ? 401 : auth.status === 404 ? 404 : 503, 'Attachment upload not authorized');
  } catch { return jsonError(503, 'Attachment authentication unavailable'); }

  const bytes = await boundedBody(request, MAX_DM_BYTES);
  if (!bytes) return jsonError(413, 'Attachment must be between 1 byte and 20 MB');
  const signature = new Uint8Array(bytes.slice(0, 16));
  const magic = String.fromCharCode(...signature);
  if ((type === 'image/jpeg' || type === 'image/png' || type === 'image/webp') && !validImage(new Uint8Array(bytes), type) ||
      (type === 'image/gif' && !magic.startsWith('GIF8')) ||
      (type === 'application/pdf' && !magic.startsWith('%PDF-')) ||
      (type === 'application/zip' && !magic.startsWith('PK')) ||
      (type === 'video/webm' && !(signature[0] === 0x1a && signature[1] === 0x45 && signature[2] === 0xdf && signature[3] === 0xa3)) ||
      (type === 'video/mp4' && magic.slice(4, 8) !== 'ftyp')) return jsonError(415, 'Invalid attachment format');

  const attachmentId = crypto.randomUUID();
  const key = 'dm/' + conversationId + '/' + attachmentId;
  try { await env.DM_ATTACHMENTS.put(key, bytes, { httpMetadata: { contentType: type } }); }
  catch { return jsonError(503, 'Attachment storage unavailable'); }

  try {
    const saved = await callApi(request, origin, '/api/v1/dm/conversations/' + conversationId + '/messages','POST',{
      body:'',clientId,...(replyToId ? {replyToId} : {}),
      attachment:{id:attachmentId,name,type,size:bytes.byteLength},
    });
    if (!saved.ok) {
      await env.DM_ATTACHMENTS.delete(key).catch(() => {});
      return jsonError(saved.status === 401 ? 401 : saved.status === 404 ? 404 : saved.status === 400 ? 400 : 503,
        'Could not attach file to a message');
    }
    const result = await saved.json() as {message?:{attachment?:{id?:string}}};
    if (result.message?.attachment?.id !== attachmentId) {
      // An idempotent retry might have already created the message with
      // the old object's UUID. Delete the duplicate upload.
      await env.DM_ATTACHMENTS.delete(key).catch(() => {});
    }
    return Response.json(result, { status:saved.status,headers:{'Cache-Control':'no-store'} });
  } catch {
    await env.DM_ATTACHMENTS.delete(key).catch(() => {});
    return jsonError(503,'Could not send attachment');
  }
}

async function handleDmDownload(request: Request, env: Env, origin: URL, conversationId: string, attachmentId: string): Promise<Response> {
  if (!env.DM_ATTACHMENTS) return jsonError(503, 'Attachment storage is not configured');
  let access: { allowed?: boolean; name?: string; type?: string; size?: number };
  try {
    const response = await callApi(request, origin,
      '/api/v1/dm/conversations/' + conversationId + '/attachments/' + attachmentId + '/access');
    if (!response.ok) return jsonError(response.status === 503 ? 503 : 404,'Attachment unavailable');
    access = await response.json() as typeof access;
    if (!access.allowed || !access.name || !access.type) return jsonError(404, 'Attachment unavailable');
  } catch { return jsonError(503,'Attachment authorization unavailable'); }
  try {
    const object = await env.DM_ATTACHMENTS.get('dm/' + conversationId + '/' + attachmentId);
    if (!object) return jsonError(404,'Attachment unavailable');
    const inline = access.type.startsWith('image/') || access.type.startsWith('video/') || access.type === 'application/pdf';
    const fallback = access.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120) || 'attachment';
    return new Response(request.method === 'HEAD' ? null : object.body,{
      status:200,headers:{
        'content-type':access.type,
        'content-length':String(object.size),
        'content-disposition':(inline ? 'inline' : 'attachment') + '; filename="' + fallback + '"; filename*=UTF-8\'\'' + encodeURIComponent(access.name),
        'cache-control':'private, no-store',
        'x-content-type-options':'nosniff',
        'content-security-policy':"default-src 'none'; sandbox",
      },
    });
  } catch { return jsonError(503,'Attachment storage unavailable'); }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const current = new URL(request.url);
    const media = MEDIA_PATH.exec(current.pathname);
    const write = UPLOAD_PATH.exec(current.pathname);
    const dmUpload = DM_UPLOAD_PATH.exec(current.pathname);
    const dmMedia = DM_MEDIA_PATH.exec(current.pathname);
    // Worker Static Assets normalizes unknown navigations (sometimes 307 to '/').
    // Explicitly return the SPA entry on public profile URLs while retaining the
    // requested /@handle in the browser for React's route parser.
    const publicProfileNavigation = /^\/(?:@|%40)[a-z][a-z0-9_]{2,31}\/?$/i.test(current.pathname);
    const emailVerificationNavigation = /^\/auth\/email-verification\/?$/.test(current.pathname);
    if ((publicProfileNavigation || emailVerificationNavigation) && (request.method === 'GET' || request.method === 'HEAD')) {
      const response = await env.ASSETS.fetch(new Request(new URL('/index.html', current), {
        method: 'GET', headers: { accept: 'text/html' },
      }));
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      return new Response(response.body, { status: response.status, headers });
    }
    const apiPath = current.pathname.startsWith('/api/');
    const healthPath = current.pathname === '/health' || current.pathname.startsWith('/health/');

    if (!media && !write && !dmUpload && !dmMedia && !apiPath && !healthPath) return jsonError(404, 'Not found');
    const origin = apiOrigin(env.API_ORIGIN, current);
    if (!origin) return jsonError(503, 'API unavailable');

    if (media) {
      if (!['GET', 'HEAD'].includes(request.method)) return jsonError(405, 'Method not allowed');
      return handleMediaRead(request, env, origin, media);
    }
    if (dmMedia) {
      if (!['GET','HEAD'].includes(request.method)) return jsonError(405,'Method not allowed');
      return handleDmDownload(request,env,origin,dmMedia[1],dmMedia[2]);
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
      const forwarded = new Request(upstream.toString(), request);
      forwarded.headers.delete('host');
      const response = await fetch(forwarded, { redirect: 'manual' });
      const headers = new Headers(response.headers);
      headers.set('cache-control', 'no-store');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch { return jsonError(502, 'API unavailable'); }
  },
};
);
const DM_MEDIA_PATH = new RegExp('^/media/dm/(' + UUID + ')/(' + UUID + ')
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

async function callApi(request: Request, origin: URL, path: string, method: 'GET' | 'PATCH' = 'GET', body?: object): Promise<Response> {
  const headers = apiHeaders(request);
  if (body) headers.set('content-type', 'application/json');
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const current = new URL(request.url);
    const media = MEDIA_PATH.exec(current.pathname);
    const write = UPLOAD_PATH.exec(current.pathname);
    // Worker Static Assets normalizes unknown navigations (sometimes 307 to '/').
    // Explicitly return the SPA entry on public profile URLs while retaining the
    // requested /@handle in the browser for React's route parser.
    const publicProfileNavigation = /^\/(?:@|%40)[a-z][a-z0-9_]{2,31}\/?$/i.test(current.pathname);
    const emailVerificationNavigation = /^\/auth\/email-verification\/?$/.test(current.pathname);
    if ((publicProfileNavigation || emailVerificationNavigation) && (request.method === 'GET' || request.method === 'HEAD')) {
      const response = await env.ASSETS.fetch(new Request(new URL('/index.html', current), {
        method: 'GET', headers: { accept: 'text/html' },
      }));
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      return new Response(response.body, { status: response.status, headers });
    }
    const apiPath = current.pathname.startsWith('/api/');
    const healthPath = current.pathname === '/health' || current.pathname.startsWith('/health/');

    if (!media && !write && !apiPath && !healthPath) return jsonError(404, 'Not found');
    const origin = apiOrigin(env.API_ORIGIN, current);
    if (!origin) return jsonError(503, 'API unavailable');

    if (media) {
      if (!['GET', 'HEAD'].includes(request.method)) return jsonError(405, 'Method not allowed');
      return handleMediaRead(request, env, origin, media);
    }
    if (write) {
      if (!['POST', 'DELETE'].includes(request.method)) return jsonError(405, 'Method not allowed');
      return handleMediaWrite(request, env, current, origin, write[1] as 'avatar' | 'cover');
    }

    const upstream = new URL(current.pathname + current.search, origin);
    try {
      const forwarded = new Request(upstream.toString(), request);
      forwarded.headers.delete('host');
      const response = await fetch(forwarded, { redirect: 'manual' });
      const headers = new Headers(response.headers);
      headers.set('cache-control', 'no-store');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch { return jsonError(502, 'API unavailable'); }
  },
};
);
const DM_TYPES = new Set(['image/webp','image/jpeg','image/png','image/gif','video/mp4','video/webm','application/pdf','text/plain','application/zip','application/octet-stream']);
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

async function callApi(request: Request, origin: URL, path: string, method: 'GET' | 'PATCH' = 'GET', body?: object): Promise<Response> {
  const headers = apiHeaders(request);
  if (body) headers.set('content-type', 'application/json');
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const current = new URL(request.url);
    const media = MEDIA_PATH.exec(current.pathname);
    const write = UPLOAD_PATH.exec(current.pathname);
    // Worker Static Assets normalizes unknown navigations (sometimes 307 to '/').
    // Explicitly return the SPA entry on public profile URLs while retaining the
    // requested /@handle in the browser for React's route parser.
    const publicProfileNavigation = /^\/(?:@|%40)[a-z][a-z0-9_]{2,31}\/?$/i.test(current.pathname);
    const emailVerificationNavigation = /^\/auth\/email-verification\/?$/.test(current.pathname);
    if ((publicProfileNavigation || emailVerificationNavigation) && (request.method === 'GET' || request.method === 'HEAD')) {
      const response = await env.ASSETS.fetch(new Request(new URL('/index.html', current), {
        method: 'GET', headers: { accept: 'text/html' },
      }));
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      return new Response(response.body, { status: response.status, headers });
    }
    const apiPath = current.pathname.startsWith('/api/');
    const healthPath = current.pathname === '/health' || current.pathname.startsWith('/health/');

    if (!media && !write && !apiPath && !healthPath) return jsonError(404, 'Not found');
    const origin = apiOrigin(env.API_ORIGIN, current);
    if (!origin) return jsonError(503, 'API unavailable');

    if (media) {
      if (!['GET', 'HEAD'].includes(request.method)) return jsonError(405, 'Method not allowed');
      return handleMediaRead(request, env, origin, media);
    }
    if (write) {
      if (!['POST', 'DELETE'].includes(request.method)) return jsonError(405, 'Method not allowed');
      return handleMediaWrite(request, env, current, origin, write[1] as 'avatar' | 'cover');
    }

    const upstream = new URL(current.pathname + current.search, origin);
    try {
      const forwarded = new Request(upstream.toString(), request);
      forwarded.headers.delete('host');
      const response = await fetch(forwarded, { redirect: 'manual' });
      const headers = new Headers(response.headers);
      headers.set('cache-control', 'no-store');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch { return jsonError(502, 'API unavailable'); }
  },
};
