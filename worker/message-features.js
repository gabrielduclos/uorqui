const FIREBASE_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwksCache = { expires: 0, keys: [] };
let googleTokenCache = { expires: 0, token: '' };

export async function handleMessageFeaturesRequest(request, env, next) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  const reactionMatch = url.pathname.match(/^\/api\/messages\/([^/]+)\/([^/]+)\/reaction$/);
  if (reactionMatch && method === 'POST') {
    const targetUid = decodeURIComponent(reactionMatch[1]);
    const messageId = decodeURIComponent(reactionMatch[2]);
    return handleMessageReaction(request, env, targetUid, messageId);
  }

  const sendMatch = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
  if (!sendMatch || method !== 'POST') return null;

  let body = null;
  try {
    body = await request.clone().json();
  } catch {
    return next(request);
  }

  const replyToMessageId = clean(body?.replyToMessageId || '', 160);
  if (!replyToMessageId) return next(request);

  const targetUid = decodeURIComponent(sendMatch[1]);
  let identity;
  let repliedMessage;
  try {
    identity = await requireAuth(request, env);
    repliedMessage = await fsGet(env, 'directMessages', replyToMessageId);
    assertMessageParticipant(repliedMessage, identity.uid, targetUid);
  } catch (error) {
    return json({ error: error?.message || 'Não foi possível responder esta mensagem.' }, Number(error?.status || 500));
  }

  const response = await next(request);
  if (!response.ok) return response;

  try {
    const payload = await response.clone().json();
    const sentMessage = payload?.message;
    if (!sentMessage?.id) return response;

    const replyTo = replySummary(repliedMessage);
    const stored = await fsGet(env, 'directMessages', sentMessage.id);
    if (!stored) return response;

    const updated = {
      ...stored,
      replyToMessageId,
      replyTo,
      updatedAt: new Date().toISOString()
    };
    await fsPut(env, 'directMessages', sentMessage.id, updated);

    return responseFromJson({
      ...payload,
      message: {
        ...sentMessage,
        replyToMessageId,
        replyTo
      }
    }, response);
  } catch (error) {
    console.warn('Uorqui message reply enrichment failed:', error?.message || error);
    return response;
  }
}

async function handleMessageReaction(request, env, targetUid, messageId) {
  try {
    const identity = await requireAuth(request, env);
    const message = await fsGet(env, 'directMessages', messageId);
    assertMessageParticipant(message, identity.uid, targetUid);

    const likedBy = Array.isArray(message.likedBy)
      ? Array.from(new Set(message.likedBy.map(value => String(value || '')).filter(Boolean)))
      : [];
    const alreadyLiked = likedBy.includes(identity.uid);
    const nextLikedBy = alreadyLiked
      ? likedBy.filter(uid => uid !== identity.uid)
      : [...likedBy, identity.uid];

    const updated = {
      ...message,
      likedBy: nextLikedBy,
      updatedAt: new Date().toISOString()
    };
    await fsPut(env, 'directMessages', messageId, updated);

    return json({
      ok: true,
      liked: !alreadyLiked,
      likeCount: nextLikedBy.length,
      likedBy: nextLikedBy,
      message: updated
    });
  } catch (error) {
    return json({ error: error?.message || 'Não foi possível reagir à mensagem.' }, Number(error?.status || 500));
  }
}

function assertMessageParticipant(message, uid, targetUid) {
  if (!message) throw httpError(404, 'Mensagem não encontrada.');
  const conversationId = directConversationId(uid, targetUid);
  if (String(message.conversationId || '') !== conversationId) {
    throw httpError(403, 'Esta mensagem não pertence a esta conversa.');
  }
  const participants = new Set([String(message.senderUid || ''), String(message.recipientUid || '')]);
  if (!participants.has(uid) || !participants.has(targetUid)) {
    throw httpError(403, 'Você não pode alterar esta mensagem.');
  }
}

function replySummary(message) {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  const firstAttachment = attachments[0] || null;
  const rawText = clean(message?.text || '', 240);
  let text = rawText;
  if (!text && firstAttachment) {
    const type = String(firstAttachment.contentType || '');
    text = type.startsWith('audio/')
      ? 'Mensagem de áudio'
      : type.startsWith('image/')
        ? 'Foto'
        : type.startsWith('video/')
          ? 'Vídeo'
          : 'Arquivo';
  }
  if (!text && message?.sharedPost) text = 'Publicação compartilhada';
  if (!text) text = 'Mensagem';
  return {
    id: String(message?.id || ''),
    senderUid: String(message?.senderUid || ''),
    text,
    cancelledAt: message?.cancelledAt || ''
  };
}

function directConversationId(a, b) {
  return [String(a || ''), String(b || '')].sort().join('__');
}

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

async function requireAuth(request, env) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) throw httpError(401, 'Faça login para continuar.');
  return verifyFirebaseToken(header.slice(7), env.FIREBASE_PROJECT_ID);
}

async function verifyFirebaseToken(token, projectId) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw httpError(401, 'Token inválido.');
  let header;
  let payload;
  try {
    header = JSON.parse(base64urlText(parts[0]));
    payload = JSON.parse(base64urlText(parts[1]));
  } catch {
    throw httpError(401, 'Token inválido.');
  }
  if (header.alg !== 'RS256' || !header.kid) throw httpError(401, 'Token inválido.');

  const keys = await getFirebaseJwks();
  const jwk = keys.find(key => key.kid === header.kid);
  if (!jwk) throw httpError(401, 'Chave de autenticação inválida.');

  const key = await crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['verify']
  );
  const valid = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' }, key,
    base64urlBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!valid) throw httpError(401, 'Assinatura inválida.');

  const now = Math.floor(Date.now() / 1000);
  if (
    payload.aud !== projectId ||
    payload.iss !== `https://securetoken.google.com/${projectId}` ||
    !payload.sub ||
    Number(payload.exp || 0) <= now ||
    Number(payload.iat || 0) > now + 60
  ) throw httpError(401, 'Token expirado ou inválido.');

  return { uid: payload.sub, email: payload.email || '', name: payload.name || '' };
}

async function getFirebaseJwks() {
  if (jwksCache.expires > Date.now() && jwksCache.keys.length) return jwksCache.keys;
  const response = await fetch(FIREBASE_JWKS);
  if (!response.ok) throw httpError(503, 'Serviço de autenticação indisponível.');
  const body = await response.json();
  const maxAge = Number((response.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 3600);
  jwksCache = { keys: body.keys || [], expires: Date.now() + maxAge * 1000 };
  return jwksCache.keys;
}

function firebaseServiceAccount(env) {
  let email = String(env.FIREBASE_SERVICE_ACCOUNT_EMAIL || '').trim();
  let privateKey = String(env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY || '').trim();
  for (const candidate of [privateKey, email]) {
    const value = String(candidate || '').trim();
    if (!value.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(value);
      email = String(parsed.client_email || email || '').trim();
      privateKey = String(parsed.private_key || privateKey || '').trim();
      if (email && privateKey.includes('BEGIN PRIVATE KEY')) break;
    } catch {}
  }
  return { email, privateKey };
}

async function getGoogleAccessToken(env) {
  if (googleTokenCache.token && googleTokenCache.expires > Date.now() + 60000) return googleTokenCache.token;
  const credentials = firebaseServiceAccount(env);
  if (!credentials.email || !credentials.privateKey) throw httpError(503, 'Service Account do Firebase incompleta no Worker.');

  const now = Math.floor(Date.now() / 1000);
  const header = b64urlJson({ alg: 'RS256', typ: 'JWT' });
  const claims = b64urlJson({
    iss: credentials.email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  });
  const input = `${header}.${claims}`;
  const key = await importPrivateKey(credentials.privateKey);
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' }, key,
    new TextEncoder().encode(input)
  );
  const assertion = `${input}.${b64url(new Uint8Array(signature))}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw httpError(503, 'Não foi possível autenticar no Firestore.');

  googleTokenCache = {
    token: data.access_token,
    expires: Date.now() + Number(data.expires_in || 3600) * 1000
  };
  return data.access_token;
}

async function fsRequest(env, path, init = {}) {
  const token = await getGoogleAccessToken(env);
  const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)${path}`;
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(endpoint, { ...init, headers });
  if (response.status === 404) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const status = response.status === 429 ? 429 : response.status === 403 ? 403 : 500;
    throw httpError(status, body?.error?.message || 'Falha ao consultar Firestore.');
  }
  return body;
}

async function fsGet(env, collection, docId) {
  if (!collection || !docId) return null;
  const document = await fsRequest(env, `/documents/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`);
  return document ? fromDoc(document) : null;
}

async function fsPut(env, collection, docId, value) {
  const fields = {};
  for (const [key, item] of Object.entries(value || {})) fields[key] = toValue(item);
  const document = await fsRequest(env, `/documents/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields })
  });
  return document ? fromDoc(document) : null;
}

function fromDoc(document) {
  const name = String(document?.name || '');
  const id = name.split('/').pop() || '';
  const result = { id };
  for (const [key, value] of Object.entries(document?.fields || {})) result[key] = fromValue(value);
  if (!result.createdAt && document?.createTime) result.createdAt = document.createTime;
  if (!result.updatedAt && document?.updateTime) result.updatedAt = document.updateTime;
  return result;
}

function fromValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('integerValue' in value) return Number(value.integerValue || 0);
  if ('doubleValue' in value) return Number(value.doubleValue || 0);
  if ('timestampValue' in value) return value.timestampValue;
  if ('referenceValue' in value) return value.referenceValue;
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(fromValue);
  if ('mapValue' in value) {
    const result = {};
    for (const [key, child] of Object.entries(value.mapValue?.fields || {})) result[key] = fromValue(child);
    return result;
  }
  return null;
}

function toValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value)
    ? { integerValue: String(value) }
    : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (typeof value === 'object') {
    const fields = {};
    for (const [key, item] of Object.entries(value)) fields[key] = toValue(item);
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

async function importPrivateKey(pem) {
  const cleaned = String(pem)
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const bytes = Uint8Array.from(atob(cleaned), char => char.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8', bytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
}

function b64urlJson(value) {
  return b64url(new TextEncoder().encode(JSON.stringify(value)));
}
function b64url(bytes) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64urlBytes(value) {
  let text = String(value).replace(/-/g, '+').replace(/_/g, '/');
  while (text.length % 4) text += '=';
  return Uint8Array.from(atob(text), char => char.charCodeAt(0));
}
function base64urlText(value) {
  return new TextDecoder().decode(base64urlBytes(value));
}
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}
function responseFromJson(value, original) {
  const headers = new Headers(original.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.delete('content-length');
  return new Response(JSON.stringify(value), {
    status: original.status,
    statusText: original.statusText,
    headers
  });
}
