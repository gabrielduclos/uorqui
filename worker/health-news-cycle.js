const HEALTH_COMMUNITY_ID = 'uorqui_ai_community_saude';
const HEALTH_AGENT_UID = 'uorqui_ai_agent_saude';
const EDITORIAL_STATE_ID = 'uorqui_ai_live_news_state_v1';
const FRESH_WINDOW = 48 * 60 * 60 * 1000;
const SEMANTIC_WINDOW = 72 * 60 * 60 * 1000;
const MAX_STATE_ITEMS = 450;
let googleTokenCache = { token: '', expires: 0 };

const HEALTH_QUERIES = [
  'saúde medicina prevenção Brasil',
  'saúde pública SUS Brasil',
  'pesquisa médica saúde Brasil',
  'vacinação doenças prevenção saúde Brasil',
  'medicamentos Anvisa saúde Brasil',
  'hospitais saúde ciência médica Brasil',
  'doenças prevenção epidemiologia Brasil',
  'bem-estar saúde mental pesquisa Brasil'
];

const STOPWORDS = new Set([
  'a','o','as','os','um','uma','uns','umas','de','da','do','das','dos','e','em','no','na','nos','nas','para','por','com','sem','sobre','que','se','ao','aos','mais','menos','novo','nova','novos','novas','após','antes','como','contra','entre','até','ja','já','ainda','pode','podem','vai','vão','tem','ter','foi','ser','são','é','esta','este','essa','esse','isso','sua','seu','suas','seus','notícia','noticias','notícias','veja','saiba','entenda','diz','dizem','segundo','hoje','saúde','brasil'
]);

export async function runHealthNewsCycle(env, scheduledAt = Date.now()) {
  const now = Date.now();
  const hourSlot = Math.floor(Number(scheduledAt || now) / (60 * 60 * 1000));
  const queryIndexes = [hourSlot % HEALTH_QUERIES.length, (hourSlot + 3) % HEALTH_QUERIES.length];
  const queries = queryIndexes.map(index => HEALTH_QUERIES[index]);

  const recentPosts = await fsWhere(env, 'posts', 'communityId', HEALTH_COMMUNITY_ID, 160).catch(() => []);
  const recentHealth = recentPosts
    .filter(post => post?.authorUid === HEALTH_AGENT_UID || post?.authorAccountType === 'uorqui_agent')
    .filter(post => post?.aiContentMode === 'news' && post?.sourceHeadline)
    .filter(post => !post?.deletedAt && !post?.deletedByAdmin)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  const candidateGroups = await Promise.all(queries.flatMap(query => [
    fetchGoogleNews(query).catch(error => {
      console.warn('Uorqui health Google source failed:', error?.message || error);
      return [];
    }),
    fetchBingNews(query).catch(error => {
      console.warn('Uorqui health Bing source failed:', error?.message || error);
      return [];
    })
  ]));

  const candidates = uniqueCandidates(candidateGroups.flat(), now);
  let duplicates = 0;
  let attempted = 0;
  let chosen = null;

  for (const candidate of candidates.slice(0, 18)) {
    attempted += 1;
    if (isDuplicateAgainstHealth(candidate, recentHealth, now)) {
      duplicates += 1;
      continue;
    }

    const enriched = await enrichHealthCandidate(candidate).catch(() => candidate);
    if (isDuplicateAgainstHealth(enriched, recentHealth, now)) {
      duplicates += 1;
      continue;
    }

    chosen = enriched;
    break;
  }

  if (!chosen) {
    console.info('Uorqui health live news skipped', {
      queries,
      querySlots: queryIndexes,
      candidates: candidates.length,
      attempted,
      duplicates,
      recentHealth: recentHealth.length,
      result: candidates.length ? 'no-publishable-candidate' : 'no-fresh-candidate'
    });
    if (hourSlot % 6 === 0) await reconcileEditorialStateLight(env).catch(error => console.warn('Uorqui light editorial reconciliation failed:', error?.message || error));
    return { published: false, candidates: candidates.length, duplicates };
  }

  const text = await generateHealthText(env, chosen);
  if (!text) {
    console.info('Uorqui health live news skipped', { queries, result: 'empty-text' });
    return { published: false, candidates: candidates.length, duplicates };
  }

  const createdAt = new Date(now).toISOString();
  const postId = `uorqui_ai_live_saude_${now}_${crypto.randomUUID().slice(0, 8)}`;
  const post = {
    id: postId,
    authorUid: HEALTH_AGENT_UID,
    authorName: 'Lia · Saúde',
    authorAvatarMediaId: '',
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
  await rememberInEditorialState(env, chosen, createdAt).catch(error => console.warn('Uorqui health editorial memory failed:', error?.message || error));

  if (hourSlot % 6 === 0) {
    await reconcileEditorialStateLight(env).catch(error => console.warn('Uorqui light editorial reconciliation failed:', error?.message || error));
  }

  console.info('Uorqui health live news published', {
    postId,
    queries,
    querySlots: queryIndexes,
    source: chosen.source || '',
    candidates: candidates.length,
    attempted,
    duplicates
  });
  return { published: true, postId };
}

function uniqueCandidates(items, now) {
  const seen = new Set();
  return (items || [])
    .filter(item => item?.title && item?.link)
    .filter(item => {
      const stamp = new Date(item.publishedAt || 0).getTime();
      return Number.isFinite(stamp) && stamp > 0 && now - stamp <= FRESH_WINDOW && stamp <= now + 15 * 60 * 1000;
    })
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
    .filter(item => {
      const key = `${normalizeHeadline(item.title)}|${normalizeNewsUrl(item.link)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 40);
}

async function fetchGoogleNews(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:2d`)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UorquiNews/3.0)', 'Accept': 'application/rss+xml,application/xml,text/xml,*/*' } });
  if (!response.ok) throw new Error(`Google News HTTP ${response.status}`);
  return parseNewsItems(await response.text(), 'Google Notícias');
}

async function fetchBingNews(query) {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&setlang=pt-br&cc=br`;
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UorquiNews/3.0)', 'Accept': 'application/rss+xml,application/xml,text/xml,*/*' } });
  if (!response.ok) throw new Error(`Bing News HTTP ${response.status}`);
  return parseNewsItems(await response.text(), 'Bing Notícias');
}

function parseNewsItems(xml, fallbackSource = '') {
  const items = [...String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 25);
  return items.map(match => {
    const raw = match[1] || '';
    const title = decodeXml(raw.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
    const link = decodeXml(raw.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '');
    const pubDate = decodeXml(raw.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '');
    const source = decodeXml(raw.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || '') || fallbackSource;
    const description = cleanText(decodeXml(raw.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '').replace(/<[^>]+>/g, ' '));
    const media = decodeXml(raw.match(/<(?:media:content|media:thumbnail|enclosure)[^>]+(?:url|href)=["']([^"']+)["']/i)?.[1] || '');
    let publishedAt = '';
    try {
      const date = new Date(pubDate);
      if (Number.isFinite(date.getTime())) publishedAt = date.toISOString();
    } catch {}
    return { title, link, canonicalUrl: link, source, description, imageUrl: media, publishedAt };
  }).filter(item => item.title && item.link);
}

async function enrichHealthCandidate(candidate) {
  let sourceUrl = directPublisherUrl(candidate.link) || candidate.link;
  if (isAggregator(sourceUrl)) {
    sourceUrl = await resolvePublisherArticle(candidate).catch(() => '') || sourceUrl;
  }

  if (!/^https?:\/\//i.test(sourceUrl) || isAggregator(sourceUrl)) {
    return { ...candidate, canonicalUrl: sourceUrl || candidate.link };
  }

  try {
    const response = await fetchWithTimeout(sourceUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UorquiNews/3.0)', 'Accept': 'text/html,application/xhtml+xml' }
    }, 5500);
    if (!response?.ok) return { ...candidate, canonicalUrl: sourceUrl };
    const html = (await response.text()).slice(0, 650000);
    const finalUrl = response.url || sourceUrl;
    const canonical = resolveUrl(metaLink(html, 'canonical') || finalUrl, finalUrl) || finalUrl;
    const description = metaContent(html, 'og:description') || metaContent(html, 'description') || candidate.description || '';
    const articleText = extractArticleText(html, description);
    const imageUrl = resolveUrl(metaContent(html, 'og:image') || metaContent(html, 'twitter:image') || candidate.imageUrl || '', finalUrl);
    return {
      ...candidate,
      canonicalUrl: canonical,
      source: metaContent(html, 'og:site_name') || candidate.source || safeHost(finalUrl),
      description: cleanText(description),
      articleText,
      imageUrl
    };
  } catch {
    return { ...candidate, canonicalUrl: sourceUrl };
  }
}

async function resolvePublisherArticle(candidate) {
  const query = `"${candidate.title}" ${candidate.source || ''}`.trim();
  const results = await fetchBingNews(query);
  let best = '';
  let bestScore = 0;
  const expected = new Set(topicTokens(candidate.title || ''));
  for (const item of results.slice(0, 12)) {
    const direct = directPublisherUrl(item.link) || (!isAggregator(item.link) ? item.link : '');
    if (!direct) continue;
    const tokens = new Set(topicTokens(item.title || ''));
    let common = 0;
    for (const token of expected) if (tokens.has(token)) common += 1;
    const score = common / Math.max(1, Math.min(expected.size || 1, tokens.size || 1));
    if (score > bestScore) { bestScore = score; best = direct; }
  }
  return bestScore >= 0.55 ? best : '';
}

function isDuplicateAgainstHealth(news, recentPosts, now) {
  const url = normalizeNewsUrl(news.canonicalUrl || news.link || '');
  const headline = normalizeHeadline(news.title || '');
  const tokens = topicTokens(news.title || '');
  for (const post of recentPosts || []) {
    const previousUrl = normalizeNewsUrl(post.sourceUrl || '');
    const previousHeadline = normalizeHeadline(post.sourceHeadline || '');
    if (url && previousUrl && url === previousUrl) return true;
    if (headline && previousHeadline && headline === previousHeadline) return true;
    const stamp = new Date(post.createdAt || post.sourcePublishedAt || 0).getTime();
    if (!Number.isFinite(stamp) || now - stamp > SEMANTIC_WINDOW) continue;
    if (sameTopic(tokens, topicTokens(post.sourceHeadline || ''))) return true;
  }
  return false;
}

function sameTopic(a = [], b = []) {
  if (a.length < 3 || b.length < 3) return false;
  const left = new Set(a), right = new Set(b);
  let common = 0;
  for (const token of left) if (right.has(token)) common += 1;
  const minCoverage = common / Math.max(1, Math.min(left.size, right.size));
  const union = new Set([...left, ...right]).size || 1;
  const jaccard = common / union;
  return (common >= 4 && minCoverage >= 0.55) || (common >= 3 && minCoverage >= 0.72) || jaccard >= 0.62;
}

async function generateHealthText(env, news) {
  const source = news.source || 'a fonte original';
  const context = String(news.articleText || news.description || '').slice(0, 6500);
  if (env?.AI) {
    const prompt = [
      'Você é Lia, editora de Saúde da rede social brasileira Uorqui, assistida por IA.',
      'Produza uma notícia factual em português do Brasil com 2 a 4 parágrafos curtos.',
      'Use somente a manchete e o contexto fornecidos. Não invente dados, riscos, benefícios ou recomendações.',
      'Não ofereça diagnóstico, prescrição ou aconselhamento médico individual.',
      'Explique por que a informação é relevante sem sensacionalismo.',
      'Cite a fonte no texto. Não use markdown, hashtags nem termine com pergunta.',
      `MANCHETE: ${news.title}`,
      `FONTE: ${source}`,
      `PUBLICADA EM: ${news.publishedAt || 'recentemente'}`,
      context ? `CONTEXTO:\n${context}` : ''
    ].filter(Boolean).join('\n');

    for (const model of ['@cf/zai-org/glm-4.7-flash', '@cf/meta/llama-3.1-8b-instruct-fast']) {
      try {
        const result = await env.AI.run(model, {
          messages: [
            { role: 'system', content: 'Trate saúde como informação jornalística. Seja preciso e não extrapole a fonte.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.12,
          ...(model.includes('llama-3.1') ? { max_tokens: 520 } : { max_completion_tokens: 520 })
        });
        const text = extractAiText(result);
        if (text) return text.slice(0, 1800).trim();
      } catch {}
    }
  }
  const headline = cleanText(news.title || '').replace(/[.!?]+$/g, '');
  return headline ? `Segundo ${source}, ${headline}.` : '';
}

async function rememberInEditorialState(env, news, createdAt) {
  const state = await fsGet(env, 'systemConfig', EDITORIAL_STATE_ID).catch(() => null) || { id: EDITORIAL_STATE_ID, initialized: true, items: [] };
  const item = editorialItem(news, createdAt, HEALTH_COMMUNITY_ID);
  state.items = [item, ...(Array.isArray(state.items) ? state.items : [])].slice(0, MAX_STATE_ITEMS);
  state.lastPublishedAt = createdAt;
  state.updatedAt = createdAt;
  await fsPut(env, 'systemConfig', EDITORIAL_STATE_ID, state);
}

async function reconcileEditorialStateLight(env) {
  const [state, posts] = await Promise.all([
    fsGet(env, 'systemConfig', EDITORIAL_STATE_ID).catch(() => null),
    fsListCollection(env, 'posts', 500).catch(() => [])
  ]);
  const active = posts
    .filter(post => post?.authorAccountType === 'uorqui_agent' && post?.aiContentMode === 'news' && post?.sourceHeadline)
    .filter(post => !post?.deletedAt && !post?.deletedByAdmin)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, MAX_STATE_ITEMS);
  const items = active.map(post => editorialItem({
    title: post.sourceHeadline || '',
    canonicalUrl: post.sourceUrl || '',
    link: post.sourceUrl || '',
    publishedAt: post.sourcePublishedAt || post.createdAt || ''
  }, post.createdAt || new Date().toISOString(), post.communityId || ''));
  const next = {
    ...(state || {}),
    id: EDITORIAL_STATE_ID,
    initialized: true,
    items,
    reconciledFromFeedAt: new Date().toISOString(),
    reconciledFeedCount: active.length,
    updatedAt: new Date().toISOString()
  };
  await fsPut(env, 'systemConfig', EDITORIAL_STATE_ID, next);
  console.info('Uorqui editorial memory reconciled with feed (light)', { activeNews: active.length, items: items.length });
}

function editorialItem(news, createdAt, communityId = '') {
  const tokens = topicTokens(news.title || '');
  return {
    url: normalizeNewsUrl(news.canonicalUrl || news.link || ''),
    headline: normalizeHeadline(news.title || ''),
    tokens,
    topicKey: tokens.slice().sort().join('|'),
    communityId,
    publishedAt: news.publishedAt || '',
    createdAt
  };
}

function extractArticleText(html, description = '') {
  const paragraphs = [];
  const desc = cleanText(description);
  if (desc.length >= 70) paragraphs.push(desc);
  const body = String(html || '').replace(/<(script|style|noscript|svg|nav|footer|form|aside)\b[\s\S]*?<\/\1>/gi, ' ');
  for (const match of body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = cleanText(decodeHtml(String(match[1] || '').replace(/<[^>]+>/g, ' ')));
    if (text.length < 70 || text.length > 1400) continue;
    if (/cookies?|newsletter|assine|publicidade|anúncio|termos de uso|política de privacidade/i.test(text)) continue;
    if (!paragraphs.includes(text)) paragraphs.push(text);
    if (paragraphs.join('\n').length >= 6500) break;
  }
  return paragraphs.join('\n').slice(0, 6500);
}

function topicTokens(value) {
  return normalizeHeadline(value).split(' ').filter(token => token.length >= 4 && !STOPWORDS.has(token)).slice(0, 18);
}

function normalizeHeadline(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeNewsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|fbclid|gclid|mc_|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    return `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}${url.search}`.toLowerCase();
  } catch { return String(value || '').trim().toLowerCase(); }
}

function directPublisherUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!isAggregator(url.toString())) return url.toString();
    for (const key of ['url','u','r','target','redirect','redirect_url']) {
      const nested = url.searchParams.get(key);
      if (!nested) continue;
      const decoded = safeDecode(nested);
      if (/^https?:\/\//i.test(decoded) && !isAggregator(decoded)) return decoded;
    }
  } catch {}
  return '';
}

function isAggregator(value) {
  const host = safeHost(value);
  return /(?:^|\.)news\.google\./i.test(host) || /(?:^|\.)google\.com$/i.test(host) || /(?:^|\.)bing\.com$/i.test(host) || /(?:^|\.)msn\.com$/i.test(host);
}

function metaContent(html, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const a = String(html || '').match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1];
  const b = String(html || '').match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'))?.[1];
  return decodeHtml(a || b || '');
}

function metaLink(html, rel) {
  const escaped = String(rel).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return decodeHtml(String(html || '').match(new RegExp(`<link[^>]+rel=["']${escaped}["'][^>]+href=["']([^"']+)["']`, 'i'))?.[1] || '');
}

function resolveUrl(value, base) {
  const raw = decodeHtml(value || '');
  if (!raw || /^data:|^blob:/i.test(raw)) return '';
  try { return new URL(raw, base).toString(); } catch { return ''; }
}

function extractAiText(result) {
  const candidates = [result?.response, result?.result?.response, result?.text, result?.output_text, result?.choices?.[0]?.message?.content];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const joined = value.map(item => typeof item === 'string' ? item : item?.text || item?.content || '').filter(Boolean).join('\n').trim();
      if (joined) return joined;
    }
  }
  return '';
}

async function fetchWithTimeout(url, options, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function fsRequest(env, path, options = {}) {
  const token = await getGoogleAccessToken(env);
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${fsBase(env)}${path}`, { ...options, headers });
  if (response.status === 404) return null;
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(`Firestore: ${data?.error?.message || response.statusText}`);
  return data;
}

async function fsGet(env, collection, docId) {
  const doc = await fsRequest(env, `/documents/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`);
  return doc ? fromDoc(doc) : null;
}

async function fsPut(env, collection, docId, object) {
  const doc = await fsRequest(env, `/documents/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: toFields({ ...object, id: object.id || docId }) })
  });
  return doc ? fromDoc(doc) : object;
}

async function fsWhere(env, collection, field, value, limit = 100) {
  const body = { structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: toValue(value) } }, limit } };
  const rows = await fsRequest(env, '/documents:runQuery', { method: 'POST', body: JSON.stringify(body) });
  return (Array.isArray(rows) ? rows : []).filter(row => row.document).map(row => fromDoc(row.document));
}

async function fsListCollection(env, collection, maxItems = 500) {
  const items = [];
  let pageToken = '';
  while (items.length < maxItems) {
    const params = new URLSearchParams({ pageSize: String(Math.min(500, maxItems - items.length)) });
    if (pageToken) params.set('pageToken', pageToken);
    const result = await fsRequest(env, `/documents/${encodeURIComponent(collection)}?${params.toString()}`);
    for (const doc of result?.documents || []) {
      items.push(fromDoc(doc));
      if (items.length >= maxItems) break;
    }
    pageToken = result?.nextPageToken || '';
    if (!pageToken) break;
  }
  return items;
}

function fsBase(env) { return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)`; }

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
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(`Google OAuth: ${data.error_description || data.error || response.status}`);
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
  const clean = String(pem).replace(/\\n/g, '\n').replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\s/g, '');
  const bytes = Uint8Array.from(atob(clean), char => char.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', bytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

function b64urlJson(value) { return b64url(new TextEncoder().encode(JSON.stringify(value))); }
function b64url(bytes) { let value = ''; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

function fromDoc(doc) { const object = fromFields(doc.fields || {}); object.id = object.id || decodeURIComponent(String(doc.name || '').split('/').pop() || ''); return object; }
function fromFields(fields) { return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, fromValue(value)])); }
function fromValue(value) { if ('stringValue' in value) return value.stringValue; if ('booleanValue' in value) return value.booleanValue; if ('integerValue' in value) return Number(value.integerValue); if ('doubleValue' in value) return Number(value.doubleValue); if ('timestampValue' in value) return value.timestampValue; if ('nullValue' in value) return null; if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromValue); if ('mapValue' in value) return fromFields(value.mapValue.fields || {}); return null; }
function toFields(object) { return Object.fromEntries(Object.entries(object || {}).filter(([, value]) => value !== undefined).map(([key, value]) => [key, toValue(value)])); }
function toValue(value) { if (value === null) return { nullValue: null }; if (typeof value === 'string') return { stringValue: value }; if (typeof value === 'boolean') return { booleanValue: value }; if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }; if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } }; if (typeof value === 'object') return { mapValue: { fields: toFields(value) } }; return { stringValue: String(value) }; }

function cleanText(value) { return decodeHtml(String(value || '')).replace(/\s+/g, ' ').trim(); }
function safeHost(value) { try { return new URL(String(value || '')).hostname.toLowerCase(); } catch { return ''; } }
function safeDecode(value) { try { return decodeURIComponent(String(value || '')); } catch { return String(value || ''); } }
function decodeXml(value) { return decodeHtml(String(value || '').replace(/^<!\[CDATA\[|\]\]>$/g, '')); }
function decodeHtml(value) { return String(value || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16) || 32)).replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number) || 32)).trim(); }
