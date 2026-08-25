import core, { RealtimeHub } from './product-v121-enhancements.js';

export { RealtimeHub };

let googleTokenCache = { expires: 0, token: '' };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    try {
      if (method === 'GET' && url.pathname === '/api/mentions') {
        return await searchMentionUsers(request, env, ctx, url);
      }

      if (method === 'PATCH' && /^\/api\/communities\/[^/]+$/.test(url.pathname)) {
        const body = await request.clone().json().catch(() => ({}));
        if (Object.prototype.hasOwnProperty.call(body, 'name') || Object.prototype.hasOwnProperty.call(body, 'description')) {
          const communityId = decodeURIComponent(url.pathname.split('/')[3] || '');
          return await updateCommunityMetadata(request, env, ctx, communityId, body);
        }
      }

      if (method === 'POST' && url.pathname === '/api/media/upload') {
        const contentType = String(request.headers.get('content-type') || '').toLowerCase();
        const length = Number(request.headers.get('content-length') || 0);
        if (contentType.startsWith('video/')) {
          const allowed = ['video/mp4', 'video/webm', 'video/quicktime'];
          if (!allowed.includes(contentType.split(';')[0])) {
            return json({ error: 'Use vídeo MP4, WebM ou MOV.' }, 415);
          }
          if (length > 20 * 1024 * 1024) {
            return json({ error: 'O vídeo precisa ter no máximo 20 MB depois da otimização.' }, 413);
          }
        }
      }

      return core.fetch(request, env, ctx);
    } catch (error) {
      console.error('Uorqui v1.2.21 media/community:', error);
      return json({ error: error?.message || 'Não foi possível concluir esta ação.' }, error?.status || 500);
    }
  },

  async scheduled(controller, env, ctx) {
    if (typeof core.scheduled === 'function') return core.scheduled(controller, env, ctx);
  }
};

async function searchMentionUsers(request, env, ctx, url) {
  const companyId = clean(url.searchParams.get('companyId'), 150);
  if (!companyId) throw httpError(400, 'Empresa inválida.');

  const bootstrapResponse = await coreBootstrap(request, env, ctx, companyId);
  if (!bootstrapResponse.ok) return bootstrapResponse;
  const bootstrap = await bootstrapResponse.json();
  if (bootstrap.selectedCompanyId !== companyId || !bootstrap.me?.uid) {
    throw httpError(403, 'Você não tem acesso a esta empresa.');
  }

  const communityId = clean(url.searchParams.get('communityId'), 150);
  let allowedUids = null;
  if (communityId) {
    const visibleCommunity = Boolean(bootstrap.canAdmin) ||
      (bootstrap.communities || []).some(item => item.id === communityId) ||
      (bootstrap.allCompanyCommunities || []).some(item => item.id === communityId && item.visibility === 'public');
    if (!visibleCommunity) throw httpError(403, 'Você não tem acesso a esta comunidade.');
    const memberships = await fsWhere(env, 'communityMembers', 'communityId', communityId, 250);
    allowedUids = new Set(memberships.map(item => item.uid).filter(Boolean));
  }

  const members = (await fsWhere(env, 'companyMembers', 'companyId', companyId, 250))
    .filter(member => member.status === 'active' && member.uid && (!allowedUids || allowedUids.has(member.uid)));

  const aliasCounts = new Map();
  const prepared = members.map(member => {
    const originalName = clean(member.displayName || member.email || 'Usuário', 120);
    const displayName = firstAndLastName(originalName);
    const email = clean(member.email || '', 180);
    const fullKey = mentionKey(originalName);
    const firstLastKey = mentionKey(displayName);
    const emailKey = mentionKey(email.split('@')[0] || '');
    const firstNameKey = mentionKey(originalName.split(/\s+/)[0] || '');
    const directlyResolvable = new Set([fullKey, firstNameKey, emailKey].filter(Boolean));
    const preferred = directlyResolvable.has(firstLastKey) ? firstLastKey : emailKey || fullKey || firstLastKey;
    if (preferred) aliasCounts.set(preferred, (aliasCounts.get(preferred) || 0) + 1);
    return { member, originalName, displayName, email, fullKey, firstLastKey, emailKey, preferred };
  });

  const query = normalizeSearch(url.searchParams.get('q') || '');
  const results = prepared
    .map(item => {
      let handle = item.preferred;
      if (!handle || aliasCounts.get(handle) !== 1) handle = item.emailKey || item.fullKey || item.firstLastKey;
      const haystack = normalizeSearch(`${item.displayName} ${item.originalName} ${item.email} ${handle}`);
      return {
        uid: item.member.uid,
        displayName: item.displayName,
        email: item.email,
        handle,
        haystack
      };
    })
    .filter(item => item.handle && (!query || item.haystack.includes(query)))
    .sort((a, b) => {
      const aStart = query && a.haystack.startsWith(query) ? 0 : 1;
      const bStart = query && b.haystack.startsWith(query) ? 0 : 1;
      return aStart - bStart || a.displayName.localeCompare(b.displayName, 'pt-BR');
    })
    .slice(0, 8)
    .map(({ haystack, ...item }) => item);

  return json({ users: results });
}

async function updateCommunityMetadata(request, env, ctx, communityId, body) {
  if (!communityId) throw httpError(400, 'Comunidade inválida.');
  const community = await fsGet(env, 'communities', communityId);
  if (!community) throw httpError(404, 'Comunidade não encontrada.');

  const bootstrapResponse = await coreBootstrap(request, env, ctx, community.companyId);
  if (!bootstrapResponse.ok) return bootstrapResponse;
  const bootstrap = await bootstrapResponse.json();
  if (bootstrap.selectedCompanyId !== community.companyId || !bootstrap.canAdmin) {
    throw httpError(403, 'Somente administradores podem editar a comunidade.');
  }

  const name = Object.prototype.hasOwnProperty.call(body, 'name')
    ? clean(body.name, 90)
    : community.name;
  const description = Object.prototype.hasOwnProperty.call(body, 'description')
    ? clean(body.description || '', 280)
    : community.description || '';
  if (!name) throw httpError(400, 'Informe o nome da comunidade.');

  const visibility = body.visibility === 'public' || body.visibility === 'private'
    ? body.visibility
    : community.visibility === 'public' ? 'public' : 'private';
  const updatedAt = new Date().toISOString();
  const updated = {
    ...community,
    name,
    description,
    visibility,
    updatedAt,
    updatedBy: bootstrap.me?.uid || ''
  };
  await fsPut(env, 'communities', communityId, updated);
  defer(ctx, broadcastCompany(env, community.companyId, 'community_updated'));
  return json({ community: updated });
}

function firstAndLastName(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || 'Usuário';
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function mentionKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

async function coreBootstrap(request, env, ctx, companyId) {
  const url = new URL(request.url);
  url.pathname = '/api/bootstrap';
  url.search = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
  return core.fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }), env, ctx);
}

async function broadcastCompany(env, companyId, event) {
  if (!env.REALTIME || !companyId) return;
  try {
    const stub = env.REALTIME.get(env.REALTIME.idFromName(`company:${companyId}`));
    await stub.broadcast({ type: 'refresh', event });
  } catch (error) {
    console.warn('Community realtime:', error?.message || error);
  }
}

function defer(ctx, promise) {
  const task = Promise.resolve(promise).catch(() => {});
  if (ctx?.waitUntil) ctx.waitUntil(task);
  return task;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

async function getGoogleAccessToken(env) {
  if (googleTokenCache.token && googleTokenCache.expires > Date.now() + 60000) return googleTokenCache.token;
  if (!env.FIREBASE_SERVICE_ACCOUNT_EMAIL || !env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY) throw httpError(503, 'Service Account do Firebase não configurada.');
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlJson({ alg: 'RS256', typ: 'JWT' });
  const claims = b64urlJson({
    iss: env.FIREBASE_SERVICE_ACCOUNT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  });
  const input = `${header}.${claims}`;
  const key = await importPrivateKey(env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY);
  const signature = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(input));
  const assertion = `${input}.${b64url(new Uint8Array(signature))}`;
  const form = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth2:grant-type:jwt-bearer', assertion });
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw httpError(503, 'Não foi possível autenticar no Firebase.');
  googleTokenCache = { token: result.access_token, expires: Date.now() + Number(result.expires_in || 3600) * 1000 };
  return googleTokenCache.token;
}

async function importPrivateKey(pem) {
  const cleaned = String(pem)
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const bytes = Uint8Array.from(atob(cleaned), char => char.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', bytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

function fsBase(env) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)`;
}

async function fsRequest(env, path, options = {}) {
  const token = await getGoogleAccessToken(env);
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${fsBase(env)}${path}`, { ...options, headers });
  if (response.status === 404) return null;
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw httpError(500, `Firestore: ${data?.error?.message || response.statusText}`);
  return data;
}

async function fsGet(env, collection, docId) {
  const doc = await fsRequest(env, `/documents/${encPath(collection)}/${encodeURIComponent(docId)}`);
  return doc ? fromDoc(doc) : null;
}

async function fsPut(env, collection, docId, object) {
  const doc = await fsRequest(env, `/documents/${encPath(collection)}/${encodeURIComponent(docId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: toFields({ ...object, id: object.id || docId }) })
  });
  return fromDoc(doc);
}

async function fsWhere(env, collection, field, value, limit = 100) {
  const body = { structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: toValue(value) } }, limit } };
  const rows = await fsRequest(env, '/documents:runQuery', { method: 'POST', body: JSON.stringify(body) });
  return (Array.isArray(rows) ? rows : []).filter(row => row.document).map(row => fromDoc(row.document));
}

function encPath(value) { return String(value).split('/').map(encodeURIComponent).join('/'); }
function fromDoc(doc) { const value = fromFields(doc.fields || {}); value.id = value.id || decodeURIComponent(doc.name.split('/').pop()); return value; }
function toFields(object) { return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined).map(([key, value]) => [key, toValue(value)])); }
function toValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (typeof value === 'object') return { mapValue: { fields: toFields(value) } };
  return { stringValue: String(value) };
}
function fromFields(fields) { return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromValue(value)])); }
function fromValue(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromValue);
  if ('mapValue' in value) return fromFields(value.mapValue.fields || {});
  return null;
}
function b64urlJson(value) { return b64url(new TextEncoder().encode(JSON.stringify(value))); }
function b64url(bytes) { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
