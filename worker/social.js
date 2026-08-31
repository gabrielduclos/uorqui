import core, { RealtimeHub } from './product-v123-navigation.js';

export { RealtimeHub };

const FIREBASE_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwksCache = { expires: 0, keys: [] };
let googleTokenCache = { expires: 0, token: '' };
const PRODUCT_VERSION = 'social-preview-1';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/social/')) {
      return core.fetch(request, env, ctx);
    }

    try {
      const identity = await requireAuth(request, env);
      const response = await routeSocial(request, env, identity, url);
      const headers = new Headers(response.headers);
      headers.set('X-Uorqui-Version', PRODUCT_VERSION);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (error) {
      console.error('Social API:', error);
      return json({ error: error?.message || 'Erro interno do Uorqui.' }, error?.status || 500);
    }
  },
  async scheduled(controller, env, ctx) {
    if (typeof core.scheduled === 'function') return core.scheduled(controller, env, ctx);
  }
};

async function routeSocial(request, env, identity, url) {
  const path = url.pathname.slice('/api/social'.length);
  const method = request.method.toUpperCase();

  if (method === 'GET' && path === '/people') {
    return json(await listPeople(env, identity, url.searchParams.get('q') || ''));
  }
  if (method === 'GET' && path === '/feed') {
    return json(await getSocialFeed(env, identity));
  }

  const profileMatch = path.match(/^\/profiles\/([^/]+)$/);
  if (method === 'GET' && profileMatch) {
    return json(await getPublicProfile(env, identity, decodeURIComponent(profileMatch[1])));
  }

  const blockMatch = path.match(/^\/profiles\/([^/]+)\/block$/);
  if (blockMatch && method === 'POST') {
    return json(await blockUser(env, identity, decodeURIComponent(blockMatch[1])));
  }
  if (blockMatch && method === 'DELETE') {
    return json(await unblockUser(env, identity, decodeURIComponent(blockMatch[1])));
  }

  const followMatch = path.match(/^\/profiles\/([^/]+)\/follow$/);
  if (followMatch && method === 'POST') {
    return json(await followUser(env, identity, decodeURIComponent(followMatch[1])));
  }
  if (followMatch && method === 'DELETE') {
    return json(await unfollowUser(env, identity, decodeURIComponent(followMatch[1])));
  }

  return json({ error: 'Rota social não encontrada.' }, 404);
}

async function visibleSocialPost(env, identity, post, communityCache, membershipCache) {
  if (!post || post.deletedAt || post.deletedByAdmin) return false;

  // Mundo é sempre público.
  if (post.scope === 'world') return true;

  const getCompanyMembership = async (companyId) => {
    if (!companyId) return null;
    const key = `company:${companyId}`;
    if (!membershipCache.has(key)) {
      membershipCache.set(key, await fsGet(env, 'companyMembers', `${companyId}_${identity.uid}`));
    }
    return membershipCache.get(key);
  };

  const isCompanyAdmin = (membership) =>
    Boolean(membership?.status === 'active' && ['owner', 'admin'].includes(membership.role));

  const getSectorAccess = async (companyId, topicId, companyMembership) => {
    if (!topicId) return true;
    if (isCompanyAdmin(companyMembership)) return true;
    const key = `sector:${topicId}`;
    if (!membershipCache.has(key)) {
      membershipCache.set(key, Boolean(await fsGet(env, 'communityTopicMembers', `${topicId}_${identity.uid}`)));
    }
    return Boolean(membershipCache.get(key));
  };

  // Publicação diretamente na empresa: precisa ser colaborador ativo;
  // se estiver vinculada a um setor, também precisa participar dele.
  if (post.scope === 'company') {
    const companyMembership = await getCompanyMembership(post.companyId);
    if (!companyMembership || companyMembership.status !== 'active') return false;
    return getSectorAccess(post.companyId, post.topicId, companyMembership);
  }

  if (post.scope !== 'community' || !post.communityId) return false;

  let community = communityCache.get(post.communityId);
  if (community === undefined) {
    community = await fsGet(env, 'communities', post.communityId);
    communityCache.set(post.communityId, community || null);
  }
  if (!community) return false;

  // Comunidade social comum e aberta: perfil pode mostrar para qualquer visitante.
  if (!community.companyId && community.visibility === 'public') return true;

  // Comunidade social privada: visitante precisa participar dela.
  if (!community.companyId) {
    const key = `community:${post.communityId}`;
    if (!membershipCache.has(key)) {
      membershipCache.set(key, Boolean(await fsGet(env, 'communityMembers', `${post.communityId}_${identity.uid}`)));
    }
    return Boolean(membershipCache.get(key));
  }

  // Comunidade convertida em empresa: precisa pertencer à empresa.
  const companyMembership = await getCompanyMembership(community.companyId);
  if (!companyMembership || companyMembership.status !== 'active') return false;

  // Conteúdo geral da empresa é visível aos colaboradores.
  // Conteúdo de setor exige participação no setor; dono/admin sempre tem acesso.
  return getSectorAccess(community.companyId, post.topicId, companyMembership);
}

async function listAllPosts(env, pageSize = 300) {
  const response = await fsRequest(env, `/documents/posts?pageSize=${pageSize}`);
  return (response?.documents || []).map(fromDoc);
}

async function hydrateSocialPosts(env, identity, rows, limit = 60) {
  const communityCache = new Map();
  const membershipCache = new Map();
  const visible = [];

  for (const post of [...rows].sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))) {
    if (await visibleSocialPost(env, identity, post, communityCache, membershipCache)) visible.push(post);
    if (visible.length >= limit) break;
  }

  const [reactions, pollVotes] = await Promise.all([
    queryCollection(env, 'reactions', 'uid', identity.uid, 500).catch(() => []),
    queryCollection(env, 'pollVotes', 'uid', identity.uid, 500).catch(() => [])
  ]);
  const likedIds = new Set(reactions.map(item => item.postId));
  const pollVoteMap = new Map(pollVotes.map(item => [item.postId, item.optionId]));

  return visible.map(post => ({
    ...post,
    liked: likedIds.has(post.id),
    myPollOptionId: pollVoteMap.get(post.id) || ''
  }));
}

async function getSocialFeed(env, identity) {
  const [follows, allPosts, myBlocks, blockedBy] = await Promise.all([
    queryCollection(env, 'socialFollows', 'followerUid', identity.uid, 500).catch(() => []),
    listAllPosts(env, 300),
    queryCollection(env, 'socialBlocks', 'blockerUid', identity.uid, 500).catch(() => []),
    queryCollection(env, 'socialBlocks', 'targetUid', identity.uid, 500).catch(() => [])
  ]);
  const blockedUids = new Set([
    ...myBlocks.map(item => item.targetUid),
    ...blockedBy.map(item => item.blockerUid)
  ].filter(Boolean));
  const followedUids = [...new Set(follows.map(item => item.targetUid).filter(uid => uid && !blockedUids.has(uid)))];
  const followedSet = new Set(followedUids);

  const followedRows = followedUids.length
    ? allPosts.filter(post => followedSet.has(post.authorUid))
    : [];

  const recommendedRows = allPosts.filter(post => !followedSet.has(post.authorUid) && !blockedUids.has(post.authorUid));
  const followedPosts = await hydrateSocialPosts(env, identity, followedRows, 80);
  const recommendedPosts = await hydrateSocialPosts(env, identity, recommendedRows, 45);

  // Mesmo seguindo alguém, nunca deixamos o feed vazio: conteúdo público relevante complementa.
  const seen = new Set();
  const posts = [...followedPosts, ...recommendedPosts]
    .filter(post => !seen.has(post.id) && seen.add(post.id))
    .slice(0, 80);

  const communitiesResponse = await fsRequest(env, '/documents/communities?pageSize=160');
  const communities = (communitiesResponse?.documents || [])
    .map(fromDoc)
    .filter(community => !community.companyId && community.visibility === 'public' && community.archived !== true)
    .slice(0, 24)
    .map(community => ({
      id: community.id,
      companyId: '',
      name: community.name || 'Comunidade',
      description: community.description || '',
      visibility: 'public',
      memberCount: Number(community.memberCount || 0),
      createdBy: community.createdBy || ''
    }));

  return {
    followingCount: followedUids.length,
    posts,
    communities
  };
}


async function listPeople(env, identity, query) {
  const [response, myBlocks, blockedBy] = await Promise.all([
    fsRequest(env, '/documents/users?pageSize=80'),
    queryCollection(env, 'socialBlocks', 'blockerUid', identity.uid, 500).catch(() => []),
    queryCollection(env, 'socialBlocks', 'targetUid', identity.uid, 500).catch(() => [])
  ]);
  const blockedUids = new Set([
    ...myBlocks.map(item => item.targetUid),
    ...blockedBy.map(item => item.blockerUid)
  ].filter(Boolean));
  const term = clean(query, 80).toLowerCase();
  const users = (response?.documents || [])
    .map(fromDoc)
    .filter((user) => user.uid !== identity.uid && !blockedUids.has(user.uid || user.id))
    .filter((user) => {
      if (!term) return true;
      return [user.displayName, user.username, user.bio]
        .some((value) => String(value || '').toLowerCase().includes(term));
    })
    .slice(0, 40);

  const items = await Promise.all(users.map(async (user) => ({
    ...publicUser(user),
    isFollowing: Boolean(await fsGet(env, 'socialFollows', followId(identity.uid, user.uid || user.id)))
  })));

  return { me: identity.uid, people: items };
}

async function getPublicProfile(env, identity, targetUid) {
  const user = await fsGet(env, 'users', targetUid);
  if (!user) throw httpError(404, 'Perfil não encontrado.');

  const isMe = targetUid === identity.uid;
  const [followingRows, followerRows, allPosts, following, myBlock, theirBlock] = await Promise.all([
    queryCollection(env, 'socialFollows', 'followerUid', targetUid, 500).catch(() => []),
    queryCollection(env, 'socialFollows', 'targetUid', targetUid, 500).catch(() => []),
    listAllPosts(env, 300),
    isMe ? null : fsGet(env, 'socialFollows', followId(identity.uid, targetUid)),
    isMe ? null : fsGet(env, 'socialBlocks', blockId(identity.uid, targetUid)),
    isMe ? null : fsGet(env, 'socialBlocks', blockId(targetUid, identity.uid))
  ]);

  const blocked = Boolean(myBlock);
  const blockedBy = Boolean(theirBlock);
  const authored = (!blocked && !blockedBy) ? allPosts.filter(post => post.authorUid === targetUid) : [];
  const posts = await hydrateSocialPosts(env, identity, authored, 60);

  return {
    profile: publicUser(user),
    followerCount: followerRows.length,
    followingCount: followingRows.length,
    isFollowing: !blocked && !blockedBy && Boolean(following),
    isBlocked: blocked,
    isBlockedBy: blockedBy,
    isMe,
    posts
  };
}

async function followUser(env, identity, targetUid) {
  if (!targetUid || targetUid === identity.uid) throw httpError(400, 'Você não pode seguir a si mesmo.');
  const target = await fsGet(env, 'users', targetUid);
  if (!target) throw httpError(404, 'Perfil não encontrado.');
  const [myBlock, theirBlock] = await Promise.all([
    fsGet(env, 'socialBlocks', blockId(identity.uid, targetUid)),
    fsGet(env, 'socialBlocks', blockId(targetUid, identity.uid))
  ]);
  if (myBlock || theirBlock) throw httpError(403, 'Não é possível seguir este usuário enquanto houver bloqueio.');
  const id = followId(identity.uid, targetUid);
  await fsPut(env, 'socialFollows', id, {
    id,
    followerUid: identity.uid,
    targetUid,
    createdAt: new Date().toISOString()
  });
  const followers = await queryCollection(env, 'socialFollows', 'targetUid', targetUid, 500);
  return { following: true, followerCount: followers.length };
}

async function unfollowUser(env, identity, targetUid) {
  if (!targetUid || targetUid === identity.uid) throw httpError(400, 'Ação inválida.');
  await fsDelete(env, 'socialFollows', followId(identity.uid, targetUid));
  const followers = await queryCollection(env, 'socialFollows', 'targetUid', targetUid, 500);
  return { following: false, followerCount: followers.length };
}
async function blockUser(env, identity, targetUid) {
  if (!targetUid || targetUid === identity.uid) throw httpError(400, 'Você não pode bloquear a si mesmo.');
  const target = await fsGet(env, 'users', targetUid);
  if (!target) throw httpError(404, 'Perfil não encontrado.');

  const id = blockId(identity.uid, targetUid);
  await fsPut(env, 'socialBlocks', id, {
    id,
    blockerUid: identity.uid,
    targetUid,
    createdAt: new Date().toISOString()
  });

  await Promise.allSettled([
    fsDelete(env, 'socialFollows', followId(identity.uid, targetUid)),
    fsDelete(env, 'socialFollows', followId(targetUid, identity.uid))
  ]);

  return { blocked: true };
}

async function unblockUser(env, identity, targetUid) {
  if (!targetUid || targetUid === identity.uid) throw httpError(400, 'Ação inválida.');
  await fsDelete(env, 'socialBlocks', blockId(identity.uid, targetUid));
  return { blocked: false };
}

function blockId(blockerUid, targetUid) {
  return `${blockerUid}__${targetUid}`;
}


function publicUser(user) {
  return {
    uid: user.uid || user.id || '',
    displayName: user.displayName || 'Usuário',
    username: user.username || '',
    bio: user.bio || '',
    avatarMediaId: user.avatarMediaId || ''
  };
}

function followId(followerUid, targetUid) {
  return `${followerUid}__${targetUid}`;
}

async function queryCollection(env, collectionId, fieldPath, value, limit = 100) {
  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      where: {
        fieldFilter: {
          field: { fieldPath },
          op: 'EQUAL',
          value: { stringValue: value }
        }
      },
      limit
    }
  };
  const result = await fsRequest(env, '/documents:runQuery', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return (Array.isArray(result) ? result : [])
    .map((row) => row.document)
    .filter(Boolean)
    .map(fromDoc);
}

async function requireAuth(request, env) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) throw httpError(401, 'Faça login para continuar.');
  return verifyFirebaseToken(header.slice(7), env.FIREBASE_PROJECT_ID);
}

async function verifyFirebaseToken(token, projectId) {
  const parts = token.split('.');
  if (parts.length !== 3) throw httpError(401, 'Token inválido.');
  const header = JSON.parse(base64urlText(parts[0]));
  const payload = JSON.parse(base64urlText(parts[1]));
  if (header.alg !== 'RS256' || !header.kid) throw httpError(401, 'Token inválido.');
  const keys = await getFirebaseJwks();
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) throw httpError(401, 'Chave de autenticação inválida.');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' }, key, base64urlBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!valid) throw httpError(401, 'Assinatura inválida.');
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}` || !payload.sub || payload.exp <= now) {
    throw httpError(401, 'Token expirado ou inválido.');
  }
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
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
  });
  const data = await response.json();
  if (!response.ok) throw httpError(503, 'Não foi possível autenticar a API do Firebase.');
  googleTokenCache = { token: data.access_token, expires: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return data.access_token;
}

async function importPrivateKey(pem) {
  const normalized = String(pem).replace(/\\n/g, '\n');
  const cleanKey = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const bytes = Uint8Array.from(atob(cleanKey), (char) => char.charCodeAt(0));
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
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw httpError(response.status === 409 ? 409 : 500, data?.error?.message || 'Erro no Firestore.');
  return data;
}

async function fsGet(env, collection, docId) {
  const doc = await fsRequest(env, `/documents/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`);
  return doc ? fromDoc(doc) : null;
}

async function fsPut(env, collection, docId, obj) {
  const doc = await fsRequest(env, `/documents/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`, {
    method: 'PATCH', body: JSON.stringify({ fields: toFields({ ...obj, id: obj.id || docId }) })
  });
  return fromDoc(doc);
}

async function fsDelete(env, collection, docId) {
  await fsRequest(env, `/documents/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`, { method: 'DELETE' });
}

function fromDoc(doc) {
  const obj = fromFields(doc.fields || {});
  obj.id = obj.id || decodeURIComponent(doc.name.split('/').pop());
  return obj;
}
function toFields(obj) { return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined).map(([k, v]) => [k, toValue(v)])); }
function toValue(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v) } };
  return { stringValue: String(v) };
}
function fromFields(fields) { return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromValue(v)])); }
function fromValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  return null;
}

function clean(value, max = 500) { return String(value || '').trim().slice(0, max); }
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } }); }
function base64urlText(value) { return new TextDecoder().decode(base64urlBytes(value)); }
function base64urlBytes(value) {
  const base = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base + '='.repeat((4 - base.length % 4) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}
function b64urlJson(value) { return b64url(new TextEncoder().encode(JSON.stringify(value))); }
function b64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
