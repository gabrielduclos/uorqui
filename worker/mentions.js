import core, { RealtimeHub } from './index.js';

export { RealtimeHub };

let googleTokenCache = { expires: 0, token: '' };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const isPostCreate = method === 'POST' && url.pathname === '/api/posts';
    const isReplyCreate = method === 'POST' && /^\/api\/posts\/[^/]+\/comments$/.test(url.pathname);
    const isSolution = method === 'POST' && /^\/api\/posts\/[^/]+\/solution$/.test(url.pathname);

    if (isSolution) {
      const postId = decodeURIComponent(url.pathname.split('/')[3] || '');
      const post = postId ? await fsGet(env, 'posts', postId).catch(() => null) : null;
      if (post?.type === 'post') {
        return acceptRegularPostSolution(request, env, ctx, url, post);
      }
    }

    const bodyCopy = isPostCreate || isReplyCreate ? request.clone() : null;
    const response = await core.fetch(request, env, ctx);

    if (response.ok && bodyCopy) {
      const responseCopy = response.clone();
      const task = processMentions(bodyCopy, responseCopy, env, url, isReplyCreate)
        .catch(error => console.warn(JSON.stringify({ message: 'Falha ao processar menções', error: error?.message || String(error) })));
      if (ctx?.waitUntil) ctx.waitUntil(task);
      else await task;
    }

    return response;
  },

  async scheduled(controller, env, ctx) {
    if (typeof core.scheduled === 'function') return core.scheduled(controller, env, ctx);
  }
};

async function acceptRegularPostSolution(request, env, ctx, url, post) {
  const body = await request.clone().json().catch(() => ({}));
  const commentId = String(body?.commentId || '').trim().slice(0, 120);
  if (!commentId) return jsonResponse({ error: 'Resposta inválida.' }, 400);

  const comment = await fsGet(env, 'comments', commentId).catch(() => null);
  if (!comment || comment.postId !== post.id) return jsonResponse({ error: 'Resposta inválida.' }, 400);

  // Reutiliza a rota oficial de conclusão para validar token, acesso e papel do usuário.
  const resolveUrl = new URL(`/api/posts/${encodeURIComponent(post.id)}/resolve`, url.origin);
  const headers = new Headers(request.headers);
  headers.set('Content-Type', 'application/json');
  const authResponse = await core.fetch(new Request(resolveUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ resolved: true })
  }), env, ctx);

  if (!authResponse.ok) return authResponse;

  const updated = await fsGet(env, 'posts', post.id);
  if (!updated) return jsonResponse({ error: 'Publicação não encontrada.' }, 404);

  const now = new Date().toISOString();
  await fsBatchPut(env, [{
    collection: 'posts',
    id: post.id,
    data: {
      ...updated,
      acceptedCommentId: comment.id,
      isResolved: true,
      resolvedAt: updated.resolvedAt || now,
      followUpReminderFor: updated.lastCommentAt || updated.followUpReminderFor || '',
      updatedAt: now
    }
  }]);

  return jsonResponse({ ok: true, isResolved: true, acceptedCommentId: comment.id }, 200, authResponse.headers);
}

async function processMentions(request, response, env, url, isReply) {
  const body = await request.json().catch(() => ({}));
  const text = String(body?.text || '');
  const mentionKeys = extractMentionKeys(text);
  if (!mentionKeys.length) return;

  const actor = actorFromAuthorization(request.headers.get('Authorization') || '');
  if (!actor.uid) return;

  let post = null;
  let commentId = '';

  if (isReply) {
    const postId = decodeURIComponent(url.pathname.split('/')[3] || '');
    if (!postId) return;
    post = await fsGet(env, 'posts', postId);
    const result = await response.json().catch(() => ({}));
    commentId = String(result?.comment?.id || '');
  } else {
    const result = await response.json().catch(() => ({}));
    post = result?.post || null;
  }

  if (!post?.id || !post.companyId || post.scope === 'world') return;

  const recipients = await resolveMentionRecipients(env, post, actor.uid, mentionKeys);
  if (!recipients.length) return;

  const actorProfile = await fsGet(env, 'users', actor.uid).catch(() => null);
  const actorName = actorProfile?.displayName || actor.name || 'Alguém';
  const createdAt = new Date().toISOString();
  const notificationDocs = recipients.map(member => ({
    collection: 'notifications',
    id: `mention_${post.id}_${commentId || 'post'}_${member.uid}_${crypto.randomUUID().replace(/-/g, '')}`,
    data: {
      recipientUid: member.uid,
      type: isReply ? 'comment_mention' : 'post_mention',
      title: `${actorName} mencionou você ${isReply ? 'em uma resposta' : 'em uma publicação'}`,
      body: text.replace(/\s+/g, ' ').trim().slice(0, 180),
      data: {
        postId: post.id,
        commentId,
        companyId: post.companyId || '',
        communityId: post.communityId || '',
        openComments: isReply ? 'true' : ''
      },
      read: false,
      persistent: false,
      status: 'new',
      createdAt
    }
  }));

  await fsBatchPut(env, notificationDocs);
  await Promise.allSettled(notificationDocs.map(doc => sendMentionPush(env, doc.data.recipientUid, doc.id, doc.data)));
}

function extractMentionKeys(text) {
  const keys = new Set();
  const regex = /(?:^|\s)@([A-Za-zÀ-ÿ0-9_.-]{2,80})/g;
  let match;
  while ((match = regex.exec(String(text || '')))) {
    const key = normalizeMentionKey(match[1]);
    if (key) keys.add(key);
  }
  return [...keys].slice(0, 12);
}

function normalizeMentionKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

function memberMentionKeys(member) {
  const name = String(member?.displayName || '').trim();
  const firstName = name.split(/\s+/)[0] || '';
  const emailLocal = String(member?.email || '').split('@')[0] || '';
  return new Set([
    normalizeMentionKey(name),
    normalizeMentionKey(firstName),
    normalizeMentionKey(emailLocal)
  ].filter(Boolean));
}

async function resolveMentionRecipients(env, post, actorUid, mentionKeys) {
  const companyMembers = (await fsWhere(env, 'companyMembers', 'companyId', post.companyId, 250))
    .filter(member => member.status === 'active' && member.uid && member.uid !== actorUid);

  let allowedUids = null;
  if (post.scope === 'community' && post.communityId) {
    const communityMembers = await fsWhere(env, 'communityMembers', 'communityId', post.communityId, 250);
    allowedUids = new Set(communityMembers.map(member => member.uid));
  }

  const matches = [];
  for (const key of mentionKeys) {
    const candidates = companyMembers.filter(member =>
      (!allowedUids || allowedUids.has(member.uid)) && memberMentionKeys(member).has(key)
    );
    // Nunca menciona a pessoa errada quando dois membros possuem o mesmo primeiro nome.
    if (candidates.length === 1) matches.push(candidates[0]);
  }

  return Array.from(new Map(matches.map(member => [member.uid, member])).values()).slice(0, 12);
}

function actorFromAuthorization(header) {
  if (!header.startsWith('Bearer ')) return { uid: '', name: '' };
  try {
    const parts = header.slice(7).split('.');
    if (parts.length !== 3) return { uid: '', name: '' };
    const payload = JSON.parse(base64urlText(parts[1]));
    return { uid: String(payload.sub || ''), name: String(payload.name || '') };
  } catch {
    return { uid: '', name: '' };
  }
}

async function sendMentionPush(env, uid, notificationId, notification) {
  if (!uid || !env.FIREBASE_PROJECT_ID) return;
  const subscriptions = (await fsWhere(env, 'pushSubscriptions', 'uid', uid, 20))
    .filter(item => item.enabled !== false && item.token);
  if (!subscriptions.length) return;

  const accessToken = await getGoogleAccessToken(env);
  const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/messages:send`;
  const data = Object.fromEntries(Object.entries({
    notificationId,
    type: notification.type || '',
    postId: notification.data?.postId || '',
    commentId: notification.data?.commentId || '',
    companyId: notification.data?.companyId || '',
    communityId: notification.data?.communityId || '',
    openComments: notification.data?.openComments || '',
    url: `/?post=${encodeURIComponent(notification.data?.postId || '')}&company=${encodeURIComponent(notification.data?.companyId || '')}${notification.data?.openComments ? '&comments=1' : ''}${notification.data?.commentId ? `&comment=${encodeURIComponent(notification.data.commentId)}` : ''}`
  }).map(([key, value]) => [key, String(value || '')]));

  await Promise.allSettled(subscriptions.map(async subscription => {
    const result = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: subscription.token,
          notification: { title: notification.title, body: notification.body },
          data,
          webpush: { headers: { Urgency: 'high' } }
        }
      })
    });
    if (!result.ok) console.warn(JSON.stringify({ message: 'Push de menção recusado', status: result.status }));
  }));
}

async function getGoogleAccessToken(env) {
  if (googleTokenCache.token && googleTokenCache.expires > Date.now() + 60000) return googleTokenCache.token;
  if (!env.FIREBASE_SERVICE_ACCOUNT_EMAIL || !env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY) throw new Error('Service Account não configurada.');

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
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error('Não foi possível autenticar no Firebase.');
  googleTokenCache = { token: result.access_token, expires: Date.now() + Number(result.expires_in || 3600) * 1000 };
  return googleTokenCache.token;
}

async function importPrivateKey(pem) {
  const clean = String(pem)
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const bytes = Uint8Array.from(atob(clean), char => char.charCodeAt(0));
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
  if (!response.ok) throw new Error(`Firestore: ${data?.error?.message || response.statusText}`);
  return data;
}

async function fsGet(env, collection, docId) {
  const doc = await fsRequest(env, `/documents/${encPath(collection)}/${encodeURIComponent(docId)}`);
  return doc ? fromDoc(doc) : null;
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

async function fsBatchPut(env, docs) {
  if (!docs.length) return;
  const project = encodeURIComponent(env.FIREBASE_PROJECT_ID);
  const prefix = `projects/${project}/databases/(default)/documents/`;
  const writes = docs.map(doc => ({
    update: {
      name: `${prefix}${encPath(doc.collection)}/${encodeURIComponent(doc.id)}`,
      fields: toFields({ ...doc.data, id: doc.data.id || doc.id })
    }
  }));
  await fsRequest(env, '/documents:commit', { method: 'POST', body: JSON.stringify({ writes }) });
}

function jsonResponse(payload, status = 200, sourceHeaders) {
  const headers = new Headers(sourceHeaders || {});
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(payload), { status, headers });
}

function fromDoc(doc) {
  const value = fromFields(doc.fields || {});
  value.id = value.id || decodeURIComponent(doc.name.split('/').pop());
  return value;
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

function encPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function b64urlJson(object) {
  return b64url(new TextEncoder().encode(JSON.stringify(object)));
}

function b64url(bytes) {
  let output = '';
  for (const byte of bytes) output += String.fromCharCode(byte);
  return btoa(output).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlText(value) {
  let normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) normalized += '=';
  return new TextDecoder().decode(Uint8Array.from(atob(normalized), char => char.charCodeAt(0)));
}
