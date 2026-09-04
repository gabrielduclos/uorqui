const FIREBASE_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwksCache = { expires: 0, keys: [] };

export async function handleMessageRealtimeRequest(request, env) {
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname === '/api/message-realtime/ticket') {
    try {
      const identity = await requireAuth(request, env);
      const stub = userRealtimeStub(env, identity.uid);
      const ticket = await stub.createTicket(identity.uid);
      return json({ ...ticket, uid: identity.uid });
    } catch (error) {
      return json({ error: publicError(error) }, Number(error?.status || 500));
    }
  }

  if (
    request.method === 'GET' &&
    url.pathname === '/api/message-realtime' &&
    request.headers.get('Upgrade')?.toLowerCase() === 'websocket'
  ) {
    const uid = clean(url.searchParams.get('uid') || '', 180);
    const ticket = clean(url.searchParams.get('ticket') || '', 220);
    if (!uid || !ticket) return json({ error: 'Não foi possível conectar agora.' }, 400);

    try {
      const stub = userRealtimeStub(env, uid);
      const target = new URL('https://uorqui-message-realtime.internal/connect');
      target.searchParams.set('ticket', ticket);
      return stub.fetch(new Request(target, {
        method: 'GET',
        headers: request.headers
      }));
    } catch (error) {
      console.warn('Message realtime socket failed:', error?.message || error);
      return json({ error: 'Não foi possível conectar agora.' }, 503);
    }
  }

  return null;
}

export function scheduleMessageRealtimeBroadcast(request, response, env, ctx) {
  if (!response?.ok || !env?.REALTIME) return;
  const task = broadcastMessageRealtime(request, env).catch(error => {
    console.warn('Message realtime broadcast failed:', error?.message || error);
  });
  if (ctx?.waitUntil) ctx.waitUntil(task);
}

async function broadcastMessageRealtime(request, env) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const path = url.pathname;
  let targetUid = '';
  let event = '';
  let notifyCurrentUser = true;

  let match = path.match(/^\/api\/messages\/([^/]+)$/);
  if (match && method === 'POST') {
    targetUid = decodeURIComponent(match[1]);
    event = 'message';
  } else if (match && method === 'GET') {
    targetUid = decodeURIComponent(match[1]);
    event = 'message_read';
    notifyCurrentUser = false;
  } else {
    match = path.match(/^\/api\/messages\/([^/]+)\/[^/]+\/reaction$/);
    if (match && method === 'POST') {
      targetUid = decodeURIComponent(match[1]);
      event = 'message_reaction';
    } else {
      match = path.match(/^\/api\/messages\/([^/]+)\/[^/]+$/);
      if (match && method === 'DELETE') {
        targetUid = decodeURIComponent(match[1]);
        event = 'message_cancelled';
      } else {
        match = path.match(/^\/api\/messages\/([^/]+)\/(?:accept|request)$/);
        if (match && (method === 'POST' || method === 'DELETE')) {
          targetUid = decodeURIComponent(match[1]);
          event = 'message_conversation';
        }
      }
    }
  }

  if (!targetUid || !event) return;

  const currentUid = authUidFromRequest(request);
  if (!currentUid) return;

  const recipients = new Set([targetUid]);
  if (notifyCurrentUser) recipients.add(currentUid);

  await Promise.allSettled([...recipients].map(async uid => {
    if (!uid) return;
    const stub = userRealtimeStub(env, uid);
    await stub.broadcast({
      type: 'refresh',
      event,
      peerUid: uid === currentUid ? targetUid : currentUid
    });
  }));
}

function userRealtimeStub(env, uid) {
  if (!env?.REALTIME) throw httpError(503, 'Tempo real indisponível.');
  return env.REALTIME.get(env.REALTIME.idFromName(`user:${uid}`));
}

function authUidFromRequest(request) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return '';
  const parts = header.slice(7).split('.');
  if (parts.length !== 3) return '';
  try {
    const payload = JSON.parse(base64urlText(parts[1]));
    return clean(payload?.sub || '', 180);
  } catch {
    return '';
  }
}

async function requireAuth(request, env) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) throw httpError(401, 'Faça login para continuar.');
  return verifyFirebaseToken(header.slice(7), env.FIREBASE_PROJECT_ID);
}

async function verifyFirebaseToken(token, projectId) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw httpError(401, 'Sessão inválida.');

  let header;
  let payload;
  try {
    header = JSON.parse(base64urlText(parts[0]));
    payload = JSON.parse(base64urlText(parts[1]));
  } catch {
    throw httpError(401, 'Sessão inválida.');
  }

  if (header.alg !== 'RS256' || !header.kid) throw httpError(401, 'Sessão inválida.');
  const keys = await getFirebaseJwks();
  const jwk = keys.find(key => key.kid === header.kid);
  if (!jwk) throw httpError(401, 'Sessão inválida.');

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const valid = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    base64urlBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!valid) throw httpError(401, 'Sessão inválida.');

  const now = Math.floor(Date.now() / 1000);
  if (
    payload.aud !== projectId ||
    payload.iss !== `https://securetoken.google.com/${projectId}` ||
    !payload.sub ||
    Number(payload.exp || 0) <= now ||
    Number(payload.iat || 0) > now + 60
  ) throw httpError(401, 'Sessão expirada.');

  return { uid: payload.sub };
}

async function getFirebaseJwks() {
  if (jwksCache.expires > Date.now() && jwksCache.keys.length) return jwksCache.keys;
  const response = await fetch(FIREBASE_JWKS);
  if (!response.ok) throw httpError(503, 'Serviço temporariamente indisponível.');
  const body = await response.json().catch(() => ({}));
  const maxAge = Number((response.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 3600);
  jwksCache = { keys: body.keys || [], expires: Date.now() + maxAge * 1000 };
  return jwksCache.keys;
}

function publicError(error) {
  const status = Number(error?.status || 500);
  if (status === 401) return 'Faça login novamente para continuar.';
  if (status === 403) return 'Você não tem acesso a esta ação.';
  return 'Não foi possível concluir agora. Tente novamente.';
}

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
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
