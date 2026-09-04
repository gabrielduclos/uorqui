let googleTokenCache = { expires: 0, token: '' };

export async function enrichPrivateCommunityDiscovery(request, response, env) {
  if (!response?.ok || request.method.toUpperCase() !== 'GET') return response;
  const url = new URL(request.url);
  if (!['/api/discover', '/api/social/feed'].includes(url.pathname)) return response;

  const uid = authUidFromRequest(request);
  if (!uid) return response;

  const payload = await response.clone().json().catch(() => null);
  if (!payload || typeof payload !== 'object') return response;

  try {
    const [privateCommunities, memberships] = await Promise.all([
      fsWhere(env, 'communities', 'visibility', 'private', 80),
      fsWhere(env, 'communityMembers', 'uid', uid, 150)
    ]);
    const joinedIds = new Set(memberships.map(item => String(item.communityId || '')).filter(Boolean));
    const additions = privateCommunities
      .filter(community => !community.companyId)
      .filter(community => community.archived !== true)
      // Comunidades corporativas verificadas/invite-only continuam fora da
      // descoberta pública. Aqui entram apenas comunidades sociais privadas nas
      // quais qualquer usuário pode solicitar participação.
      .filter(community => !community.verifiedCompany && !community.inviteOnly)
      .map(community => ({
        id: community.id,
        companyId: '',
        name: community.name || 'Comunidade',
        description: community.description || '',
        visibility: 'private',
        memberCount: Number(community.memberCount || 0),
        createdBy: community.createdBy || '',
        avatarMediaId: community.avatarMediaId || '',
        alreadyMember: joinedIds.has(community.id),
        requestToJoin: true
      }));

    const merged = new Map();
    for (const community of Array.isArray(payload.communities) ? payload.communities : []) {
      if (community?.id) merged.set(community.id, community);
    }
    for (const community of additions) {
      if (!merged.has(community.id)) merged.set(community.id, community);
    }

    payload.communities = [...merged.values()]
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
      .slice(0, 40);

    return rewriteJson(response, payload);
  } catch (error) {
    console.warn('Private community discovery enrichment failed:', error?.message || error);
    return response;
  }
}

function authUidFromRequest(request) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return '';
  const parts = header.slice(7).split('.');
  if (parts.length !== 3) return '';
  try {
    const payload = JSON.parse(base64urlText(parts[1]));
    return String(payload?.sub || '').trim().slice(0, 180);
  } catch {
    return '';
  }
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
  if (!credentials.email || !credentials.privateKey) throw new Error('service credentials unavailable');

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
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
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
  if (!response.ok || !data.access_token) throw new Error('service auth unavailable');
  googleTokenCache = {
    token: data.access_token,
    expires: Date.now() + Number(data.expires_in || 3600) * 1000
  };
  return data.access_token;
}

async function fsWhere(env, collection, field, value, limit = 100) {
  const token = await getGoogleAccessToken(env);
  const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents:runQuery`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: 'EQUAL',
            value: toValue(value)
          }
        },
        limit
      }
    })
  });
  if (!response.ok) throw new Error('query unavailable');
  const rows = await response.json().catch(() => []);
  return (Array.isArray(rows) ? rows : [])
    .filter(row => row?.document)
    .map(row => fromDoc(row.document));
}

function fromDoc(document) {
  const id = String(document?.name || '').split('/').pop() || '';
  const result = { id };
  for (const [key, value] of Object.entries(document?.fields || {})) result[key] = fromValue(value);
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
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(fromValue);
  if ('mapValue' in value) {
    const result = {};
    for (const [key, child] of Object.entries(value.mapValue?.fields || {})) result[key] = fromValue(child);
    return result;
  }
  return null;
}

function toValue(value) {
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value)
    ? { integerValue: String(value) }
    : { doubleValue: value };
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

function base64urlText(value) {
  let text = String(value).replace(/-/g, '+').replace(/_/g, '/');
  while (text.length % 4) text += '=';
  const bytes = Uint8Array.from(atob(text), char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function rewriteJson(response, payload) {
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
