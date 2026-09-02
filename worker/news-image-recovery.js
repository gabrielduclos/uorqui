const nativeFetch = globalThis.fetch.bind(globalThis);
const MAX_IMAGES = 4;
const CACHE_TTL = 4 * 60 * 1000;
const htmlCache = new Map();

// Camada de recuperação: roda antes do sanitizador principal. Quando o
// sanitizador não reconhece a marcação editorial de um publisher, reaproveita
// o HTML já buscado da URL direta da matéria e recupera somente imagens
// vinculadas à página da reportagem.
globalThis.fetch = async (input, init) => {
  const requestUrl = input instanceof Request ? input.url : String(input || '');
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

  if (method === 'PATCH' && isPostWrite(requestUrl) && typeof init?.body === 'string') {
    try {
      const payload = JSON.parse(init.body);
      const fields = payload?.fields;
      if (fields && stringField(fields, 'aiContentMode') === 'news') {
        const current = arrayField(fields, 'sourceImageUrls');
        const primary = stringField(fields, 'sourceImageUrl');
        const sourceUrl = stringField(fields, 'sourceUrl');
        const existing = uniqueImages([primary, ...current]).filter(isUsefulImage);

        if (!existing.length && /^https?:\/\//i.test(sourceUrl) && !isAggregator(sourceUrl)) {
          const cached = getCachedHtml(sourceUrl);
          const recovered = cached ? extractImages(cached.html, cached.finalUrl || sourceUrl) : [];
          if (recovered.length) {
            fields.sourceImageUrl = { stringValue: recovered[0] };
            fields.sourceImageUrls = {
              arrayValue: { values: recovered.map(url => ({ stringValue: url })) }
            };
            console.info('Uorqui article image recovered', {
              host: safeHost(sourceUrl),
              images: recovered.length
            });
            init = { ...init, body: JSON.stringify(payload) };
          }
        }
      }
    } catch (error) {
      console.warn('Uorqui article image recovery failed:', error?.message || error);
    }
  }

  const response = await nativeFetch(input, init);

  // O sanitizador de imagens já abre a matéria. Guardamos uma cópia curta por
  // alguns minutos para não fazer uma segunda subrequest só para recuperar OG.
  try {
    if (method === 'GET' && response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        const finalUrl = response.url || requestUrl;
        if (/^https?:\/\//i.test(finalUrl) && !isAggregator(finalUrl)) {
          const html = (await response.clone().text()).slice(0, 1000000);
          rememberHtml(requestUrl, finalUrl, html);
        }
      }
    }
  } catch {}

  return response;
};

function isPostWrite(value) {
  return /firestore\.googleapis\.com\/v1\/projects\/[^/]+\/databases\/\(default\)\/documents\/posts\//i.test(String(value || ''));
}

function rememberHtml(requestedUrl, finalUrl, html) {
  const record = { html: String(html || ''), finalUrl, at: Date.now() };
  for (const key of [normalizeUrl(requestedUrl), normalizeUrl(finalUrl)]) {
    if (key) htmlCache.set(key, record);
  }
  const now = Date.now();
  for (const [key, item] of htmlCache) {
    if (now - Number(item?.at || 0) > CACHE_TTL) htmlCache.delete(key);
  }
  while (htmlCache.size > 30) htmlCache.delete(htmlCache.keys().next().value);
}

function getCachedHtml(value) {
  const key = normalizeUrl(value);
  const item = key ? htmlCache.get(key) : null;
  if (!item) return null;
  if (Date.now() - Number(item.at || 0) > CACHE_TTL) {
    htmlCache.delete(key);
    return null;
  }
  return item;
}

function extractImages(html, baseUrl) {
  const source = String(html || '');
  const candidates = [];

  // 1. Fotos que realmente aparecem dentro do conteúdo editorial.
  const regions = articleRegions(source);
  for (const region of regions) {
    for (const match of region.matchAll(/<img\b([^>]*)>/gi)) {
      const attrs = match[1] || '';
      if (isNonEditorialTag(attrs)) continue;
      const srcset = attr(attrs, 'srcset') || attr(attrs, 'data-srcset');
      const srcsetUrl = largestSrcset(srcset);
      if (srcsetUrl) candidates.push(resolveUrl(srcsetUrl, baseUrl));
      const src = attr(attrs, 'src') || attr(attrs, 'data-src') || attr(attrs, 'data-lazy-src') || attr(attrs, 'data-original');
      if (src) candidates.push(resolveUrl(src, baseUrl));
    }
  }

  // 2. JSON-LD do próprio NewsArticle/Article.
  for (const match of source.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collectArticleJsonImages(JSON.parse(decodeHtml(match[1] || '')), candidates, false, baseUrl); }
    catch {}
  }

  // 3. A URL já foi resolvida para o publisher, então OG/Twitter é um fallback
  // seguro para a foto principal quando o HTML do corpo usa marcação incomum.
  for (const match of source.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image(?::url)?|twitter:image(?::src)?)["'][^>]+content=["']([^"']+)["']/gi)) {
    candidates.push(resolveUrl(match[1], baseUrl));
  }
  for (const match of source.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image(?::url)?|twitter:image(?::src)?)["']/gi)) {
    candidates.push(resolveUrl(match[1], baseUrl));
  }

  return uniqueImages(candidates.filter(Boolean)).filter(isUsefulImage).slice(0, MAX_IMAGES);
}

function articleRegions(source) {
  const regions = [...String(source || '').matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)]
    .map(match => match[1]).filter(Boolean);
  if (regions.length) return regions;

  const html = String(source || '');
  const markers = [
    /itemprop=["']articleBody["']/i,
    /(?:class|id)=["'][^"']*(?:article[-_ ]?(?:body|content)|story[-_ ]?body|entry[-_ ]?content|post[-_ ]?content|content[-_ ]?body|materia[-_ ]?(?:corpo|conteudo)|noticia[-_ ]?(?:corpo|conteudo))[^"']*["']/i
  ];
  for (const marker of markers) {
    const match = marker.exec(html);
    if (!match || match.index < 0) continue;
    return [html.slice(Math.max(0, match.index - 1200), Math.min(html.length, match.index + 220000))];
  }
  return [];
}

function collectArticleJsonImages(value, output, inheritedArticle, baseUrl) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach(item => collectArticleJsonImages(item, output, inheritedArticle, baseUrl));
    return;
  }
  if (typeof value !== 'object') return;
  const rawType = value['@type'];
  const types = Array.isArray(rawType) ? rawType : [rawType];
  const isArticle = inheritedArticle || types.some(type => /^(?:NewsArticle|Article|Reportage|BlogPosting|LiveBlogPosting)$/i.test(String(type || '')));
  if (isArticle) {
    for (const key of ['image', 'thumbnailUrl']) collectImageValue(value[key], output, baseUrl);
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'image' || key === 'thumbnailUrl') continue;
    collectArticleJsonImages(child, output, isArticle, baseUrl);
  }
}

function collectImageValue(value, output, baseUrl) {
  if (!value) return;
  if (typeof value === 'string') output.push(resolveUrl(value, baseUrl));
  else if (Array.isArray(value)) value.forEach(item => collectImageValue(item, output, baseUrl));
  else if (typeof value === 'object') {
    if (typeof value.url === 'string') output.push(resolveUrl(value.url, baseUrl));
    if (typeof value.contentUrl === 'string') output.push(resolveUrl(value.contentUrl, baseUrl));
  }
}

function isNonEditorialTag(attrs) {
  return /(?:logo|favicon|brand|avatar|author|perfil|profile|icon|sprite|badge|emoji|advert|publicidade|banner|newsletter|social|share|related|recommended|recomendad|widget|tracking|pixel|placeholder|loading|skeleton|header|footer)/i.test(decodeHtml(String(attrs || '')));
}

function isUsefulImage(value) {
  const url = String(value || '');
  if (!/^https?:\/\//i.test(url) || /\.svg(?:\?|$)/i.test(url)) return false;
  if (/(?:logo|favicon|brandmark|sprite|avatar|author|perfil|profile|pixel|tracking|doubleclick|google[-_.]?news|googlenews|placeholder|default[-_.]?image|no[-_.]?image|banner|newsletter|advert|publicidade|social[-_.]?share|icon[-_.]?)/i.test(url)) return false;
  const host = safeHost(url);
  if (/(?:^|\.)gstatic\.com$/i.test(host)) return false;
  if (/(?:^|\.)googleusercontent\.com$/i.test(host)) return false;
  return true;
}

function uniqueImages(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const url = String(value || '').trim();
    if (!url) continue;
    const key = imageKey(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(url);
  }
  return result;
}

function imageKey(value) {
  try {
    const url = new URL(value);
    for (const key of ['url', 'src', 'image', 'img']) {
      const nested = url.searchParams.get(key);
      if (!nested) continue;
      const decoded = safeDecode(nested);
      if (/^https?:\/\//i.test(decoded) && decoded !== value) return imageKey(decoded);
    }
    let path = safeDecode(url.pathname).toLowerCase()
      .replace(/[-_](?:\d{2,4})x(?:\d{2,4})(?=\.[a-z0-9]{2,5}$)/gi, '')
      .replace(/[-_](?:w|h)?\d{2,4}(?=\.[a-z0-9]{2,5}$)/gi, '')
      .replace(/\/\d{2,4}x\d{2,4}\//g, '/');
    const file = path.split('/').filter(Boolean).pop() || path;
    return `${url.hostname.toLowerCase()}|${file}`;
  } catch { return String(value || '').split(/[?#]/)[0].toLowerCase(); }
}

function attr(attrs, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return decodeHtml(String(attrs || '').match(new RegExp(`(?:^|\\s)${escaped}=["']([^"']+)["']`, 'i'))?.[1] || '');
}

function largestSrcset(value) {
  let best = '';
  let width = 0;
  for (const item of String(value || '').split(',').map(v => v.trim()).filter(Boolean)) {
    const match = item.match(/^(\S+)\s+(\d+)(?:w|x)$/i);
    const candidate = match?.[1] || item.split(/\s+/)[0] || '';
    const size = Number(match?.[2] || 1);
    if (candidate && size >= width) { best = candidate; width = size; }
  }
  return best;
}

function resolveUrl(value, baseUrl) {
  const raw = decodeHtml(String(value || '').trim());
  if (!raw || /^data:|^blob:/i.test(raw)) return '';
  try { return new URL(raw, baseUrl).toString(); }
  catch { return ''; }
}

function stringField(fields, key) { return String(fields?.[key]?.stringValue || ''); }
function arrayField(fields, key) { return (fields?.[key]?.arrayValue?.values || []).map(item => String(item?.stringValue || '')).filter(Boolean); }
function safeHost(value) { try { return new URL(String(value || '')).hostname.toLowerCase(); } catch { return ''; } }
function safeDecode(value) { try { return decodeURIComponent(String(value || '')); } catch { return String(value || ''); } }
function normalizeUrl(value) { try { const url = new URL(String(value || '')); url.hash = ''; return url.toString(); } catch { return String(value || '').trim(); } }
function isAggregator(value) { const host = safeHost(value); return /(?:^|\.)news\.google\./i.test(host) || /(?:^|\.)google\.com$/i.test(host) || /(?:^|\.)bing\.com$/i.test(host) || /(?:^|\.)msn\.com$/i.test(host); }
function decodeHtml(value = '') { return String(value || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16) || 32)).replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number) || 32)).trim(); }
