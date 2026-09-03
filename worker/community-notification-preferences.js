const FIREBASE_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwksCache = { expires: 0, keys: [] };
let googleTokenCache = { expires: 0, token: '' };

export async function handleCommunityNotificationPreferenceRequest(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/communities\/([^/]+)\/notification-preference\/?$/i);
  if (!match) return null;

  const method = String(request.method || 'GET').toUpperCase();
  if (!['GET', 'PUT'].includes(method)) {
    return json({ error: 'Método não permitido.' }, 405);
  }

  try {
    const identity = await requireAuth(request, env);
    const communityId = decodeURIComponent(match[1]);
    const memberId = `${communityId}_${identity.uid}`;
    const membership = await fsGet(env, 'communityMembers', memberId);

    if (!membership) {
      return json({ error: 'Você precisa participar da comunidade para alterar esta preferência.' }, 403);
    }

    if (method === 'GET') {
      return json({
        communityId,
        notifyNewPosts: membership.notifyNewPosts === true
      });
    }

    const body = await request.json().catch(() => ({}));
    const notifyNewPosts = body?.notifyNewPosts === true;
    const now = new Date().toISOString();
    await fsPatchPreference(env, memberId, notifyNewPosts, now);

    console.info('Uorqui community notification preference updated', {
      communityId,
      uid: identity.uid,
      notifyNewPosts
    });

    return json({ communityId, notifyNewPosts, updatedAt: now });
  } catch (error) {
    return json({ error: error?.message || 'Não foi possível atualizar a preferência.' }, Number(error?.status || 500));
  }
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
  if (!valid) throw httpError(401, 'Assinatura inválida.');

  const now = Math.floor(Date.now() / 1000);
  if (
    payload.aud !== projectId ||
    payload.iss !== `https://securetoken.google.com/${projectId}` ||
    !payload.sub ||
    Number(payload.exp || 0) <= now ||
    Number(payload.iat || 0) > now + 60
  ) {
    throw httpError(401, 'Token expirado ou inválido.');
  }

  return { uid: payload.sub };
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
  const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(input));
  const assertion = `${input}.${b64url(new Uint8Array(sig))}`;
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw httpError(503, 'Não foi possível autenticar no Firestore.');

  googleTokenCache = {
    token: data.access_token,
    expires: Date.now() + Number(data.expires_in || 3600) * 1000
  };
  return data.access_token;
}

async function fsGet(env, collection, docId) {
  const token = await getGoogleAccessToken(env);
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (response.status === 404) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(500, body?.error?.message || 'Falha ao consultar Firestore.');
  return {
    id: docId,
    notifyNewPosts: body?.fields?.notifyNewPosts?.booleanValue === true
  };
}

async function fsPatchPreference(env, memberId, notifyNewPosts, updatedAt) {
  const token = await getGoogleAccessToken(env);
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/communityMembers/${encodeURIComponent(memberId)}`;
  const query = '?updateMask.fieldPaths=notifyNewPosts&updateMask.fieldPaths=notificationPreferenceUpdatedAt';
  const response = await fetch(`${base}${query}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fields: {
        notifyNewPosts: { booleanValue: notifyNewPosts },
        notificationPreferenceUpdatedAt: { timestampValue: updatedAt }
      }
    })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw httpError(500, body?.error?.message || 'Falha ao salvar preferência.');
  }
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

function b64urlJson(value) { return b64url(new TextEncoder().encode(JSON.stringify(value))); }
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
function base64urlText(value) { return new TextDecoder().decode(base64urlBytes(value)); }
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
