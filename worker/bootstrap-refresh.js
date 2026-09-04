const FIREBASE_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwksCache = { expires: 0, keys: [] };
let googleTokenCache = { expires: 0, token: '' };

const COMMUNITY_QUERY_CHUNK = 30;
const POSTS_PER_CHUNK = 80;
const MAX_REFRESH_POSTS = 60;
const MAX_WORLD_POSTS = 40;

export async function handleBootstrapRefresh(request, env) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname !== '/api/bootstrap-refresh') return null;

  try {
    const identity = await requireAuth(request, env);
    const requestedCompanyId = url.searchParams.get('companyId') || '';

    const [me, memberships, communityMemberships] = await Promise.all([
      fsGet(env, 'users', identity.uid),
      fsWhere(env, 'companyMembers', 'uid', identity.uid, 10),
      fsWhere(env, 'communityMembers', 'uid', identity.uid, 150)
    ]);

    if (!me) {
      // O primeiro bootstrap completo cria o perfil quando necessário. Se por
      // algum motivo ele não existir mais, força o cliente a voltar ao caminho
      // completo em vez de recriar dados dentro do refresh leve.
      return json({ error: 'bootstrap_refresh_requires_full' }, 409);
    }

    const activeMemberships = memberships.filter(item => item.status === 'active');
    const companies = [];
    for (const membership of activeMemberships) {
      const company = await fsGet(env, 'companies', membership.companyId);
      if (company) companies.push(companyPlanView(company, env, { role: membership.role }));
    }

    const selectedCompanyId = requestedCompanyId && activeMemberships.some(item => item.companyId === requestedCompanyId)
      ? requestedCompanyId
      : (activeMemberships[0]?.companyId || '');
    const company = selectedCompanyId ? companies.find(item => item.id === selectedCompanyId) || null : null;
    const role = activeMemberships.find(item => item.companyId === selectedCompanyId)?.role || null;
    const canAdmin = role === 'owner' || role === 'admin';

    // A lista de memberships já é a fonte de verdade para o feed principal.
    // Buscamos somente as comunidades que o usuário realmente participa, em
    // vez de listar comunidades e filtrar depois.
    const communities = [];
    const seenCommunityIds = new Set();
    for (const membership of communityMemberships) {
      const communityId = String(membership.communityId || '');
      if (!communityId || seenCommunityIds.has(communityId)) continue;
      seenCommunityIds.add(communityId);
      const community = await fsGet(env, 'communities', communityId);
      if (!community) continue;
      communities.push({
        ...communityView(community),
        memberCount: Math.max(1, Number(community.memberCount || 0))
      });
    }
    communities.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));

    const communityIds = communities.map(item => item.id).filter(Boolean);
    const communityMap = Object.fromEntries(communities.map(item => [item.id, item]));

    // Em vez de fsListCollection(posts, 500), consulta apenas os IDs das
    // comunidades do usuário. IN aceita lotes de IDs e reduz o volume máximo
    // lido em cada refresh de centenas de posts globais para um conjunto
    // diretamente relacionado ao feed daquele usuário.
    const postBatches = [];
    for (let index = 0; index < communityIds.length; index += COMMUNITY_QUERY_CHUNK) {
      const ids = communityIds.slice(index, index + COMMUNITY_QUERY_CHUNK);
      postBatches.push(fsWhereIn(env, 'posts', 'communityId', ids, POSTS_PER_CHUNK));
    }

    const [communityPostGroups, worldPostsRaw, notificationsRaw] = await Promise.all([
      Promise.all(postBatches),
      fsWhere(env, 'posts', 'scope', 'world', MAX_WORLD_POSTS),
      fsWhere(env, 'notifications', 'recipientUid', identity.uid, 100)
    ]);

    const posts = uniqueById(communityPostGroups.flat())
      .filter(post => post.scope === 'community' && post.communityId && seenCommunityIds.has(post.communityId))
      .sort(byCreatedDesc)
      .slice(0, MAX_REFRESH_POSTS);

    const worldPosts = uniqueById(worldPostsRaw)
      .sort(byCreatedDesc)
      .slice(0, MAX_WORLD_POSTS);

    // A limpeza de read_required legado não pertence ao caminho crítico do
    // refresh. O bootstrap antigo continua compatível, mas o refresh leve é
    // exclusivamente de leitura e não abre N fsGet(posts) por notificação.
    const notifications = notificationsRaw
      .sort(byCreatedDesc)
      .slice(0, 60);

    return json({
      me,
      companies,
      selectedCompanyId,
      company,
      role,
      canAdmin,
      isSuperadmin: isSuperadmin(env, identity),
      communities,
      communityMap,
      posts,
      worldPosts,
      notifications,
      // O cliente preserva members/allCompanyCommunities do último bootstrap
      // completo. Esses blocos administrativos não precisam ser relidos porque
      // alguém curtiu, comentou ou mandou mensagem.
      partial: true,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    console.error('Bootstrap refresh:', error);
    return json({ error: error?.message || 'Não foi possível atualizar o Uorqui.' }, status);
  }
}

function uniqueById(items) {
  const result = [];
  const seen = new Set();
  for (const item of items || []) {
    const id = String(item?.id || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(item);
  }
  return result;
}

function byCreatedDesc(a, b) {
  return String(b?.createdAt || '').localeCompare(String(a?.createdAt || ''));
}

function normalizedCommunityVisibility(value) {
  return String(value || '').toLowerCase() === 'public' ? 'public' : 'private';
}

function communityView(community) {
  return {
    ...community,
    companyId: '',
    visibility: normalizedCommunityVisibility(community?.visibility),
    verifiedCompany: Boolean(community?.verifiedCompany),
    verifiedCompanyId: community?.verifiedCompanyId || community?.legacyCompanyId || '',
    verifiedCompanyName: community?.verifiedCompanyName || '',
    inviteOnly: Boolean(community?.inviteOnly || community?.verifiedCompany)
  };
}

function premiumMonthlyPrice(env) {
  const value = Number(env.PREMIUM_MONTHLY_PRICE_BRL || 49.90);
  return Number.isFinite(value) && value > 0 ? value : 49.90;
}

function activeManualPremiumUntil(company) {
  const value = company?.manualPremiumUntil || '';
  if (!value) return '';
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now() ? value : '';
}

function hasPremiumAccess(company) {
  if (!company) return false;
  if (activeManualPremiumUntil(company)) return true;
  if (company.plan !== 'premium') return false;
  const until = company.premiumUntil ? new Date(company.premiumUntil).getTime() : 0;
  if (until > Date.now()) return true;
  return company.billingStatus === 'active' && !company.premiumUntil;
}

function companyPlanView(company, env, extras = {}) {
  const manualPremiumUntil = activeManualPremiumUntil(company);
  const paidPremium = Boolean(
    company?.plan === 'premium' &&
    ((company?.premiumUntil && new Date(company.premiumUntil).getTime() > Date.now()) ||
      (company?.billingStatus === 'active' && !company?.premiumUntil))
  );
  const effectivePlan = hasPremiumAccess(company) ? 'premium' : 'free';
  return {
    ...company,
    plan: company?.plan === 'premium' ? 'premium' : 'free',
    effectivePlan,
    billingStatus: company?.billingStatus || 'inactive',
    premiumUntil: company?.premiumUntil || '',
    manualPremiumUntil,
    premiumSource: manualPremiumUntil ? 'manual' : paidPremium ? 'asaas' : '',
    limits: { members: null, communities: null, jobs: null },
    billingReady: Boolean(env.ASAAS_API_KEY && env.ASAAS_WEBHOOK_TOKEN),
    premiumMonthlyPrice: premiumMonthlyPrice(env),
    billingSubscriptionId: company?.billingSubscriptionId || '',
    ...extras
  };
}

function isSuperadmin(env, identity) {
  const values = String(env.SUPERADMIN_UIDS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return Boolean(identity?.uid && values.includes(identity.uid));
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

  return {
    uid: payload.sub,
    email: payload.email || '',
    name: payload.name || ''
  };
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
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(input)
  );
  const assertion = `${input}.${b64url(new Uint8Array(signature))}`;
  const tokenBody = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody
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
  const document = await fsRequest(
    env,
    `/documents/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`
  );
  return document ? fromDoc(document) : null;
}

async function fsWhere(env, collection, field, value, limit = 100) {
  const payload = {
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
  };
  const rows = await fsRequest(env, '/documents:runQuery', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return (Array.isArray(rows) ? rows : [])
    .filter(item => item?.document)
    .map(item => fromDoc(item.document));
}

async function fsWhereIn(env, collection, field, values, limit = 80) {
  const cleaned = Array.from(new Set((values || []).map(value => String(value || '')).filter(Boolean)));
  if (!cleaned.length) return [];
  if (cleaned.length === 1) return fsWhere(env, collection, field, cleaned[0], limit);

  const payload = {
    structuredQuery: {
      from: [{ collectionId: collection }],
      where: {
        fieldFilter: {
          field: { fieldPath: field },
          op: 'IN',
          value: {
            arrayValue: {
              values: cleaned.map(value => ({ stringValue: value }))
            }
          }
        }
      },
      limit
    }
  };
  const rows = await fsRequest(env, '/documents:runQuery', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return (Array.isArray(rows) ? rows : [])
    .filter(item => item?.document)
    .map(item => fromDoc(item.document));
}

function fromDoc(document) {
  const name = String(document?.name || '');
  const id = name.split('/').pop() || '';
  const result = { id };
  for (const [key, value] of Object.entries(document?.fields || {})) {
    result[key] = fromValue(value);
  }
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
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
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
    'pkcs8',
    bytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
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
      'Cache-Control': 'no-store',
      'X-Uorqui-Bootstrap': 'refresh-lite'
    }
  });
}
