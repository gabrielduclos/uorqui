const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const tokenCache = { token: '', expires: 0 };

export async function handlePublicPostRequest(request, env) {
  const method = String(request?.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return null;

  let url;
  try { url = new URL(request.url); }
  catch { return null; }

  const postMatch = url.pathname.match(/^\/api\/public\/posts\/([^/]+)\/?$/i);
  if (postMatch) {
    const postId = decodeURIComponent(postMatch[1] || '').trim();
    if (!postId) return publicJson({ error: 'Publicação não encontrada.' }, 404, method);
    try {
      const payload = await getPublicPost(env, postId);
      if (!payload) return publicJson({ error: 'Esta publicação não está disponível publicamente.' }, 404, method);
      return publicJson(payload, 200, method, { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' });
    } catch (error) {
      console.error('Uorqui public post:', error?.message || error);
      return publicJson({ error: 'Não foi possível abrir esta publicação.' }, 500, method);
    }
  }

  const mediaMatch = url.pathname.match(/^\/api\/public\/media\/([^/]+)\/?$/i);
  if (mediaMatch) {
    const mediaId = decodeURIComponent(mediaMatch[1] || '').trim();
    const postId = String(url.searchParams.get('post') || '').trim();
    if (!mediaId || !postId) return new Response('Not found', { status: 404 });
    try {
      return await getPublicPostMedia(env, postId, mediaId, method);
    } catch (error) {
      console.warn('Uorqui public media:', error?.message || error);
      return new Response('Not found', { status: 404 });
    }
  }

  return null;
}

async function getPublicPost(env, postId) {
  const post = await fsGet(env, 'posts', postId);
  const access = await publicPostAccess(env, post);
  if (!access) return null;

  const comments = await fsWhere(env, 'comments', 'postId', postId, 120).catch(() => []);
  comments.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

  return {
    post: publicPostView(post),
    community: {
      id: access.community.id,
      name: clean(access.community.name || post.communityName || 'Comunidade', 120),
      description: clean(access.community.description || '', 280),
      visibility: 'public'
    },
    comments: comments
      .filter(comment => !comment.deletedAt && !comment.deletedByAdmin)
      .map(publicCommentView)
      .slice(0, 100),
    isolated: true,
    interactionRequiresLogin: true
  };
}

async function getPublicPostMedia(env, postId, mediaId, method) {
  if (!env?.MEDIA) return new Response('Not found', { status: 404 });
  const post = await fsGet(env, 'posts', postId);
  const access = await publicPostAccess(env, post);
  if (!access) return new Response('Not found', { status: 404 });

  const attachment = (Array.isArray(post.attachments) ? post.attachments : [])
    .find(item => String(item?.id || '') === mediaId);
  if (!attachment) return new Response('Not found', { status: 404 });

  const media = await fsGet(env, 'media', mediaId);
  if (!media?.key) return new Response('Not found', { status: 404 });
  if (media.communityId && String(media.communityId) !== String(post.communityId)) {
    return new Response('Not found', { status: 404 });
  }

  const object = await env.MEDIA.get(media.key);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  const contentType = clean(media.contentType || attachment.contentType || object.httpMetadata?.contentType || 'application/octet-stream', 120);
  headers.set('Content-Type', contentType || 'application/octet-stream');
  headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (media.name || attachment.name) {
    const name = clean(media.name || attachment.name || 'arquivo', 180).replace(/["\r\n]/g, '');
    headers.set('Content-Disposition', `${contentType.startsWith('image/') || contentType.startsWith('video/') ? 'inline' : 'attachment'}; filename="${name}"`);
  }

  if (method === 'HEAD') return new Response(null, { status: 200, headers });
  return new Response(object.body, { status: 200, headers });
}

async function publicPostAccess(env, post) {
  if (!post || post.deletedAt || post.deletedByAdmin) return null;
  if (String(post.scope || '') !== 'community') return null;
  if (!post.communityId || post.companyId) return null;

  const community = await fsGet(env, 'communities', String(post.communityId));
  if (!community) return null;
  if (String(community.visibility || '') !== 'public') return null;
  if (community.companyId || community.legacyCompanyId || community.verifiedCompany) return null;
  if (community.deletedAt || community.deletionStatus === 'deleted') return null;

  return { community };
}

function publicPostView(post) {
  const sourceImages = uniqueHttpUrls([
    ...(Array.isArray(post.sourceImageUrls) ? post.sourceImageUrls : []),
    post.sourceImageUrl || ''
  ]).slice(0, 4);

  return {
    id: String(post.id || ''),
    type: clean(post.type || 'post', 40),
    title: clean(post.title || '', 220),
    text: clean(post.text || '', 12000),
    authorName: clean(post.authorName || 'Usuário', 120),
    authorAccountType: clean(post.authorAccountType || '', 40),
    createdAt: clean(post.createdAt || '', 80),
    communityId: clean(post.communityId || '', 180),
    communityName: clean(post.communityName || '', 140),
    reactionCount: Math.max(0, Number(post.reactionCount || 0)),
    commentCount: Math.max(0, Number(post.commentCount || 0)),
    isResolved: Boolean(post.isResolved),
    attachments: (Array.isArray(post.attachments) ? post.attachments : []).map(item => ({
      id: clean(item?.id || '', 180),
      name: clean(item?.name || 'Arquivo', 180),
      contentType: clean(item?.contentType || '', 120),
      size: Math.max(0, Number(item?.size || 0))
    })).filter(item => item.id).slice(0, 8),
    pollOptions: (Array.isArray(post.pollOptions) ? post.pollOptions : []).map(item => ({
      id: clean(item?.id || '', 120),
      text: clean(item?.text || item?.label || '', 280),
      label: clean(item?.label || item?.text || '', 280),
      votes: Math.max(0, Number(item?.votes || item?.voteCount || 0))
    })).slice(0, 20),
    pollTotalVotes: Math.max(0, Number(post.pollTotalVotes || 0)),
    eventStart: clean(post.eventStart || '', 80),
    eventEnd: clean(post.eventEnd || '', 80),
    eventLocation: clean(post.eventLocation || post.location || '', 240),
    sourceName: clean(post.sourceName || '', 160),
    sourceUrl: /^https?:\/\//i.test(String(post.sourceUrl || '')) ? String(post.sourceUrl) : '',
    sourceHeadline: clean(post.sourceHeadline || '', 320),
    sourceImageUrl: sourceImages[0] || '',
    sourceImageUrls: sourceImages
  };
}

function publicCommentView(comment) {
  return {
    id: clean(comment.id || '', 180),
    authorName: clean(comment.authorName || 'Usuário', 120),
    text: clean(stripCommentPhotoMarker(comment.text || ''), 6000),
    createdAt: clean(comment.createdAt || '', 80),
    reactionCount: Math.max(0, Number(comment.reactionCount || 0)),
    parentCommentId: clean(comment.parentCommentId || '', 180),
    accepted: Boolean(comment.accepted)
  };
}

function stripCommentPhotoMarker(value) {
  return String(value || '').replace(/\n?\[\[uorqui-photo:[a-zA-Z0-9_-]+\]\]\s*$/i, '').trim();
}

async function fsGet(env, collection, docId) {
  const token = await googleAccessToken(env);
  const url = `${firestoreBase(env)}/documents/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore ${response.status}`);
  return fromDocument(await response.json());
}

async function fsWhere(env, collection, fieldPath, value, limit = 100) {
  const token = await googleAccessToken(env);
  const response = await fetch(`${firestoreBase(env)}/documents:runQuery`, {
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
            field: { fieldPath },
            op: 'EQUAL',
            value: toFirestoreValue(value)
          }
        },
        limit: Math.max(1, Math.min(250, Number(limit || 100)))
      }
    })
  });
  if (!response.ok) throw new Error(`Firestore query ${response.status}`);
  const rows = await response.json();
  return (Array.isArray(rows) ? rows : []).map(row => row?.document ? fromDocument(row.document) : null).filter(Boolean);
}

function firestoreBase(env) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)`;
}

function firebaseServiceAccount(env) {
  let email = String(env?.FIREBASE_SERVICE_ACCOUNT_EMAIL || '').trim();
  let privateKey = String(env?.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY || '').trim();
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

async function googleAccessToken(env) {
  if (tokenCache.token && tokenCache.expires > Date.now() + 60000) return tokenCache.token;
  const credentials = firebaseServiceAccount(env);
  if (!credentials.email || !credentials.privateKey) throw new Error('Firebase Service Account ausente.');

  const now = Math.floor(Date.now() / 1000);
  const header = b64urlJson({ alg: 'RS256', typ: 'JWT' });
  const claims = b64urlJson({
    iss: credentials.email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600
  });
  const input = `${header}.${claims}`;
  const key = await importPrivateKey(credentials.privateKey);
  const signature = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(input));
  const assertion = `${input}.${b64url(new Uint8Array(signature))}`;

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error('Google recusou a Service Account.');
  tokenCache.token = data.access_token;
  tokenCache.expires = Date.now() + Number(data.expires_in || 3600) * 1000;
  return tokenCache.token;
}

async function importPrivateKey(pem) {
  const normalized = String(pem || '')
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const bytes = Uint8Array.from(atob(normalized), char => char.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', bytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

function fromDocument(doc) {
  const result = { id: String(doc?.name || '').split('/').pop() || '' };
  for (const [key, value] of Object.entries(doc?.fields || {})) result[key] = fromFirestoreValue(value);
  return result;
}

function fromFirestoreValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('integerValue' in value) return Number(value.integerValue || 0);
  if ('doubleValue' in value) return Number(value.doubleValue || 0);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(fromFirestoreValue);
  if ('mapValue' in value) {
    const output = {};
    for (const [key, child] of Object.entries(value.mapValue?.fields || {})) output[key] = fromFirestoreValue(child);
    return output;
  }
  return null;
}

function toFirestoreValue(value) {
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: String(value ?? '') };
}

function b64urlJson(value) {
  return b64url(new TextEncoder().encode(JSON.stringify(value)));
}

function b64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function clean(value, max = 500) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function uniqueHttpUrls(values) {
  const seen = new Set();
  const output = [];
  for (const value of values || []) {
    const url = String(value || '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    const key = url.replace(/#.*$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(url);
  }
  return output;
}

function publicJson(payload, status = 200, method = 'GET', extraHeaders = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  });
  return new Response(method === 'HEAD' ? null : JSON.stringify(payload), { status, headers });
}
