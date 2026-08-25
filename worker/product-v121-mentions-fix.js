import core, { RealtimeHub } from './product-v121-media.js';

export { RealtimeHub };

let googleTokenCache = { expires: 0, token: '' };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method.toUpperCase() === 'GET' && url.pathname === '/api/mentions') {
      try {
        return await searchMentionUsers(request, env, ctx, url);
      } catch (error) {
        console.error('Mention search:', error);
        return json({ error: error?.message || 'Não foi possível buscar usuários.' }, error?.status || 500);
      }
    }
    return core.fetch(request, env, ctx);
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

    const memberships = await fsWhere(env, 'communityMembers', 'communityId', communityId, 300);
    allowedUids = new Set(memberships.map(item => item.uid).filter(Boolean));

    // Administradores têm acesso à comunidade mesmo quando não existe um
    // documento de membership explícito. Mantém esses usuários pesquisáveis.
    for (const member of await fsWhere(env, 'companyMembers', 'companyId', companyId, 300)) {
      if (member.status === 'active' && ['owner', 'admin'].includes(member.role) && member.uid) {
        allowedUids.add(member.uid);
      }
    }
  }

  const members = (await fsWhere(env, 'companyMembers', 'companyId', companyId, 300))
    .filter(member => member.status === 'active' && member.uid && (!allowedUids || allowedUids.has(member.uid)));

  const query = normalizeSearch(url.searchParams.get('q') || '');
  const prepared = members.map(member => {
    const originalName = clean(member.displayName || member.email || 'Usuário', 120);
    const displayName = firstAndLastName(originalName);
    const email = clean(member.email || '', 180);
    const fullKey = mentionKey(originalName);
    const firstNameKey = mentionKey(originalName.split(/\s+/)[0] || '');
    const emailKey = mentionKey(email.split('@')[0] || '');
    const handle = emailKey || fullKey || firstNameKey;
    return {
      uid: member.uid,
      displayName,
      email,
      handle,
      haystack: normalizeSearch(`${displayName} ${originalName} ${email} ${handle}`)
    };
  });

  const results = prepared
    .filter(item => item.handle && (!query || item.haystack.includes(query)))
    .sort((a, b) => {
      const aStarts = query && a.haystack.startsWith(query) ? 0 : 1;
      const bStarts = query && b.haystack.startsWith(query) ? 0 : 1;
      return aStarts - bStarts || a.displayName.localeCompare(b.displayName, 'pt-BR');
    })
    .slice(0, 10)
    .map(({ haystack, ...item }) => item);

  return json({ users: results });
}

function firstAndLastName(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Usuário';
  if (parts.length === 1) return parts[0];
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
  url.search = `?companyId=${encodeURIComponent(companyId)}`;
  return core.fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }), env, ctx);
}

async function getGoogleAccessToken(env) {
  if (googleTokenCache.token && googleTokenCache.expires > Date.now() + 60000) return googleTokenCache.token;
  if (!env.FIREBASE_SERVICE_ACCOUNT_EMAIL || !env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw httpError(503, 'Service Account do Firebase não configurada.');
  }

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
  const form = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw httpError(503, 'Não foi possível autenticar no Firebase.');
  googleTokenCache = {
    token: result.access_token,
    expires: Date.now() + Number(result.expires_in || 3600) * 1000
  };
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
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw httpError(500, `Firestore: ${data?.error?.message || response.statusText}`);
  return data;
}

async function fsWhere(env, collection, field, value, limit = 100) {
  const body = {
    structuredQuery: {
      from: [{ collectionId: collection }],
      where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: toValue(value) } },
      limit
    }
  };
  const rows = await fsRequest(env, '/documents:runQuery', { method: 'POST', body: JSON.stringify(body) });
  return (Array.isArray(rows) ? rows : []).filter(row => row.document).map(row => fromDoc(row.document));
}

function fromDoc(doc) {
  const value = fromFields(doc.fields || {});
  value.id = value.id || decodeURIComponent(doc.name.split('/').pop());
  return value;
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
function toValue(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: String(value ?? '') };
}
function b64urlJson(value) { return b64url(new TextEncoder().encode(JSON.stringify(value))); }
function b64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function clean(value, max = 500) { return String(value ?? '').trim().slice(0, max); }
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
