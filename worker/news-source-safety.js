const upstreamFetch = globalThis.fetch.bind(globalThis);
const MAX_IMAGES = 4;

// Última barreira antes da gravação de uma notícia automática. O objetivo é
// impedir que logos/arte do agregador sejam salvos como se fossem fotos da
// matéria e, quando possível, resolver a URL direta do veículo.
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
  const currentImages = arrayField(fields, 'sourceImageUrls');
  const primaryImage = stringField(fields, 'sourceImageUrl');

  const directFromKnownRedirect = directPublisherUrl(sourceUrl);
  if (directFromKnownRedirect) {
    sourceUrl = directFromKnownRedirect;
    fields.sourceUrl = { stringValue: sourceUrl };
  }

  let images = uniqueUrls([primaryImage, ...currentImages])
    .filter((url) => isUsefulPublisherImage(url, sourceUrl));

  // Google News frequentemente entrega uma página intermediária. Quando isso
  // acontece, procuramos a mesma manchete no Bing News apenas para recuperar a
  // URL direta do veículo e então lemos as imagens declaradas pelo publisher.
  if ((isAggregatorUrl(sourceUrl) || images.length === 0) && headline) {
    const resolved = await resolvePublisherArticle(headline, sourceName).catch(() => null);
    if (resolved?.url) {
      sourceUrl = resolved.url;
      fields.sourceUrl = { stringValue: sourceUrl };
      const publisherImages = await fetchPublisherImages(sourceUrl).catch(() => []);
      images = uniqueUrls([...publisherImages, ...images])
        .filter((url) => isUsefulPublisherImage(url, sourceUrl));
      console.info('Uorqui news publisher resolved', {
        source: sourceName || '',
        host: safeHost(sourceUrl),
        images: images.length
      });
    }
  }

  // Se a URL já era direta, ainda fazemos uma tentativa de recuperar a imagem
  // real quando o RSS/aggregador não forneceu nenhuma imagem aproveitável.
  if (!isAggregatorUrl(sourceUrl) && images.length === 0 && /^https?:\/\//i.test(sourceUrl)) {
    images = (await fetchPublisherImages(sourceUrl).catch(() => []))
      .filter((url) => isUsefulPublisherImage(url, sourceUrl));
  }

  images = uniqueUrls(images).slice(0, MAX_IMAGES);
  fields.sourceImageUrl = { stringValue: images[0] || '' };
  fields.sourceImageUrls = {
    arrayValue: {
      values: images.map((url) => ({ stringValue: url }))
    }
  };

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
        'User-Agent': 'Mozilla/5.0 (compatible; UorquiNews/2.4)',
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
      'User-Agent': 'Mozilla/5.0 (compatible; UorquiNews/2.4)',
      'Accept': 'text/html,application/xhtml+xml'
    }
  }, 5500);
  if (!response?.ok) return [];

  const finalUrl = response.url || sourceUrl;
  if (isAggregatorUrl(finalUrl)) return [];
  const html = (await response.text()).slice(0, 900000);
  return extractPublisherImages(html, finalUrl);
}

function extractPublisherImages(html, baseUrl) {
  const source = String(html || '');
  const candidates = [];

  for (const match of source.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image(?::url)?|twitter:image(?::src)?)["'][^>]+content=["']([^"']+)["']/gi)) {
    candidates.push(match[1]);
  }
  for (const match of source.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image(?::url)?|twitter:image(?::src)?)["']/gi)) {
    candidates.push(match[1]);
  }

  for (const match of source.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collectJsonImages(JSON.parse(decodeHtml(match[1] || '')), candidates);
    } catch {}
  }

  for (const match of source.matchAll(/<img\b[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["'][^>]*>/gi)) {
    candidates.push(match[1]);
  }

  return uniqueUrls(candidates.map((value) => resolveUrl(value, baseUrl)).filter(Boolean))
    .filter((url) => isUsefulPublisherImage(url, baseUrl))
    .slice(0, MAX_IMAGES);
}

function collectJsonImages(value, output) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonImages(item, output));
    return;
  }
  if (typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    if (/^(image|thumbnailUrl)$/i.test(key)) {
      if (typeof child === 'string') output.push(child);
      else if (Array.isArray(child)) child.forEach((item) => {
        if (typeof item === 'string') output.push(item);
        else if (item && typeof item === 'object' && typeof item.url === 'string') output.push(item.url);
      });
      else if (child && typeof child === 'object' && typeof child.url === 'string') output.push(child.url);
    }
    collectJsonImages(child, output);
  }
}

function isUsefulPublisherImage(value, sourceUrl = '') {
  const url = String(value || '');
  if (!/^https?:\/\//i.test(url)) return false;
  if (/\.svg(?:\?|$)/i.test(url)) return false;
  if (/(?:logo|favicon|sprite|avatar|author|perfil|profile|pixel|tracking|doubleclick|google[-_.]?news|googlenews|gnews[-_.]?logo)/i.test(url)) return false;

  const imageHost = safeHost(url);
  const sourceHost = safeHost(sourceUrl);
  if (/^(?:www\.)?news\.google\./i.test(sourceHost) || /(?:^|\.)bing\.com$/i.test(sourceHost)) {
    if (/(?:^|\.)(?:googleusercontent\.com|gstatic\.com|google\.com)$/i.test(imageHost)) return false;
  }
  if (/(?:^|\.)gstatic\.com$/i.test(imageHost)) return false;
  if (/(?:^|\.)googleusercontent\.com$/i.test(imageHost) && !/(?:blogspot|blogger)/i.test(sourceHost)) return false;

  return true;
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

function arrayField(fields, key) {
  return (fields?.[key]?.arrayValue?.values || [])
    .map((item) => String(item?.stringValue || ''))
    .filter(Boolean);
}

function resolveUrl(value, baseUrl) {
  const raw = decodeHtml(String(value || '').trim());
  if (!raw || /^data:|^blob:/i.test(raw)) return '';
  try { return new URL(raw, baseUrl).toString(); }
  catch { return ''; }
}

function uniqueUrls(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const url = String(value || '').trim();
    if (!url) continue;
    const key = url.replace(/#.*$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(url);
  }
  return result;
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
