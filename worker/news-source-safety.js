const upstreamFetch = globalThis.fetch.bind(globalThis);
const MAX_IMAGES = 4;

// Última barreira antes da gravação de uma notícia automática. Só deixa no
// post imagens que conseguimos associar à matéria do veículo. Logos, banners,
// widgets, relacionados e variações da mesma foto são descartados.
globalThis.fetch = async (input, init) => {
  let nextInit = init;

  try {
    const requestUrl = input instanceof Request ? input.url : String(input || '');
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const isNewsPostWrite = method === 'PATCH' &&
      /firestore\.googleapis\.com\/v1\/projects\/[^/]+\/databases\/\(default\)\/documents\/posts\//i.test(requestUrl) &&
      typeof init?.body === 'string';

    if (isNewsPostWrite) {
      const payload = JSON.parse(init.body);
      const fields = payload?.fields;
      const contentMode = stringField(fields, 'aiContentMode');

      if (fields && contentMode === 'news') {
        await sanitizeNewsFields(fields);
        nextInit = { ...init, body: JSON.stringify(payload) };
      }
    }
  } catch (error) {
    console.warn('Uorqui news source safety failed:', error?.message || error);
  }

  return upstreamFetch(input, nextInit);
};

async function sanitizeNewsFields(fields) {
  const headline = stringField(fields, 'sourceHeadline');
  const sourceName = stringField(fields, 'sourceName');
  let sourceUrl = stringField(fields, 'sourceUrl');

  const directFromKnownRedirect = directPublisherUrl(sourceUrl);
  if (directFromKnownRedirect) {
    sourceUrl = directFromKnownRedirect;
    fields.sourceUrl = { stringValue: sourceUrl };
  }

  // Não confiamos mais na galeria herdada do RSS/agregador. A fonte de verdade
  // para fotos passa a ser a página da matéria no veículo.
  let images = [];

  if ((isAggregatorUrl(sourceUrl) || !/^https?:\/\//i.test(sourceUrl)) && headline) {
    const resolved = await resolvePublisherArticle(headline, sourceName).catch(() => null);
    if (resolved?.url) {
      sourceUrl = resolved.url;
      fields.sourceUrl = { stringValue: sourceUrl };
    }
  }

  if (!isAggregatorUrl(sourceUrl) && /^https?:\/\//i.test(sourceUrl)) {
    images = await fetchPublisherImages(sourceUrl).catch(() => []);
  }

  // Segunda chance para feeds do Google/Bing cuja URL intermediária não expõe
  // diretamente o endereço do publisher.
  if (!images.length && headline) {
    const resolved = await resolvePublisherArticle(headline, sourceName).catch(() => null);
    if (resolved?.url) {
      sourceUrl = resolved.url;
      fields.sourceUrl = { stringValue: sourceUrl };
      images = await fetchPublisherImages(sourceUrl).catch(() => []);
    }
  }

  images = uniqueArticleImages(images)
    .filter((url) => isUsefulPublisherImage(url, sourceUrl))
    .slice(0, MAX_IMAGES);

  fields.sourceImageUrl = { stringValue: images[0] || '' };
  fields.sourceImageUrls = {
    arrayValue: {
      values: images.map((url) => ({ stringValue: url }))
    }
  };

  console.info('Uorqui article images selected', {
    source: sourceName || safeHost(sourceUrl),
    images: images.length,
    host: safeHost(sourceUrl)
  });

  const text = stringField(fields, 'text');
  const cleanedText = stripEditorialPadding(text);
  if (cleanedText && cleanedText !== text) fields.text = { stringValue: cleanedText };
}

async function resolvePublisherArticle(headline, sourceName) {
  const queries = [
    `"${headline}" ${sourceName || ''}`.trim(),
    `"${headline}"`
  ];

  let best = null;
  let bestScore = 0;

  for (const query of queries) {
    const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&setlang=pt-br&cc=br`;
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; UorquiNews/2.5)',
        'Accept': 'application/rss+xml,application/xml,text/xml,*/*'
      }
    }, 4500);
    if (!response?.ok) continue;

    const xml = await response.text();
    for (const match of String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
      const raw = match[1] || '';
      const title = decodeXml(raw.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
      const link = decodeXml(raw.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '');
      const direct = directPublisherUrl(link) || (!isAggregatorUrl(link) ? link : '');
      if (!/^https?:\/\//i.test(direct) || isAggregatorUrl(direct)) continue;

      const score = articleMatchScore(headline, title, sourceName, direct);
      if (score > bestScore) {
        bestScore = score;
        best = { url: direct, title };
      }
    }

    if (best && bestScore >= 0.78) break;
  }

  return best && bestScore >= 0.48 ? best : null;
}

function articleMatchScore(expectedTitle, candidateTitle, sourceName, candidateUrl) {
  const expected = tokens(expectedTitle);
  const candidate = tokens(candidateTitle);
  if (!expected.size || !candidate.size) return 0;

  let common = 0;
  for (const token of expected) if (candidate.has(token)) common += 1;
  const coverage = common / Math.max(1, Math.min(expected.size, candidate.size));

  let sourceBonus = 0;
  const sourceKey = normalizeDomainHint(sourceName);
  const host = safeHost(candidateUrl).replace(/^www\./, '');
  if (sourceKey && (host.includes(sourceKey) || sourceKey.includes(host.split('.')[0] || ''))) sourceBonus = 0.22;

  return coverage + sourceBonus;
}

async function fetchPublisherImages(sourceUrl) {
  const response = await fetchWithTimeout(sourceUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; UorquiNews/2.5)',
      'Accept': 'text/html,application/xhtml+xml'
    }
  }, 6000);
  if (!response?.ok) return [];

  const finalUrl = response.url || sourceUrl;
  if (isAggregatorUrl(finalUrl)) return [];
  const html = (await response.text()).slice(0, 1000000);
  return extractPublisherImages(html, finalUrl);
}

function extractPublisherImages(html, baseUrl) {
  const source = String(html || '');
  const articleRegions = extractArticleRegions(source);
  const bodyCandidates = [];

  // A prioridade absoluta é para fotos que aparecem dentro do corpo editorial.
  for (const region of articleRegions) {
    collectRegionImages(region, bodyCandidates);
    if (bodyCandidates.length >= 16) break;
  }

  const bodyImages = uniqueArticleImages(
    bodyCandidates
      .map((value) => resolveUrl(value, baseUrl))
      .filter(Boolean)
  ).filter((url) => isUsefulPublisherImage(url, baseUrl));

  if (bodyImages.length) return bodyImages.slice(0, MAX_IMAGES);

  // Alguns publishers carregam a foto principal fora do <article>. Só usamos
  // JSON-LD/OG como fallback quando a própria página se identifica como artigo.
  if (!looksLikeArticlePage(source)) return [];

  const structuredCandidates = [];
  for (const match of source.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collectArticleJsonImages(JSON.parse(decodeHtml(match[1] || '')), structuredCandidates);
    } catch {}
  }

  const structuredImages = uniqueArticleImages(
    structuredCandidates
      .map((value) => resolveUrl(value, baseUrl))
      .filter(Boolean)
  ).filter((url) => isUsefulPublisherImage(url, baseUrl));

  if (structuredImages.length) return structuredImages.slice(0, MAX_IMAGES);

  const socialCandidates = [];
  for (const match of source.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image(?::url)?|twitter:image(?::src)?)["'][^>]+content=["']([^"']+)["']/gi)) {
    socialCandidates.push(match[1]);
  }
  for (const match of source.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image(?::url)?|twitter:image(?::src)?)["']/gi)) {
    socialCandidates.push(match[1]);
  }

  return uniqueArticleImages(
    socialCandidates
      .map((value) => resolveUrl(value, baseUrl))
      .filter(Boolean)
  ).filter((url) => isUsefulPublisherImage(url, baseUrl)).slice(0, 1);
}

function extractArticleRegions(source) {
  const regions = [];

  for (const match of source.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)) {
    if (match[1]) regions.push(match[1]);
  }
  if (regions.length) return regions;

  const markers = [
    /itemprop=["']articleBody["']/i,
    /(?:class|id)=["'][^"']*(?:article[-_ ]?(?:body|content)|story[-_ ]?body|entry[-_ ]?content|post[-_ ]?content|content[-_ ]?body|materia[-_ ]?(?:corpo|conteudo)|noticia[-_ ]?(?:corpo|conteudo))[^"']*["']/i
  ];

  for (const marker of markers) {
    const match = marker.exec(source);
    if (!match || match.index < 0) continue;
    const start = Math.max(0, match.index - 1500);
    regions.push(source.slice(start, Math.min(source.length, match.index + 220000)));
  }
  if (regions.length) return regions;

  const main = source.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || '';
  return main ? [main.slice(0, 220000)] : [];
}

function collectRegionImages(region, output) {
  const source = String(region || '')
    .replace(/<(?:nav|footer|aside|form)\b[\s\S]*?<\/(?:nav|footer|aside|form)>/gi, ' ');

  for (const match of source.matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = match[1] || '';
    if (isNonEditorialImageTag(attrs)) continue;

    const srcset = attributeValue(attrs, 'srcset') || attributeValue(attrs, 'data-srcset');
    const bestSrcset = largestSrcsetUrl(srcset);
    if (bestSrcset) output.push(bestSrcset);

    const src = attributeValue(attrs, 'src') || attributeValue(attrs, 'data-src') || attributeValue(attrs, 'data-lazy-src') || attributeValue(attrs, 'data-original');
    if (src) output.push(src);
  }

  for (const match of source.matchAll(/<source\b([^>]*)>/gi)) {
    const attrs = match[1] || '';
    if (isNonEditorialImageTag(attrs)) continue;
    const srcset = attributeValue(attrs, 'srcset') || attributeValue(attrs, 'data-srcset');
    const best = largestSrcsetUrl(srcset);
    if (best) output.push(best);
  }
}

function isNonEditorialImageTag(attrs) {
  const value = decodeHtml(String(attrs || '')).toLowerCase();
  return /(?:logo|favicon|brand|avatar|author|perfil|profile|icon|sprite|badge|emoji|advert|publicidade|banner|newsletter|social|share|related|recommended|recomendad|widget|tracking|pixel|placeholder|loading|skeleton|header|footer)/i.test(value);
}

function attributeValue(attrs, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return decodeHtml(String(attrs || '').match(new RegExp(`(?:^|\\s)${escaped}=["']([^"']+)["']`, 'i'))?.[1] || '');
}

function largestSrcsetUrl(value) {
  const candidates = String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  let best = '';
  let bestWidth = 0;
  for (const candidate of candidates) {
    const match = candidate.match(/^(\S+)\s+(\d+)(?:w|x)$/i);
    const url = match?.[1] || candidate.split(/\s+/)[0] || '';
    const width = Number(match?.[2] || 1);
    if (url && width >= bestWidth) {
      best = url;
      bestWidth = width;
    }
  }
  return best;
}

function looksLikeArticlePage(source) {
  const html = String(source || '');
  if (/<article\b/i.test(html)) return true;
  if (/itemprop=["']articleBody["']/i.test(html)) return true;
  if (/<meta[^>]+property=["']og:type["'][^>]+content=["']article["']/i.test(html)) return true;
  if (/"@type"\s*:\s*["'](?:NewsArticle|Article|Reportage|BlogPosting|LiveBlogPosting)["']/i.test(html)) return true;
  return false;
}

function collectArticleJsonImages(value, output, inheritedArticle = false) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectArticleJsonImages(item, output, inheritedArticle));
    return;
  }
  if (typeof value !== 'object') return;

  const rawType = value['@type'];
  const types = Array.isArray(rawType) ? rawType : [rawType];
  const isArticle = inheritedArticle || types.some((type) => /^(?:NewsArticle|Article|Reportage|BlogPosting|LiveBlogPosting)$/i.test(String(type || '')));

  if (isArticle) {
    for (const key of ['image', 'thumbnailUrl']) {
      const child = value[key];
      collectImageValue(child, output);
    }
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === 'image' || key === 'thumbnailUrl') continue;
    collectArticleJsonImages(child, output, isArticle);
  }
}

function collectImageValue(value, output) {
  if (!value) return;
  if (typeof value === 'string') {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectImageValue(item, output));
    return;
  }
  if (typeof value === 'object') {
    if (typeof value.url === 'string') output.push(value.url);
    if (typeof value.contentUrl === 'string') output.push(value.contentUrl);
  }
}

function isUsefulPublisherImage(value, sourceUrl = '') {
  const url = String(value || '');
  if (!/^https?:\/\//i.test(url)) return false;
  if (/\.svg(?:\?|$)/i.test(url)) return false;
  if (/(?:logo|favicon|brandmark|sprite|avatar|author|perfil|profile|pixel|tracking|doubleclick|google[-_.]?news|googlenews|gnews[-_.]?logo|placeholder|default[-_.]?image|no[-_.]?image|banner|newsletter|advert|publicidade|social[-_.]?share|icon[-_.]?)/i.test(url)) return false;

  const imageHost = safeHost(url);
  const sourceHost = safeHost(sourceUrl);
  if (/^(?:www\.)?news\.google\./i.test(sourceHost) || /(?:^|\.)bing\.com$/i.test(sourceHost)) {
    if (/(?:^|\.)(?:googleusercontent\.com|gstatic\.com|google\.com)$/i.test(imageHost)) return false;
  }
  if (/(?:^|\.)gstatic\.com$/i.test(imageHost)) return false;
  if (/(?:^|\.)googleusercontent\.com$/i.test(imageHost) && !/(?:blogspot|blogger)/i.test(sourceHost)) return false;

  return true;
}

function uniqueArticleImages(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const url = String(value || '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    const key = imageIdentityKey(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(url);
  }
  return result;
}

function imageIdentityKey(value) {
  try {
    const url = new URL(String(value || ''));

    // CDNs de otimização frequentemente colocam a URL original num parâmetro.
    for (const key of ['url', 'src', 'image', 'img']) {
      const nested = url.searchParams.get(key);
      if (!nested) continue;
      const decoded = safeDecode(nested);
      if (/^https?:\/\//i.test(decoded) && decoded !== value) return imageIdentityKey(decoded);
    }

    let path = safeDecode(url.pathname).toLowerCase();
    path = path
      .replace(/[-_](?:\d{2,4})x(?:\d{2,4})(?=\.[a-z0-9]{2,5}$)/gi, '')
      .replace(/[-_](?:w|h)?\d{2,4}(?=\.[a-z0-9]{2,5}$)/gi, '')
      .replace(/\/(?:w|h|width|height)[-_]?\d{2,4}\//gi, '/')
      .replace(/\/\d{2,4}x\d{2,4}\//g, '/');

    const parts = path.split('/').filter(Boolean);
    const file = parts[parts.length - 1] || path;
    const normalizedFile = file.replace(/(?:[-_](?:crop|resize|scaled|thumb|thumbnail))+(?=\.[a-z0-9]{2,5}$)/gi, '');
    return `${url.hostname.toLowerCase()}|${normalizedFile || path}`;
  } catch {
    return String(value || '').split(/[?#]/)[0].toLowerCase();
  }
}

function isAggregatorUrl(value) {
  const host = safeHost(value);
  return /(?:^|\.)news\.google\./i.test(host) ||
    /(?:^|\.)google\.com$/i.test(host) ||
    /(?:^|\.)bing\.com$/i.test(host) ||
    /(?:^|\.)msn\.com$/i.test(host);
}

function directPublisherUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!isAggregatorUrl(url.toString())) return url.toString();

    for (const key of ['url', 'u', 'r', 'target']) {
      const raw = url.searchParams.get(key);
      if (!raw) continue;
      for (const candidate of [raw, safeDecode(raw), safeDecode(safeDecode(raw))]) {
        if (/^https?:\/\//i.test(candidate) && !isAggregatorUrl(candidate)) return candidate;
      }
    }
  } catch {}
  return '';
}

function stripEditorialPadding(value) {
  const text = String(value || '').trim();
  if (!text) return text;
  const parts = text.match(/[^.!?\n]+[.!?]+|[^.!?\n]+$/g) || [text];
  const filler = /(?:a|o)\s+(?:fonte|reportagem|mat[eé]ria|texto|ve[ií]culo)\s+(?:n[aã]o\s+(?:informa|menciona|fornece|detalha|esclarece|explica)|tamb[eé]m\s+n[aã]o\s+(?:informa|menciona|fornece))|n[aã]o\s+h[aá]\s+informa[cç][oõ]es/i;
  const fillerCount = parts.filter((part) => filler.test(part)).length;
  if (fillerCount < 2) return text;

  const cleaned = parts.filter((part) => !filler.test(part)).join(' ').replace(/\s+/g, ' ').trim();
  return cleaned.length >= 160 ? cleaned : text;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await upstreamFetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function stringField(fields, key) {
  return String(fields?.[key]?.stringValue || '');
}

function resolveUrl(value, baseUrl) {
  const raw = decodeHtml(String(value || '').trim());
  if (!raw || /^data:|^blob:/i.test(raw)) return '';
  try { return new URL(raw, baseUrl).toString(); }
  catch { return ''; }
}

function tokens(value) {
  const stop = new Set(['a','o','as','os','de','da','do','das','dos','e','em','no','na','nos','nas','para','por','com','que','um','uma','se','ao','mais','novo','nova','sobre','após','hoje']);
  return new Set(normalize(value).split(' ').filter((token) => token.length >= 3 && !stop.has(token)).slice(0, 28));
}

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function normalizeDomainHint(value) {
  return String(value || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].replace(/\.(com|com\.br|net|org|br)$/i, '').replace(/[^a-z0-9.-]/g, '');
}

function safeHost(value) {
  try { return new URL(String(value || '')).hostname.toLowerCase(); }
  catch { return ''; }
}

function safeDecode(value) {
  try { return decodeURIComponent(String(value || '')); }
  catch { return String(value || ''); }
}

function decodeXml(value) {
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
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number) || 32))
    .trim();
}
