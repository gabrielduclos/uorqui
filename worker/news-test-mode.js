const EDITORIAL_STATE_ID = 'uorqui_ai_live_news_state_v1';
const HEALTH_KEY = 'saude';
const HEALTH_AGENT_UID = 'uorqui_ai_agent_saude';
const HEALTH_COMMUNITY_ID = 'uorqui_ai_community_saude';
const FRESH_WINDOW = 36 * 60 * 60 * 1000;
const SEMANTIC_WINDOW = 72 * 60 * 60 * 1000;
const MAX_STATE_ITEMS = 450;
let googleTokenCache = { token: '', expires: 0 };

const OFFICIAL_COMMUNITY_KEYS = [
  'tecnologia-ia', 'games', 'motos', 'carros', 'financas', 'carreira',
  'esportes', 'filmes-series', 'ciencia', 'viagens', HEALTH_KEY
];

const HEALTH_QUERIES = [
  'saúde medicina prevenção Brasil',
  'saúde pública SUS Brasil',
  'pesquisa médica saúde Brasil',
  'vacinação doenças prevenção saúde Brasil'
];

const STOPWORDS = new Set([
  'a','o','as','os','um','uma','uns','umas','de','da','do','das','dos','e','em','no','na','nos','nas','para','por','com','sem','sobre','que','se','ao','aos','mais','menos','novo','nova','novos','novas','após','antes','como','contra','entre','até','ja','já','ainda','pode','podem','vai','vão','tem','ter','foi','ser','são','é','esta','este','essa','esse','isso','sua','seu','suas','seus','notícia','noticias','notícias','veja','saiba','entenda','diz','dizem','segundo','hoje'
]);

export async function prepareNewsTestMode(env, scheduledAt = Date.now()) {
  try {
    await ensureHealthOfficialSeed(env);
  } catch (error) {
    console.warn('Uorqui health seed failed:', error?.message || error);
  }

  try {
    await ensureSuperadminOfficialCommunityAdmins(env);
  } catch (error) {
    console.warn('Uorqui official community admin sync failed:', error?.message || error);
  }

  let state = null;
  try {
    state = await reconcileEditorialStateWithFeed(env);
  } catch (error) {
    console.warn('Uorqui news test reconciliation failed:', error?.message || error);
  }

  try {
    await publishHealthNews(env, state, Number(scheduledAt || Date.now()));
  } catch (error) {
    console.warn('Uorqui health live news failed:', error?.message || error);
  }
}

async function ensureHealthOfficialSeed(env) {
  const now = new Date().toISOString();
  const existingUser = await fsGet(env, 'users', HEALTH_AGENT_UID).catch(() => null);
  await fsPut(env, 'users', HEALTH_AGENT_UID, {
    ...(existingUser || {}),
    id: HEALTH_AGENT_UID,
    uid: HEALTH_AGENT_UID,
    displayName: 'Lia · Saúde',
    username: 'lia_saude_uorqui',
    bio: 'Agente da Equipe Uorqui, assistido por IA. Informação sobre saúde, prevenção, ciência médica e saúde pública.',
    accountType: 'uorqui_agent',
    aiAssisted: true,
    teamLabel: 'Equipe Uorqui · IA',
    specialty: 'saúde, prevenção, ciência médica e saúde pública',
    createdAt: existingUser?.createdAt || now,
    updatedAt: now
  });

  const existingCommunity = await fsGet(env, 'communities', HEALTH_COMMUNITY_ID).catch(() => null);
  await fsPut(env, 'communities', HEALTH_COMMUNITY_ID, {
    ...(existingCommunity || {}),
    id: HEALTH_COMMUNITY_ID,
    companyId: '',
    name: 'Saúde',
    description: 'Saúde, prevenção, ciência médica e saúde pública com informação confiável e sem substituir orientação profissional.',
    visibility: 'public',
    isDefault: false,
    createdBy: existingCommunity?.createdBy || HEALTH_AGENT_UID,
    seededByUorqui: true,
    aiCurated: true,
    officialUorqui: true,
    officialLabel: 'Oficial Uorqui',
    officialSince: existingCommunity?.officialSince || now,
    createdAt: existingCommunity?.createdAt || now,
    updatedAt: now
  });

  const agentMembershipId = `${HEALTH_COMMUNITY_ID}_${HEALTH_AGENT_UID}`;
  const existingMembership = await fsGet(env, 'communityMembers', agentMembershipId).catch(() => null);
  await fsPut(env, 'communityMembers', agentMembershipId, {
    ...(existingMembership || {}),
    id: agentMembershipId,
    companyId: '',
    communityId: HEALTH_COMMUNITY_ID,
    uid: HEALTH_AGENT_UID,
    role: existingMembership?.role === 'owner' ? 'owner' : 'owner',
    joinedAt: existingMembership?.joinedAt || now,
    joinedBy: existingMembership?.joinedBy || 'uorqui-seed'
  });
}

async function ensureSuperadminOfficialCommunityAdmins(env) {
  const superadmins = String(env.SUPERADMIN_UIDS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (!superadmins.length) return;

  const now = new Date().toISOString();
  for (const key of OFFICIAL_COMMUNITY_KEYS) {
    const communityId = `uorqui_ai_community_${key}`;
    const community = await fsGet(env, 'communities', communityId).catch(() => null);
    if (!community?.officialUorqui && key !== HEALTH_KEY) continue;

    for (const uid of superadmins) {
      const id = `${communityId}_${uid}`;
      const existing = await fsGet(env, 'communityMembers', id).catch(() => null);
      await fsPut(env, 'communityMembers', id, {
        ...(existing || {}),
        id,
        companyId: community?.companyId || '',
        communityId,
        uid,
        role: existing?.role === 'owner' ? 'owner' : 'admin',
        joinedAt: existing?.joinedAt || now,
        joinedBy: existing?.joinedBy || 'uorqui-system',
        addedBy: existing?.addedBy || 'uorqui-system',
        updatedAt: now
      });
    }
  }
}

async function reconcileEditorialStateWithFeed(env) {
  const [state, posts] = await Promise.all([
    fsGet(env, 'systemConfig', EDITORIAL_STATE_ID).catch(() => null),
    fsListCollection(env, 'posts', 500).catch(() => [])
  ]);

  const activeNews = posts
    .filter(post => post?.authorAccountType === 'uorqui_agent')
    .filter(post => post?.aiContentMode === 'news')
    .filter(post => post?.sourceHeadline)
    .filter(post => !post?.deletedByAdmin && !post?.deletedAt)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  const items = activeNews.slice(0, MAX_STATE_ITEMS).map(post => stateItem({
    title: post.sourceHeadline || '',
    link: post.sourceUrl || '',
    canonicalUrl: post.sourceUrl || '',
    publishedAt: post.sourcePublishedAt || post.createdAt || ''
  }, post.createdAt || new Date().toISOString()));

  const next = {
    ...(state || {}),
    id: EDITORIAL_STATE_ID,
    initialized: true,
    items,
    reconciledFromFeedAt: new Date().toISOString(),
    reconciledFeedCount: activeNews.length,
    updatedAt: new Date().toISOString()
  };
  await fsPut(env, 'systemConfig', EDITORIAL_STATE_ID, next);

  console.info('Uorqui editorial memory reconciled with feed', {
    before: Array.isArray(state?.items) ? state.items.length : 0,
    after: items.length,
    activeNews: activeNews.length
  });
  return next;
}

async function publishHealthNews(env, initialState, scheduledAt) {
  const now = Date.now();
  const state = initialState || await fsGet(env, 'systemConfig', EDITORIAL_STATE_ID).catch(() => null) || { id: EDITORIAL_STATE_ID, items: [] };
  const slot = Math.floor(Number(scheduledAt || now) / (15 * 60 * 1000));
  const query = HEALTH_QUERIES[slot % HEALTH_QUERIES.length];
  const candidates = await fetchHealthCandidates(query, now);

  let chosen = null;
  for (const candidate of candidates.slice(0, 10)) {
    if (isDuplicateNews(candidate, state.items || [], now)) continue;
    chosen = await enrichArticle(candidate);
    if (!isDuplicateNews(chosen, state.items || [], now)) break;
    chosen = null;
  }

  if (!chosen) {
    console.info('Uorqui health live news skipped', { query, candidates: candidates.length, result: 'no-publishable-candidate' });
    return;
  }

  const text = await generateHealthText(env, chosen);
  if (!text) return;

  const createdAt = new Date(now).toISOString();
  const postId = `uorqui_ai_live_saude_${now}_${crypto.randomUUID().slice(0, 8)}`;
  const post = {
    id: postId,
    authorUid: HEALTH_AGENT_UID,
    authorName: 'Lia · Saúde',
    authorAccountType: 'uorqui_agent',
    authorAiAssisted: true,
    authorTeamLabel: 'Equipe Uorqui · IA',
    scope: 'community',
    companyId: '',
    communityId: HEALTH_COMMUNITY_ID,
    communityName: 'Saúde',
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
    sourceImageUrl: chosen.imageUrl || '',
    sourceImageUrls: chosen.imageUrl ? [chosen.imageUrl] : [],
    sourcePublishedAt: chosen.publishedAt || '',
    sourceHeadline: chosen.title || '',
    newsTopicKey: topicTokens(chosen.title || '').slice().sort().join('|'),
    createdAt,
    updatedAt: createdAt
  };

  await fsPut(env, 'posts', postId, post);
  state.items = [stateItem(chosen, createdAt), ...(Array.isArray(state.items) ? state.items : [])].slice(0, MAX_STATE_ITEMS);
  state.lastPublishedAt = createdAt;
  state.updatedAt = createdAt;
  await fsPut(env, 'systemConfig', EDITORIAL_STATE_ID, state);

  console.info('Uorqui health live news published', { postId, query, source: chosen.source || '' });
}

async function fetchHealthCandidates(query, now) {
  const [google, bing] = await Promise.all([
    fetchGoogleNews(query).catch(() => []),
    fetchBingNews(query).catch(() => [])
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
      const key = `${normalizeHeadline(item.title)}|${normalizeNewsUrl(item.link)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}

async function fetchGoogleNews(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:2d`)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  const response = await globalThis.fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UorquiNews/2.5)', 'Accept': 'application/rss+xml,application/xml,text/xml,*/*' } });
  if (!response.ok) throw new Error(`Google News HTTP ${response.status}`);
  return parseNewsItems(await response.text(), 'Google Notícias');
}

async function fetchBingNews(query) {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&setlang=pt-br&cc=br`;
  const response = await globalThis.fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UorquiNews/2.5)', 'Accept': 'application/rss+xml,application/xml,text/xml,*/*' } });
  if (!response.ok) throw new Error(`Bing News HTTP ${response.status}`);
  return parseNewsItems(await response.text(), 'Bing Notícias');
}

function parseNewsItems(xml, fallbackSource = '') {
  const items = [...String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 25);
  return items.map(match => {
    const raw = match[1];
    const title = decodeXmlText(raw.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
    const link = decodeXmlText(raw.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '');
    const pubDate = decodeXmlText(raw.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '');
    const source = decodeXmlText(raw.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || '') || fallbackSource;
    const description = decodeXmlText(raw.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '');
    const media = raw.match(/<(?:media:content|media:thumbnail|enclosure)[^>]+(?:url|href)=["']([^"']+)["']/i)?.[1] || '';
    let publishedAt = '';
    try {
      const date = new Date(pubDate);
      if (Number.isFinite(date.getTime())) publishedAt = date.toISOString();
    } catch {}
    return { title, link, canonicalUrl: link, source, publishedAt, description, imageUrl: decodeXmlText(media) };
  }).filter(item => item.title && item.link);
}

async function enrichArticle(news) {
  const base = { ...news, canonicalUrl: news.canonicalUrl || news.link || '' };
  if (!/^https?:\/\//i.test(base.link || '')) return base;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await globalThis.fetch(base.link, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UorquiNews/2.5)', 'Accept': 'text/html,application/xhtml+xml' }
    });
    clearTimeout(timer);
    if (!response.ok) return base;
    const html = (await response.text()).slice(0, 700000);
    const finalUrl = response.url || base.link;
    const meta = name => metaContent(html, name);
    const canonical = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] || finalUrl;
    const imageUrl = meta('og:image') || meta('twitter:image') || base.imageUrl || '';
    const description = meta('og:description') || meta('description') || base.description || '';
    const bodyText = extractArticleText(html, description);
    return {
      ...base,
      canonicalUrl: canonical,
      source: meta('og:site_name') || base.source || '',
      imageUrl: /^https?:\/\//i.test(imageUrl) ? imageUrl : '',
      articleText: bodyText
    };
  } catch {
    return base;
  }
}

async function generateHealthText(env, news) {
  const source = news.source || 'a fonte original';
  const context = String(news.articleText || news.description || '').slice(0, 6500);
  if (env.AI) {
    const prompt = [
      'Você é Lia, editora de Saúde da rede social brasileira Uorqui, assistida por IA.',
      'Escreva uma notícia factual e autossuficiente em português do Brasil.',
      'Use somente o material fornecido. Não invente números, riscos, benefícios, diagnósticos ou recomendações.',
      'Não dê aconselhamento médico individual e não transforme a notícia em orientação de tratamento.',
      'Resuma em 2 a 4 parágrafos curtos, preferencialmente entre 650 e 1200 caracteres.',
      'Cite a fonte no texto. Não use markdown, hashtags nem termine com pergunta.',
      `MANCHETE: ${news.title}`,
      `FONTE: ${source}`,
      `PUBLICADA EM: ${news.publishedAt || 'recentemente'}`,
      context ? `CONTEXTO DA MATÉRIA:\n${context}` : ''
    ].filter(Boolean).join('\n');

    for (const model of ['@cf/zai-org/glm-4.7-flash', '@cf/meta/llama-3.1-8b-instruct-fast']) {
      try {
        const result = await env.AI.run(model, {
          messages: [
            { role: 'system', content: 'Priorize precisão jornalística. Informação de saúde deve ser apresentada como notícia, nunca como diagnóstico ou prescrição.' },
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

function extractArticleText(html, description = '') {
  const paragraphs = [];
  const desc = cleanSpaces(description);
  if (desc.length >= 60) paragraphs.push(desc);
  const body = String(html || '')
    .replace(/<(script|style|noscript|svg|nav|footer|form|aside)\b[\s\S]*?<\/\1>/gi, ' ');
  for (const match of body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = cleanSpaces(decodeHtml(String(match[1] || '').replace(/<[^>]+>/g, ' ')));
    if (text.length < 60 || text.length > 1400) continue;
    if (/cookies?|newsletter|assine|publicidade|anúncio|termos de uso|política de privacidade/i.test(text)) continue;
    if (!paragraphs.includes(text)) paragraphs.push(text);
    if (paragraphs.join('\n').length >= 6500) break;
  }
  return paragraphs.join('\n').slice(0, 6500);
}

function isDuplicateNews(news, previousItems = [], now = Date.now()) {
  const current = stateItem(news, news.publishedAt || new Date(now).toISOString());
  for (const previous of previousItems) {
    if (current.url && previous.url && current.url === previous.url) return true;
    if (current.headline && previous.headline && current.headline === previous.headline) return true;
    const stamp = new Date(previous.createdAt || previous.publishedAt || 0).getTime();
    if (!Number.isFinite(stamp) || now - stamp > SEMANTIC_WINDOW) continue;
    if (sameTopic(current.tokens, Array.isArray(previous.tokens) ? previous.tokens : topicTokens(previous.headline || ''))) return true;
  }
  return false;
}

function stateItem(news, createdAt = new Date().toISOString()) {
  const tokens = topicTokens(news.title || '');
  return {
    url: normalizeNewsUrl(news.canonicalUrl || news.link || ''),
    headline: normalizeHeadline(news.title || ''),
    tokens,
    topicKey: tokens.slice().sort().join('|'),
    publishedAt: news.publishedAt || '',
    createdAt
  };
}

function sameTopic(a = [], b = []) {
  if (a.length < 3 || b.length < 3) return false;
  const left = new Set(a), right = new Set(b);
  let common = 0;
  for (const token of left) if (right.has(token)) common += 1;
  const minCoverage = common / Math.min(left.size, right.size);
  const union = new Set([...left, ...right]).size || 1;
  const jaccard = common / union;
  return (common >= 4 && minCoverage >= 0.5) || (common >= 3 && minCoverage >= 0.66) || jaccard >= 0.56;
}

function topicTokens(value = '') {
  const sourceFree = String(value).replace(/\s[-–—]\s[^-–—]{2,45}$/u, '');
  return [...new Set(normalizeHeadline(sourceFree).split(' ')
    .filter(token => token.length >= 3)
    .filter(token => !STOPWORDS.has(token))
    .filter(token => !/^\d{1,2}$/.test(token)))]
    .slice(0, 14);
}

function normalizeHeadline(value = '') {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function normalizeNewsUrl(value = '') {
  try {
    const url = new URL(String(value || ''));
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    return `${url.origin}${url.pathname}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''}`.replace(/\/$/, '');
  } catch {
    return String(value || '').trim();
  }
}

function metaContent(html, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const direct = String(html || '').match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'));
  const reverse = String(html || '').match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'));
  return cleanSpaces(decodeHtml(direct?.[1] || reverse?.[1] || ''));
}

function decodeXmlText(value = '') {
  return decodeHtml(String(value || '').replace(/^<!\[CDATA\[|\]\]>$/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function decodeHtml(value = '') {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16) || 32))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number) || 32));
}

function cleanSpaces(value = '') { return String(value || '').replace(/\s+/g, ' ').trim(); }
function clean(value, max = 1000) { return String(value || '').replace(/\u0000/g, '').trim().slice(0, max); }
function brazilDateKey(date = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }

function extractAiText(result) {
  if (typeof result === 'string') return result.trim();
  if (!result || typeof result !== 'object') return '';
  const values = [result.response, result.output_text, result.text, result.result?.response, result.result?.text, result.choices?.[0]?.message?.content, result.choices?.[0]?.text];
  for (const value of values) if (typeof value === 'string' && value.trim()) return value.trim();
  return '';
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
  const claims = b64urlJson({ iss: credentials.email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const input = `${header}.${claims}`;
  const key = await importPrivateKey(credentials.privateKey);
  const signature = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(input));
  const assertion = `${input}.${b64url(new Uint8Array(signature))}`;
  const response = await globalThis.fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(`Firebase Service Account recusada: ${data.error_description || data.error || response.status}`);
  googleTokenCache = { token: data.access_token, expires: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return googleTokenCache.token;
}

async function importPrivateKey(pem) {
  const value = String(pem).replace(/\\n/g, '\n').replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s/g, '');
  const bytes = Uint8Array.from(atob(value), char => char.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', bytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}
function b64urlJson(value) { return b64url(new TextEncoder().encode(JSON.stringify(value))); }
function b64url(bytes) { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function fsBase(env) { return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)`; }

async function fsRequest(env, path, options = {}) {
  const token = await getGoogleAccessToken(env);
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await globalThis.fetch(`${fsBase(env)}${path}`, { ...options, headers });
  if (response.status === 404) return null;
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(`Firestore HTTP ${response.status}: ${data?.error?.message || text || 'erro'}`);
  return data;
}

async function fsGet(env, collection, docId) {
  const doc = await fsRequest(env, `/documents/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`);
  return doc ? fromDoc(doc) : null;
}
async function fsPut(env, collection, docId, object) {
  const doc = await fsRequest(env, `/documents/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`, { method: 'PATCH', body: JSON.stringify({ fields: toFields({ ...object, id: object.id || docId }) }) });
  return fromDoc(doc);
}
async function fsListCollection(env, collection, limit = 300) {
  const data = await fsRequest(env, `/documents/${encodeURIComponent(collection)}?pageSize=${Math.min(500, Math.max(1, limit))}`);
  return (data?.documents || []).map(fromDoc);
}
function fromDoc(document) { if (!document) return null; const object = fromFields(document.fields || {}); object.id = object.id || decodeURIComponent(String(document.name || '').split('/').pop() || ''); return object; }
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
function fromFields(fields) { return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromValue(value)])); }
function fromValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(fromValue);
  if ('mapValue' in value) return fromFields(value.mapValue?.fields || {});
  return null;
}
