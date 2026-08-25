import core, { RealtimeHub } from './product-v121.js';

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

      if (method === 'GET' && /^\/api\/cep\/\d{8}$/.test(url.pathname)) {
        return await lookupCep(request, env, ctx, url.pathname.split('/').pop() || '');
      }

      if (method === 'GET' && /^\/api\/cnpj\/\d{14}$/.test(url.pathname)) {
        return await lookupCnpj(request, env, ctx, url.pathname.split('/').pop() || '');
      }

      if (method === 'PATCH' && /^\/api\/posts\/[^/]+$/.test(url.pathname)) {
        const postId = decodeURIComponent(url.pathname.split('/')[3] || '');
        return await editOwnPost(request, env, ctx, postId);
      }

      if (method === 'POST' && url.pathname === '/api/invites/accept') {
        const body = await request.clone().json().catch(() => ({}));
        const invite = await findInviteFromAcceptBody(env, body).catch(() => null);
        const response = await core.fetch(request, env, ctx);

        if (response.ok && invite?.type === 'company' && invite.invitedBy) {
          const payload = await response.clone().json().catch(() => ({}));
          if (payload?.companyId) {
            defer(ctx, ensureInviterAcceptedNotification(request, env, ctx, invite, payload.companyId));
          }
        }

        return response;
      }

      return core.fetch(request, env, ctx);
    } catch (error) {
      console.error('Uorqui v1.2.21 enhancements:', error);
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

  const fullKeyCounts = new Map();
  for (const member of members) {
    const key = mentionKey(member.displayName || '');
    if (key) fullKeyCounts.set(key, (fullKeyCounts.get(key) || 0) + 1);
  }

  const query = normalizeSearch(url.searchParams.get('q') || '');
  const results = members
    .map(member => {
      const displayName = clean(member.displayName || member.email || 'Usuário', 120);
      const email = clean(member.email || '', 180);
      const fullKey = mentionKey(displayName);
      const emailKey = mentionKey(email.split('@')[0] || '');
      const handle = fullKey && fullKeyCounts.get(fullKey) === 1 ? fullKey : emailKey || fullKey;
      return {
        uid: member.uid,
        displayName,
        email,
        handle,
        haystack: normalizeSearch(`${displayName} ${email} ${handle}`)
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

async function lookupCep(request, env, ctx, cep) {
  const authResponse = await coreBootstrap(request, env, ctx, '');
  if (!authResponse.ok) return authResponse;

  const response = await fetch(`https://viacep.com.br/ws/${encodeURIComponent(cep)}/json/`, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw httpError(502, 'Não foi possível consultar o CEP agora.');
  const result = await response.json();
  if (result?.erro) throw httpError(404, 'CEP não encontrado.');

  return json({
    postalCode: clean(result.cep || cep, 10),
    street: clean(result.logradouro || '', 160),
    complement: clean(result.complemento || '', 100),
    district: clean(result.bairro || '', 100),
    city: clean(result.localidade || '', 100),
    state: clean(result.uf || '', 2).toUpperCase()
  });
}

async function lookupCnpj(request, env, ctx, cnpj) {
  const authResponse = await coreBootstrap(request, env, ctx, '');
  if (!authResponse.ok) return authResponse;

  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${encodeURIComponent(cnpj)}`, {
    headers: { Accept: 'application/json' }
  });
  if (response.status === 404) throw httpError(404, 'CNPJ não encontrado.');
  if (!response.ok) throw httpError(502, 'Não foi possível consultar o CNPJ agora.');
  const result = await response.json();

  const streetType = clean(result.descricao_tipo_de_logradouro || '', 40);
  const streetName = clean(result.logradouro || '', 140);
  const street = clean([streetType, streetName].filter(Boolean).join(' '), 160);
  const postalDigits = String(result.cep || '').replace(/\D/g, '').slice(0, 8);
  const postalCode = postalDigits.length === 8
    ? `${postalDigits.slice(0, 5)}-${postalDigits.slice(5)}`
    : clean(result.cep || '', 10);

  return json({
    name: clean(result.nome_fantasia || result.razao_social || '', 120),
    legalName: clean(result.razao_social || '', 180),
    cnpj: clean(result.cnpj || cnpj, 18),
    postalCode,
    street,
    number: clean(result.numero || '', 30),
    complement: clean(result.complemento || '', 100),
    district: clean(result.bairro || '', 100),
    city: clean(result.municipio || '', 100),
    state: clean(result.uf || '', 2).toUpperCase()
  });
}

async function editOwnPost(request, env, ctx, postId) {
  if (!postId) throw httpError(400, 'Publicação inválida.');
  const post = await fsGet(env, 'posts', postId);
  if (!post) throw httpError(404, 'Publicação não encontrada.');
  if (post.scope === 'world') throw httpError(409, 'Publicações antigas do Mundo não podem ser editadas enquanto o recurso estiver desativado.');
  if (!post.companyId) throw httpError(400, 'Esta publicação não está vinculada a uma empresa.');
  if (post.deletedByAdmin) throw httpError(410, 'Esta publicação foi removida pela administração.');

  const bootstrapResponse = await coreBootstrap(request, env, ctx, post.companyId);
  if (!bootstrapResponse.ok) return bootstrapResponse;
  const bootstrap = await bootstrapResponse.json();
  if (!bootstrap.me?.uid || bootstrap.me.uid !== post.authorUid) {
    throw httpError(403, 'Somente quem publicou pode editar esta publicação.');
  }

  const body = await request.json().catch(() => ({}));
  const updated = { ...post };
  const text = clean(body.text, 5000);

  if (post.type === 'event') {
    const title = clean(body.title, 180);
    if (!title) throw httpError(400, 'Informe o nome do evento.');
    updated.title = title;
    updated.text = text;
    updated.eventLocation = clean(body.eventLocation || '', 240);
    updated.eventStart = validIso(body.eventStart) || post.eventStart || '';
    updated.eventEnd = body.eventEnd ? validIso(body.eventEnd) : '';
    if (!updated.eventStart) throw httpError(400, 'Informe a data de início do evento.');
  } else if (post.type === 'announcement') {
    const title = clean(body.title, 180);
    if (!title) throw httpError(400, 'Informe o título do comunicado.');
    if (!text) throw httpError(400, 'Escreva o comunicado.');
    updated.title = title;
    updated.text = text;
  } else {
    if (!text) throw httpError(400, post.type === 'poll' ? 'Escreva a pergunta da enquete.' : 'Escreva a publicação.');
    updated.text = text;
  }

  const editedAt = new Date().toISOString();
  updated.editedAt = editedAt;
  updated.editedByUid = bootstrap.me.uid;
  updated.updatedAt = editedAt;

  await fsPut(env, 'posts', postId, updated);
  defer(ctx, broadcastCompany(env, post.companyId, 'post_edited'));
  return json({ ok: true, post: updated });
}

async function findInviteFromAcceptBody(env, body) {
  if (body?.inviteId) return fsGet(env, 'invites', clean(body.inviteId, 150));
  if (!body?.token) return null;
  const hash = await sha256(String(body.token));
  const invites = await fsWhere(env, 'invites', 'tokenHash', hash, 5);
  return invites[0] || null;
}

async function ensureInviterAcceptedNotification(request, env, ctx, invite, companyId) {
  await delay(180);
  const bootstrapResponse = await coreBootstrap(request, env, ctx, companyId);
  if (!bootstrapResponse.ok) return;
  const bootstrap = await bootstrapResponse.json().catch(() => ({}));
  const acceptedUid = bootstrap.me?.uid || invite.acceptedBy || '';
  const inviterUid = invite.invitedBy || '';
  if (!acceptedUid || !inviterUid || acceptedUid === inviterUid) return;

  const company = await fsGet(env, 'companies', companyId).catch(() => null);
  const acceptedUser = await fsGet(env, 'users', acceptedUid).catch(() => null);
  const memberName = acceptedUser?.displayName || bootstrap.me?.displayName || acceptedUser?.email || bootstrap.me?.email || 'O usuário';
  const companyName = company?.name || invite.companyName || 'sua empresa';
  const notificationId = `member_joined_${invite.id}_${inviterUid}`;
  const existing = await fsGet(env, 'notifications', notificationId).catch(() => null);
  const createdAt = existing?.createdAt || new Date().toISOString();
  const notification = {
    ...(existing || {}),
    id: notificationId,
    recipientUid: inviterUid,
    type: 'company_member_joined',
    title: `${memberName} aceitou seu convite para ${companyName}`,
    body: 'O convite foi aceito e o colaborador já faz parte da empresa.',
    data: {
      ...(existing?.data || {}),
      companyId,
      memberUid: acceptedUid,
      targetView: 'admin'
    },
    read: false,
    status: 'new',
    createdAt,
    updatedAt: new Date().toISOString()
  };

  await fsPut(env, 'notifications', notificationId, notification);
  if (!existing) {
    defer(ctx, sendPushToUser(env, inviterUid, {
      title: notification.title,
      body: notification.body,
      notificationId,
      type: notification.type,
      companyId,
      memberUid: acceptedUid,
      targetView: 'admin',
      url: `/?admin=1&company=${encodeURIComponent(companyId)}`
    }));
  }
}

async function coreBootstrap(request, env, ctx, companyId) {
  const url = new URL(request.url);
  url.pathname = '/api/bootstrap';
  url.search = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
  return core.fetch(new Request(url.toString(), {
    method: 'GET',
    headers: request.headers
  }), env, ctx);
}

async function broadcastCompany(env, companyId, event) {
  if (!env.REALTIME || !companyId) return;
  try {
    const stub = env.REALTIME.get(env.REALTIME.idFromName(`company:${companyId}`));
    await stub.broadcast({ type: 'refresh', event });
  } catch (error) {
    console.warn('Realtime enhancement broadcast:', error?.message || error);
  }
}

async function sendPushToUser(env, uid, payload) {
  if (!uid || !env.FIREBASE_PROJECT_ID) return;
  const subscriptions = (await fsWhere(env, 'pushSubscriptions', 'uid', uid, 20))
    .filter(item => item.enabled !== false && item.token);
  if (!subscriptions.length) return;

  const accessToken = await getGoogleAccessToken(env);
  const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/messages:send`;
  const data = Object.fromEntries(Object.entries(payload || {}).map(([key, value]) => [key, String(value ?? '')]));

  await Promise.allSettled(subscriptions.map(subscription => fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: subscription.token,
        notification: { title: payload.title || 'Uorqui', body: payload.body || 'Você tem uma nova atualização.' },
        data,
        webpush: { headers: { Urgency: 'high' } }
      }
    })
  })));
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
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  });
  const input = `${header}.${claims}`;
  const key = await importPrivateKey(env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY);
  const signature = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(input));
  const assertion = `${input}.${b64url(new Uint8Array(signature))}`;
  const form = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form
  });
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
  const document = await fsRequest(env, `/documents/${encPath(collection)}/${encodeURIComponent(docId)}`);
  return document ? fromDoc(document) : null;
}

async function fsPut(env, collection, docId, object) {
  const document = await fsRequest(env, `/documents/${encPath(collection)}/${encodeURIComponent(docId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: toFields({ ...object, id: object.id || docId }) })
  });
  return fromDoc(document);
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
  const object = fromFields(doc.fields || {});
  object.id = object.id || decodeURIComponent(doc.name.split('/').pop());
  return object;
}

function toFields(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined).map(([key, value]) => [key, toValue(value)]));
}

function toValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (typeof value === 'object') return { mapValue: { fields: toFields(value) } };
  return { stringValue: String(value) };
}

function fromFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromValue(value)]));
}

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

function validIso(value) {
  if (!value) return '';
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
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

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function b64urlJson(object) {
  return b64url(new TextEncoder().encode(JSON.stringify(object)));
}

function b64url(bytes) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function clean(value, max = 5000) {
  return String(value ?? '').trim().slice(0, max);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function defer(ctx, promise) {
  const task = Promise.resolve(promise).catch(error => console.warn('Uorqui enhancement async:', error?.message || error));
  if (ctx?.waitUntil) ctx.waitUntil(task);
  return task;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
