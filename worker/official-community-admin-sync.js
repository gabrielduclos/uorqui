const syncCache = new Map();
let googleTokenCache = { token: '', expires: 0 };
const SYNC_TTL = 30 * 60 * 1000;

export function scheduleOfficialCommunityAdminSync(request, response, env, ctx) {
  try {
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.pathname !== '/api/bootstrap' || !response?.ok) return;

    const uid = bearerUid(request);
    if (!uid || !superadminUids(env).has(uid)) return;

    const last = Number(syncCache.get(uid) || 0);
    if (Date.now() - last < SYNC_TTL) return;
    syncCache.set(uid, Date.now());

    const task = syncOfficialCommunityAdmin(env, uid).catch(error => {
      syncCache.delete(uid);
      console.warn('Uorqui official community bootstrap admin sync failed:', error?.message || error);
    });

    if (ctx?.waitUntil) ctx.waitUntil(task);
    else void task;
  } catch (error) {
    console.warn('Uorqui official community admin scheduling failed:', error?.message || error);
  }
}

async function syncOfficialCommunityAdmin(env, uid) {
  const token = await getGoogleAccessToken(env);
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const [communityResult, membershipResult] = await Promise.all([
    fetch(`${base}/documents:runQuery`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'communities' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'officialUorqui' },
              op: 'EQUAL',
              value: { booleanValue: true }
            }
          },
          limit: 100
        }
      })
    }),
    fetch(`${base}/documents:runQuery`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'communityMembers' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'uid' },
              op: 'EQUAL',
              value: { stringValue: uid }
            }
          },
          limit: 500
        }
      })
    })
  ]);

  if (!communityResult.ok) throw new Error(`Firestore official communities HTTP ${communityResult.status}`);
  if (!membershipResult.ok) throw new Error(`Firestore superadmin memberships HTTP ${membershipResult.status}`);

  const communitiesRows = await communityResult.json().catch(() => []);
  const membershipsRows = await membershipResult.json().catch(() => []);

  const communities = (Array.isArray(communitiesRows) ? communitiesRows : [])
    .map(row => row?.document)
    .filter(Boolean)
    .map(document => ({
      id: fieldString(document?.fields?.id) || documentId(document?.name),
      companyId: fieldString(document?.fields?.companyId),
      fields: document?.fields || {}
    }))
    .filter(item => item.id);

  if (!communities.length) return;

  const memberships = new Map();
  for (const row of Array.isArray(membershipsRows) ? membershipsRows : []) {
    const document = row?.document;
    if (!document) continue;
    const communityId = fieldString(document?.fields?.communityId);
    if (communityId) memberships.set(communityId, document);
  }

  const now = new Date().toISOString();
  const writes = [];

  for (const community of communities) {
    const existing = memberships.get(community.id);
    const existingFields = existing?.fields || {};
    const currentRole = fieldString(existingFields.role);
    if (currentRole === 'owner' || currentRole === 'admin') continue;

    const membershipId = `${community.id}_${uid}`;
    writes.push({
      update: {
        name: `${base.replace('https://firestore.googleapis.com/v1/', '')}/documents/communityMembers/${membershipId}`,
        fields: {
          ...existingFields,
          id: { stringValue: membershipId },
          companyId: existingFields.companyId || { stringValue: community.companyId || '' },
          communityId: { stringValue: community.id },
          uid: { stringValue: uid },
          role: { stringValue: 'admin' },
          joinedAt: existingFields.joinedAt || { stringValue: now },
          joinedBy: existingFields.joinedBy || { stringValue: 'uorqui-system' },
          addedBy: existingFields.addedBy || { stringValue: 'uorqui-system' },
          updatedAt: { stringValue: now }
        }
      }
    });
  }

  if (!writes.length) {
    console.info('Uorqui official community superadmin roles already synchronized', {
      uid,
      communities: communities.length
    });
    return;
  }

  const commit = await fetch(`${base}/documents:commit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ writes })
  });
  if (!commit.ok) {
    const text = await commit.text().catch(() => '');
    throw new Error(`Firestore official admin commit HTTP ${commit.status}: ${text.slice(0, 240)}`);
  }

  console.info('Uorqui official community superadmin roles synchronized', {
    uid,
    communities: communities.length,
    updated: writes.length
  });
}

function bearerUid(request) {
  const header = String(request.headers.get('Authorization') || '');
  if (!header.startsWith('Bearer ')) return '';
  const token = header.slice(7);
  const parts = token.split('.');
  if (parts.length !== 3) return '';
  try {
    const payload = JSON.parse(base64urlText(parts[1]));
    return String(payload?.sub || '').trim();
  } catch {
    return '';
  }
}

function superadminUids(env) {
  return new Set(
    String(env.SUPERADMIN_UIDS || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
  );
}

function documentId(name = '') {
  const parts = String(name || '').split('/');
  return decodeURIComponent(parts[parts.length - 1] || '');
}

function fieldString(value) {
  return String(value?.stringValue || '');
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
  if (!credentials.email || !credentials.privateKey) throw new Error('Service Account do Firebase incompleta no Worker.');

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
  const signature = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(input));
  const assertion = `${input}.${b64url(new Uint8Array(signature))}`;
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(`Google OAuth recusou Service Account: ${data.error_description || data.error || response.status}`);

  googleTokenCache = {
    token: data.access_token,
    expires: Date.now() + Number(data.expires_in || 3600) * 1000
  };
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

function b64urlJson(object) {
  return b64url(new TextEncoder().encode(JSON.stringify(object)));
}

function b64url(bytes) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlText(value) {
  let input = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  while (input.length % 4) input += '=';
  return new TextDecoder().decode(Uint8Array.from(atob(input), char => char.charCodeAt(0)));
}
