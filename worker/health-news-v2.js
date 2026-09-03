const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const HEALTH_AGENT_UID = 'uorqui_ai_agent_saude';
const HEALTH_COMMUNITY_ID = 'uorqui_ai_community_saude';
const FRESH_WINDOW = 48 * 60 * 60 * 1000;
const SEMANTIC_WINDOW = 72 * 60 * 60 * 1000;
let googleTokenCache = { token: '', expires: 0 };

const HEALTH_QUERIES = [
  'saúde medicina prevenção Brasil',
  'saúde pública SUS vacinação Brasil',
  'pesquisa médica descoberta saúde',
  'doenças prevenção saúde Brasil',
  'Anvisa saúde medicamentos Brasil',
  'Ministério da Saúde Brasil saúde pública',
  'hospitais medicina pesquisa Brasil',
  'vacinas epidemiologia saúde Brasil'
];

const STOPWORDS = new Set([
  'a','o','as','os','um','uma','uns','umas','de','da','do','das','dos','e','em','no','na','nos','nas','para','por','com','sem','sobre','que','se','ao','aos','mais','menos','novo','nova','novos','novas','após','antes','como','contra','entre','até','ja','já','ainda','pode','podem','vai','vão','tem','ter','foi','ser','são','é','esta','este','essa','esse','isso','sua','seu','suas','seus','notícia','noticias','notícias','veja','saiba','entenda','diz','dizem','segundo','hoje','brasil','saude','saúde'
]);

export async function publishScopedHealthNews(env, scheduledAt = Date.now()) {
  const now = Number(scheduledAt || Date.now());
  try {
    const [agent, community] = await Promise.all([
      fsGet(env, 'users', HEALTH_AGENT_UID),
      fsGet(env, 'communities', HEALTH_COMMUNITY_ID)
    ]);
    if (!agent || !community) {
      console.warn('Uorqui health v2 target missing', { agent: Boolean(agent), community: Boolean(community) });
      return;
    }

    const recentPosts = (await fsWhere(env, 'posts', 'communityId', HEALTH_COMMUNITY_ID, 120).catch(() => []))
      .filter(post => post?.authorAccountType === 'uorqui_agent' && post?.aiContentMode === 'news')
      .filter(post => !post?.deletedAt && !post?.deletedByAdmin)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    const hourSlot = Math.floor(now / (60 * 60 * 1000));
    const queryIndex = hourSlot % HEALTH_QUERIES.length;
    const query = HEALTH_QUERIES[queryIndex];
    const candidates = await fetchCandidates(query, now);

    let chosen = null;
    let duplicateCount = 0;
    for (const candidate of candidates.slice(0, 12)) {
      if (isHealthDuplicate(candidate, recentPosts, now)) {
        duplicateCount += 1;
        continue;
      }
      chosen = await enrichArticle(candidate);
      if (isHealthDuplicate(chosen, recentPosts, now)) {
        duplicateCount += 1;
        chosen = null;
        continue;
      }
      break;
    }

    if (!chosen) {
      console.info('Uorqui health v2 skipped', {
        queryIndex,
        query,
        candidates: candidates.length,
        duplicates: duplicateCount,
        result: 'no-publishable-candidate'
      });
      return;
    }

    const text = await generateHealthText(env, chosen);
    if (!text) {
      console.info('Uorqui health v2 skipped', { queryIndex, query, result: 'empty-text' });
      return;
    }

    const createdAt = new Date(now).toISOString();
    const postId = `uorqui_ai_live_saude_v2_${now}_${crypto.randomUUID().slice(0, 8)}`;
    const post = {
      id: postId,
      authorUid: HEALTH_AGENT_UID,
      authorName: agent.displayName || 'Lia · Saúde',
      authorAvatarMediaId: agent.avatarMediaId || '',
      authorAccountType: 'uorqui_agent',
      authorAiAssisted: true,
      authorTeamLabel: 'Equipe Uorqui · IA',
      scope: 'community',
      companyId: '',
      communityId: HEALTH_COMMUNITY_ID,
      communityName: community.name || 'Saúde',
      communityVisibility: 'public',
      communityOfficialUorqui: true,
      communityOfficialLabel: 'Oficial Uorqui',
      topicId: '',
      topicName: '',
      type: 'post',
      text,
      title: '',
      requiresReadReceipt: false,
      attachments: [],
      reactionCount: 0,
      commentCount: 0,
      aiGenerated: true,
      aiDisclosure: 'Conteúdo assistido por IA pela Equipe Uorqui',
      aiDay: brazilDateKey(new Date(now)),
      aiContentMode: 'news',
      aiImageGenerated: false,
      sourceName: chosen.source || '',
      sourceUrl: chosen.canonicalUrl || chosen.link || '',
      sourceImageUrl: '',
      sourceImageUrls: [],
      sourcePublishedAt: chosen.publishedAt || '',
      sourceHeadline: chosen.title || '',
      newsTopicKey: topicTokens(chosen.title || '').slice().sort().join('|'),
      createdAt,
      updatedAt: createdAt
    };

    await fsPut(env, 'posts', postId, post);
    console.info('Uorqui health v2 published', {
      postId,
      queryIndex,
      query,
      source: chosen.source || '',
      recentHealthPosts: recentPosts.length
    });
  } catch (error) {
    console.warn('Uorqui health v2 failed:', error?.message || error);
  }
}

async function fetchCandidates(query, now) {
  const [google, bing] = await Promise.all([
    fetchGoogle(query).catch(() => []),
    fetchBing(query).catch(() => [])
  ]);
  const seen = new Set();
  return [...google, ...bing]
    .filter(item => item?.title && item?.link)
    .filter(item => {
      const stamp = new Date(item.publishedAt || 0).getTime();
      return !Number.isFinite(stamp) || now - stamp <= FRESH_WINDOW;
    })
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
    .filter(item => {
      const key = `${normalizeHeadline(item.title)}|${normalizeUrl(item.link)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 24);
}

async function fetchGoogle(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:2d`)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UorquiNews/2.6)', 'Accept': 'application/rss+xml,application/xml,text/xml,*/*' } });
  if (!response.ok) throw new Error(`Google News HTTP ${response.status}`);
  return parseNewsItems(await response.text(), 'Google Notícias');
}

async function fetchBing(query) {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&setlang=pt-br&cc=br`;
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UorquiNews/2.6)', 'Accept': 'application/rss+xml,application/xml,text/xml,*/*' } });
  if (!response.ok) throw new Error(`Bing News HTTP ${response.status}`);
  return parseNewsItems(await response.text(), 'Bing Notícias');
}

function parseNewsItems(xml, fallbackSource = '') {
  return [...String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 25).map(match => {
    const raw = match[1] || '';
    const title = decodeXml(raw.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
    const link = decodeXml(raw.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '');
    const pubDate = decodeXml(raw.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '');
    const source = decodeXml(raw.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || '') || fallbackSource;
    const description = decodeXml(raw.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '');
    let publishedAt = '';
    try { const date = new Date(pubDate); if (Number.isFinite(date.getTime())) publishedAt = date.toISOString(); } catch {}
    return { title, link, canonicalUrl: link, source, description, publishedAt };
  }).filter(item => item.title && item.link);
}

async function enrichArticle(news) {
  if (!/^https?:\/\//i.test(news?.link || '')) return news;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(news.link, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UorquiNews/2.6)', 'Accept': 'text/html,application/xhtml+xml' }
    });
    clearTimeout(timer);
    if (!response.ok) return news;
    const html = (await response.text()).slice(0, 700000);
    const finalUrl = response.url || news.link;
    const source = metaContent(html, 'og:site_name') || news.source || '';
    const description = metaContent(html, 'og:description') || metaContent(html, 'description') || news.description || '';
    const canonical = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] || finalUrl;
    return { ...news, source, description, canonicalUrl: canonical, articleText: extractText(html, description) };
  } catch {
    return news;
  }
}

function isHealthDuplicate(news, previousPosts, now) {
  const url = normalizeUrl(news?.canonicalUrl || news?.link || '');
  const headline = normalizeHeadline(news?.title || '');
  const tokens = topicTokens(news?.title || '');

  for (const post of previousPosts || []) {
    if (url && normalizeUrl(post?.sourceUrl || '') === url) return true;
    if (headline && normalizeHeadline(post?.sourceHeadline || '') === headline) return true;
    const stamp = new Date(post?.createdAt || post?.sourcePublishedAt || 0).getTime();
    if (!Number.isFinite(stamp) || now - stamp > SEMANTIC_WINDOW) continue;
    if (sameTopic(tokens, topicTokens(post?.sourceHeadline || ''))) return true;
  }
  return false;
}

function sameTopic(a = [], b = []) {
  if (a.length < 3 || b.length < 3) return false;
  const left = new Set(a), right = new Set(b);
  let common = 0;
  for (const token of left) if (right.has(token)) common += 1;
  const coverage = common / Math.min(left.size, right.size);
  const union = new Set([...left, ...right]).size || 1;
  const jaccard = common / union;
  return (common >= 4 && coverage >= 0.6) || jaccard >= 0.62;
}

function topicTokens(value = '') {
  return [...new Set(normalizeHeadline(value).split(' ')
    .filter(token => token.length >= 3)
    .filter(token => !STOPWORDS.has(token))
    .filter(token => !/^\d{1,2}$/.test(token)))]
    .slice(0, 16);
}

async function generateHealthText(env, news) {
  const source = news.source || 'a fonte original';
  const context = String(news.articleText || news.description || '').slice(0, 6000);
  const prompt = [
    'Você é Lia, editora de Saúde da rede social brasileira Uorqui, assistida por IA.',
    'Escreva uma notícia factual em português do Brasil, com 2 a 4 parágrafos curtos.',
    'Use somente o conteúdo fornecido. Não invente dados, riscos, benefícios, diagnósticos ou tratamentos.',
    'Não dê aconselhamento médico individual. Cite a fonte naturalmente no texto.',
    'Não use markdown, hashtags ou pergunta final.',
    `MANCHETE: ${news.title || ''}`,
    `FONTE: ${source}`,
    `PUBLICADA EM: ${news.publishedAt || 'recentemente'}`,
    context ? `CONTEXTO:\n${context}` : ''
  ].filter(Boolean).join('\n');

  if (env?.AI) {
    for (const model of ['@cf/zai-org/glm-4.7-flash', '@cf/meta/llama-3.1-8b-instruct-fast']) {
      try {
        const result = await env.AI.run(model, {
          messages: [
            { role: 'system', content: 'Priorize precisão jornalística em saúde e não faça prescrição.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.12,
          ...(model.includes('llama-3.1-8b-instruct-fast') ? { max_tokens: 520 } : { max_completion_tokens: 520 })
        });
        const text = extractAiText(result);
        if (text) return clean(text, 1800);
      } catch {}
    }
  }

  const headline = String(news.title || '').replace(/[\s.!?]+$/g, '').trim();
  return headline ? `Segundo ${source}, ${headline}.` : '';
}

function extractText(html, description = '') {
  const paragraphs = [];
  const first = cleanSpaces(description);
  if (first.length >= 60) paragraphs.push(first);
  const body = String(html || '').replace(/<(script|style|noscript|svg|nav|footer|form|aside)\b[\s\S]*?<\/\1>/gi, ' ');
  for (const match of body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = cleanSpaces(decodeHtml(String(match[1] || '').replace(/<[^>]+>/g, ' ')));
    if (text.length < 60 || text.length > 1400) continue;
    if (/cookies?|newsletter|assine|publicidade|anúncio|termos de uso|política de privacidade/i.test(text)) continue;
    if (!paragraphs.includes(text)) paragraphs.push(text);
    if (paragraphs.join('\n').length >= 6000) break;
  }
  return paragraphs.join('\n').slice(0, 6000);
}

function metaContent(html, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const a = String(html || '').match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'));
  const b = String(html || '').match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'));
  return decodeHtml(a?.[1] || b?.[1] || '');
}

async function fsGet(env, collection, id) {
  const token = await accessToken(env);
  const response = await fetch(`${fsBase(env)}/documents/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore GET ${response.status}`);
  return fromDoc(await response.json());
}

async function fsWhere(env, collection, field, value, limit = 100) {
  const token = await accessToken(env);
  const response = await fetch(`${fsBase(env)}/documents:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: toValue(value) } }, limit } })
  });
  if (!response.ok) throw new Error(`Firestore query ${response.status}`);
  const rows = await response.json();
  return (Array.isArray(rows) ? rows : []).filter(row => row.document).map(row => fromDoc(row.document));
}

async function fsPut(env, collection, id, object) {
  const token = await accessToken(env);
  const response = await fetch(`${fsBase(env)}/documents/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFields({ ...object, id: object.id || id }) })
  });
  if (!response.ok) throw new Error(`Firestore PATCH ${response.status}`);
  return fromDoc(await response.json());
}

function fsBase(env) { return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)`; }

async function accessToken(env) {
  if (googleTokenCache.token && googleTokenCache.expires > Date.now() + 60000) return googleTokenCache.token;
  const credentials = firebaseServiceAccount(env);
  if (!credentials.email || !credentials.privateKey) throw new Error('Firebase Service Account ausente.');
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlJson({ alg: 'RS256', typ: 'JWT' });
  const claims = b64urlJson({ iss: credentials.email, scope: 'https://www.googleapis.com/auth/datastore', aud: TOKEN_ENDPOINT, iat: now, exp: now + 3600 });
  const input = `${header}.${claims}`;
  const key = await importPrivateKey(credentials.privateKey);
  const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(input));
  const assertion = `${input}.${b64url(new Uint8Array(sig))}`;
  const response = await fetch(TOKEN_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error('Google recusou a Service Account.');
  googleTokenCache = { token: data.access_token, expires: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return googleTokenCache.token;
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

async function importPrivateKey(pem) {
  const normalized = String(pem || '').replace(/\\n/g, '\n').replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\s/g, '');
  const bytes = Uint8Array.from(atob(normalized), char => char.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', bytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

function fromDoc(doc) {
  const object = { id: decodeURIComponent(String(doc?.name || '').split('/').pop() || '') };
  for (const [key, value] of Object.entries(doc?.fields || {})) object[key] = fromValue(value);
  return object;
}
function fromValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('integerValue' in value) return Number(value.integerValue || 0);
  if ('doubleValue' in value) return Number(value.doubleValue || 0);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(fromValue);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue?.fields || {}).map(([key, child]) => [key, fromValue(child)]));
  return null;
}
function toFields(object) { return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined).map(([key, value]) => [key, toValue(value)])); }
function toValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (typeof value === 'object') return { mapValue: { fields: toFields(value) } };
  return { stringValue: String(value) };
}

function normalizeHeadline(value = '') { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' '); }
function normalizeUrl(value = '') { try { const url = new URL(String(value || '')); url.hash = ''; for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key); return url.toString().replace(/\/$/, ''); } catch { return String(value || '').trim(); } }
function decodeXml(value = '') { return decodeHtml(String(value || '').replace(/^<!\[CDATA\[|\]\]>$/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()); }
function decodeHtml(value = '') { return String(value || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n) || 32)); }
function cleanSpaces(value = '') { return String(value || '').replace(/\s+/g, ' ').trim(); }
function clean(value, max = 1000) { return String(value || '').replace(/\u0000/g, '').trim().slice(0, max); }
function contentText(content) { if (typeof content === 'string') return content; if (!Array.isArray(content)) return ''; return content.map(part => typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : '').filter(Boolean).join('\n'); }
function extractAiText(result) { if (typeof result === 'string') return result.trim(); if (!result || typeof result !== 'object') return ''; for (const candidate of [result.response, result.output_text, result.text, result.result?.response, result.choices?.[0]?.message?.content, result.choices?.[0]?.text]) { if (typeof candidate === 'string' && candidate.trim()) return candidate.trim(); const text = contentText(candidate); if (text.trim()) return text.trim(); } return ''; }
function b64urlJson(value) { return b64url(new TextEncoder().encode(JSON.stringify(value))); }
function b64url(bytes) { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
function brazilDateKey(date = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
