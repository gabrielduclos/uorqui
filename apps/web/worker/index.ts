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
}

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
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
