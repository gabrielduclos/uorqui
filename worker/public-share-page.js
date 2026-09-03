const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const tokenCache = { token: '', expires: 0 };

export async function handlePublicSharePage(request, env) {
  const method = String(request?.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) return null;
  let url;
  try { url = new URL(request.url); } catch { return null; }
  const match = url.pathname.match(/^\/share\/([^/]+)\/?$/i);
  if (!match) return null;

  const postId = decodeURIComponent(match[1] || '').trim();
  if (!postId) return redirectPage(url.origin, '', null, method);

  let preview = null;
  try {
    preview = await publicPreview(env, postId, url.origin);
  } catch (error) {
    console.warn('Uorqui public share preview failed:', error?.message || error);
  }
  return redirectPage(url.origin, postId, preview, method);
}

async function publicPreview(env, postId, origin) {
  const post = await fsGet(env, 'posts', postId);
  if (!post || post.deletedAt || post.deletedByAdmin || String(post.scope || '') !== 'community' || !post.communityId || post.companyId) return null;
  const community = await fsGet(env, 'communities', String(post.communityId));
  if (!community || String(community.visibility || '') !== 'public' || community.companyId || community.legacyCompanyId || community.verifiedCompany || community.deletedAt || community.deletionStatus === 'deleted') return null;

  const title = clean(post.title || post.sourceHeadline || firstSentence(post.text) || `Publicação em ${community.name || 'Uorqui'}`, 120);
  const description = clean(post.text || post.sourceHeadline || community.description || 'Veja esta publicação no Uorqui.', 220);
  const sourceImages = [
    ...(Array.isArray(post.sourceImageUrls) ? post.sourceImageUrls : []),
    post.sourceImageUrl || ''
  ].map(String).filter(value => /^https?:\/\//i.test(value));

  let image = sourceImages[0] || '';
  if (!image) {
    const attachment = (Array.isArray(post.attachments) ? post.attachments : [])
      .find(item => item?.id && String(item?.contentType || '').startsWith('image/'));
    if (attachment?.id) {
      image = `${origin}/api/public/media/${encodeURIComponent(attachment.id)}?post=${encodeURIComponent(postId)}`;
    }
  }

  return {
    title,
    description,
    image,
    communityName: clean(community.name || post.communityName || 'Comunidade', 120)
  };
}

function redirectPage(origin, postId, preview, method) {
  const destination = postId
    ? `${origin}/?post=${encodeURIComponent(postId)}`
    : origin;
  const shareUrl = postId
    ? `${origin}/share/${encodeURIComponent(postId)}`
    : origin;
  const title = preview?.title || 'Publicação no Uorqui';
  const description = preview?.description || 'Entre no Uorqui para visualizar esta publicação.';
  const image = preview?.image || '';
  const tags = [
    '<meta property="og:type" content="article">',
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(shareUrl)}">`,
    '<meta property="og:site_name" content="Uorqui">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    image ? `<meta property="og:image" content="${escapeHtml(image)}">` : '',
    image ? `<meta property="og:image:alt" content="Imagem da publicação no Uorqui">` : '',
    image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : ''
  ].filter(Boolean).join('\n');

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Uorqui</title><link rel="canonical" href="${escapeHtml(shareUrl)}">${tags}<meta http-equiv="refresh" content="0;url=${escapeHtml(destination)}"><script>location.replace(${JSON.stringify(destination)});</script></head><body><p>Abrindo publicação no Uorqui…</p></body></html>`;
  return new Response(method === 'HEAD' ? null : html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': preview ? 'public, max-age=60, stale-while-revalidate=300' : 'public, max-age=30',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function firstSentence(value = '') {
  return String(value || '').trim().split(/(?<=[.!?])\s+/)[0] || '';
}

async function fsGet(env, collection, docId) {
  const token = await googleAccessToken(env);
  const response = await fetch(`${firestoreBase(env)}/documents/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore ${response.status}`);
  return fromDocument(await response.json());
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
  const normalized = String(pem || '').replace(/\\n/g, '\n').replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\s/g, '');
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
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('integerValue' in value) return Number(value.integerValue || 0);
  if ('doubleValue' in value) return Number(value.doubleValue || 0);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(fromFirestoreValue);
  if ('mapValue' in value) {
    const output = {};
    for (const [key, child] of Object.entries(value.mapValue?.fields || {})) output[key] = fromFirestoreValue(child);
    return output;
  }
  return null;
}

function b64urlJson(value) { return b64url(new TextEncoder().encode(JSON.stringify(value))); }
function b64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function clean(value, max = 500) { return String(value ?? '').replace(/\u0000/g, '').trim().replace(/\s+/g, ' ').slice(0, max); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
