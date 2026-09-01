import liveNewsCore, { RealtimeHub } from './live-news.js';

export { RealtimeHub };

const emptyNewsAttempts = new Map();
const nativeFetch = globalThis.fetch.bind(globalThis);
const articleContexts = [];
const ARTICLE_CONTEXT_TTL = 5 * 60 * 1000;
const MAX_ARTICLE_CONTEXTS = 24;
const MAX_NEWS_IMAGES = 4;

// O publicador de notícias usa o mesmo fetch do Worker. Aproveitamos as
// páginas HTML que ele já abre para enriquecer a pauta com contexto e imagens
// da matéria original, sem armazenar o artigo integral no Uorqui.
globalThis.fetch = async (input, init) => {
  let nextInit = init;
  try {
    const requestUrl = input instanceof Request ? input.url : String(input || '');
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const isPostWrite = method === 'PATCH' && /firestore\.googleapis\.com\/v1\/projects\/[^/]+\/databases\/\(default\)\/documents\/posts\//i.test(requestUrl);

    if (isPostWrite && typeof init?.body === 'string') {
      const payload = JSON.parse(init.body);
      const fields = payload?.fields;
      const contentMode = String(fields?.aiContentMode?.stringValue || '');
      const currentImage = String(fields?.sourceImageUrl?.stringValue || '');
      const sourceUrl = String(fields?.sourceUrl?.stringValue || '');

      if (contentMode === 'news' && /^https?:\/\//i.test(sourceUrl)) {
        let context = findArticleContextByUrl(sourceUrl);
        if (!context || !context.images.length) {
          context = await discoverArticleContext(sourceUrl).catch(() => context || null);
        }

        const images = uniqueUrls([
          currentImage,
          ...(context?.images || [])
        ]).slice(0, MAX_NEWS_IMAGES);

        if (images.length) {
          fields.sourceImageUrl = { stringValue: images[0] };
          fields.sourceImageUrls = {
            arrayValue: {
              values: images.map((url) => ({ stringValue: url }))
            }
          };
          nextInit = { ...init, body: JSON.stringify(payload) };
        }
      }
    }
  } catch (error) {
    console.warn('Uorqui news enrichment before write failed:', error?.message || error);
  }

  const response = await nativeFetch(input, nextInit);

  try {
    const requestUrl = input instanceof Request ? input.url : String(input || '');
    const method = String(nextInit?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const accept = headerValue(nextInit?.headers || (input instanceof Request ? input.headers : null), 'accept');
    const contentType = response.headers.get('content-type') || '';
    const isArticleHtml = method === 'GET' && response.ok && contentType.includes('text/html') && accept.includes('text/html');

    if (isArticleHtml) {
      const html = (await response.clone().text()).slice(0, 900000);
      rememberArticleContext(parseArticleContext(html, response.url || requestUrl, requestUrl));
    }
  } catch (error) {
    console.warn('Uorqui article context capture failed:', error?.message || error);
  }

  return response;
};

export default {
  async fetch(request, env, ctx) {
    // Notícias automáticas são disparadas exclusivamente pelo Cron Trigger.
    // Evita corridas entre múltiplas instâncias do Worker e o cron.
    return liveNewsCore.fetch(request, withEditorialAi(env), ctx);
  },

  async scheduled(controller, env, ctx) {
    return liveNewsCore.scheduled(controller, withEditorialAi(env), ctx);
  }
};

async function discoverArticleContext(sourceUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5500);
  try {
    const response = await nativeFetch(sourceUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; UorquiNews/2.3)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    if (!response.ok) return null;

    const html = (await response.text()).slice(0, 900000);
    const context = parseArticleContext(html, response.url || sourceUrl, sourceUrl);
    rememberArticleContext(context);
    return context;
  } finally {
    clearTimeout(timer);
  }
}

function parseArticleContext(html, finalUrl, requestedUrl = '') {
  const title = firstNonEmpty([
    metaContent(html, 'og:title'),
    metaContent(html, 'twitter:title'),
    decodeHtml(String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<[^>]+>/g, ' ')
  ]);
  const description = firstNonEmpty([
    metaContent(html, 'og:description'),
    metaContent(html, 'twitter:description'),
    metaContent(html, 'description')
  ]);
  const text = extractArticleText(html, description);
  const images = extractArticleImages(html, finalUrl || requestedUrl);

  return {
    url: normalizeUrl(finalUrl || requestedUrl),
    requestedUrl: normalizeUrl(requestedUrl),
    title: cleanSpaces(title),
    text,
    images,
    fetchedAt: Date.now()
  };
}

function rememberArticleContext(context) {
  if (!context || (!context.text && !context.images?.length)) return;
  const now = Date.now();
  for (let i = articleContexts.length - 1; i >= 0; i -= 1) {
    const item = articleContexts[i];
    if (now - Number(item.fetchedAt || 0) > ARTICLE_CONTEXT_TTL ||
        (context.url && item.url === context.url) ||
        (context.requestedUrl && item.requestedUrl === context.requestedUrl)) {
      articleContexts.splice(i, 1);
    }
  }
  articleContexts.unshift(context);
  if (articleContexts.length > MAX_ARTICLE_CONTEXTS) articleContexts.length = MAX_ARTICLE_CONTEXTS;
}

function findArticleContextByUrl(value) {
  const key = normalizeUrl(value);
  if (!key) return null;
  const now = Date.now();
  return articleContexts.find((item) =>
    now - Number(item.fetchedAt || 0) <= ARTICLE_CONTEXT_TTL &&
    (item.url === key || item.requestedUrl === key)
  ) || null;
}

function findArticleContextForPrompt(prompt) {
  const headline = promptField(prompt, 'MANCHETE');
  if (!headline) return null;
  const now = Date.now();
  const headlineSet = newsTokens(headline);
  let best = null;
  let bestScore = 0;

  for (const context of articleContexts) {
    if (now - Number(context.fetchedAt || 0) > ARTICLE_CONTEXT_TTL) continue;
    const titleSet = newsTokens(context.title || '');
    if (!titleSet.size) continue;
    let common = 0;
    for (const token of headlineSet) if (titleSet.has(token)) common += 1;
    const coverage = common / Math.max(1, Math.min(headlineSet.size, titleSet.size));
    const score = common >= 3 ? coverage + common * 0.08 : coverage;
    if (score > bestScore) {
      bestScore = score;
      best = context;
    }
  }

  if (best && bestScore >= 0.48) return best;
  const recent = articleContexts.filter((item) => now - Number(item.fetchedAt || 0) < 12000);
  return recent.length === 1 ? recent[0] : null;
}

function extractArticleText(html, description = '') {
  const source = String(html || '');
  const articleBlocks = [...source.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].map((match) => match[1]);
  const mainBlocks = [...source.matchAll(/<main\b[^>]*>([\s\S]*?)<\/main>/gi)].map((match) => match[1]);
  const body = articleBlocks.join('\n') || mainBlocks.join('\n') || source;
  const cleanedBody = body
    .replace(/<(script|style|noscript|svg|nav|footer|form|aside)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ');

  const paragraphs = [];
  const descriptionText = cleanSpaces(description);
  if (descriptionText.length >= 55) paragraphs.push(descriptionText);

  for (const match of cleanedBody.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = cleanSpaces(decodeHtml(String(match[1] || '').replace(/<[^>]+>/g, ' ')));
    if (text.length < 55 || text.length > 1400) continue;
    if (/cookies?|newsletter|assine|publicidade|anúncio|leia também|termos de uso|política de privacidade|siga-nos|receba nossas notícias/i.test(text)) continue;
    const fingerprint = normalizeText(text).slice(0, 180);
    if (paragraphs.some((item) => normalizeText(item).slice(0, 180) === fingerprint)) continue;
    paragraphs.push(text);
    if (paragraphs.join('\n').length >= 7000) break;
  }

  return paragraphs.join('\n').slice(0, 7000);
}

function extractArticleImages(html, baseUrl) {
  const source = String(html || '');
  const candidates = [];

  // Imagens declaradas explicitamente pelo publisher têm prioridade.
  for (const match of source.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image(?::url)?|twitter:image(?::src)?)["'][^>]+content=["']([^"']+)["']/gi)) {
    candidates.push(match[1]);
  }
  for (const match of source.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image(?::url)?|twitter:image(?::src)?)["']/gi)) {
    candidates.push(match[1]);
  }

  // JSON-LD de NewsArticle costuma trazer a foto principal e, em alguns
  // veículos, uma pequena galeria relacionada à matéria.
  for (const match of source.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(decodeHtml(match[1] || ''));
      collectJsonLdImages(parsed, candidates);
    } catch {}
  }

  // Fallback para matérias que não publicam OpenGraph corretamente.
  for (const match of source.matchAll(/<img\b[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["'][^>]*>/gi)) {
    candidates.push(match[1]);
  }

  return uniqueUrls(candidates.map((value) => resolveImageUrl(value, baseUrl)).filter(Boolean))
    .filter(isUsefulNewsImage)
    .slice(0, MAX_NEWS_IMAGES);
}

function collectJsonLdImages(value, output) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonLdImages(item, output));
    return;
  }
  if (typeof value === 'string') return;
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
    collectJsonLdImages(child, output);
  }
}

function resolveImageUrl(value, baseUrl) {
  const raw = decodeHtml(String(value || '').trim());
  if (!raw || /^data:|^blob:/i.test(raw)) return '';
  try {
    const url = new URL(raw, baseUrl).toString();
    return /^https?:\/\//i.test(url) ? url : '';
  } catch {
    return '';
  }
}

function isUsefulNewsImage(value) {
  const url = String(value || '');
  if (!/^https?:\/\//i.test(url)) return false;
  if (/\.svg(?:\?|$)/i.test(url)) return false;
  if (/(?:logo|favicon|icon|sprite|avatar|author|perfil|profile|pixel|tracking|ads?[-_.\/]|doubleclick)/i.test(url)) return false;
  return true;
}

function uniqueUrls(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const url = String(value || '').trim();
    if (!url) continue;
    const key = normalizeUrl(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(url);
  }
  return result;
}

function metaContent(html, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const direct = String(html || '').match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'));
  const reverse = String(html || '').match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'));
  return cleanSpaces(decodeHtml(direct?.[1] || reverse?.[1] || ''));
}

function withEditorialAi(env) {
  if (!env?.AI || env.__uorquiEditorialAi) return env;

  const originalAi = env.AI;
  const wrappedAi = Object.create(originalAi);

  wrappedAi.run = async (model, input) => {
    const prompt = promptText(input);
    const isNewsPrompt = /MANCHETE:\s*/i.test(prompt) && /FONTE:\s*/i.test(prompt);
    if (!isNewsPrompt) return originalAi.run.call(originalAi, model, input);

    const context = findArticleContextForPrompt(prompt);
    const key = prompt.slice(0, 1800);
    const originalMessages = Array.isArray(input?.messages) ? input.messages : [];
    const rewrittenMessages = originalMessages.map((message) => {
      if (typeof message?.content !== 'string') return message;
      return {
        ...message,
        content: message.content
          .replace(/Use SOMENTE os dados jornalísticos fornecidos abaixo\./i, 'Use SOMENTE os dados jornalísticos fornecidos abaixo e o contexto extraído da matéria, quando fornecido.')
          .replace(/Escreva entre 250 e 600 caracteres em português do Brasil\./i, 'Escreva entre 700 e 1300 caracteres em português do Brasil, em 2 a 4 parágrafos curtos.')
          .replace(/não estejam na manchete/gi, 'não estejam no material fornecido')
      };
    });

    const adjustedInput = {
      ...input,
      messages: [
        {
          role: 'system',
          content: 'Regra editorial obrigatória do Uorqui: produza um resumo jornalístico autossuficiente e factual, em linguagem natural. Explique o que aconteceu, quem está envolvido, os principais números/datas e por que o fato importa somente quando essas informações estiverem no material. Cite a fonte no próprio texto. NÃO termine com pergunta, NÃO faça chamada genérica de engajamento, NÃO copie trechos extensos nem reproduza a matéria; resuma com suas próprias palavras.'
        },
        ...rewrittenMessages,
        ...(context?.text ? [{
          role: 'user',
          content: `CONTEXTO EXTRAÍDO DA MATÉRIA ORIGINAL PARA RESUMO:\n${context.text.slice(0, 7000)}\n\nUse esse contexto apenas para aprofundar o resumo factual. Não transcreva parágrafos nem invente informação ausente.`
        }] : [])
      ]
    };

    let result;
    let errorCaught = null;
    try {
      result = await originalAi.run.call(originalAi, model, adjustedInput);
    } catch (error) {
      errorCaught = error;
    }

    const text = stripTrailingQuestion(extractAiText(result));
    if (text) {
      emptyNewsAttempts.delete(key);
      return { response: text };
    }

    const attempts = (emptyNewsAttempts.get(key) || 0) + 1;
    emptyNewsAttempts.set(key, attempts);
    const finalAttempt = /llama-3\.1-8b-instruct-fast/i.test(String(model || '')) || attempts >= 2;

    if (!finalAttempt) {
      if (errorCaught) throw errorCaught;
      return result;
    }

    emptyNewsAttempts.delete(key);
    const fallback = factualNewsFallback(prompt);
    if (fallback) {
      console.warn('Uorqui editorial fallback used without engagement question', model, errorCaught?.message || 'empty response');
      return { response: fallback };
    }

    if (errorCaught) throw errorCaught;
    return result;
  };

  const compatibleEnv = Object.create(env);
  Object.defineProperty(compatibleEnv, 'AI', { value: wrappedAi, enumerable: true });
  Object.defineProperty(compatibleEnv, '__uorquiEditorialAi', { value: true, enumerable: false });
  return compatibleEnv;
}

function stripTrailingQuestion(value = '') {
  const text = String(value || '').trim();
  if (!text.endsWith('?')) return text;

  const parts = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  if (parts.length <= 1) return text;

  const last = String(parts[parts.length - 1] || '').trim();
  const before = parts.slice(0, -1).join('').trim();
  if (!before || before.length < 60) return text;

  if (last.endsWith('?')) return before;
  return text;
}

function factualNewsFallback(prompt) {
  const headline = promptField(prompt, 'MANCHETE');
  if (!headline) return '';
  const source = promptField(prompt, 'FONTE') || 'a fonte original';
  const normalizedHeadline = headline.replace(/[\s.!?]+$/g, '').trim();
  return `Segundo ${source}, ${normalizedHeadline}. A informação vem da matéria original e foi mantida em formato factual, sem acrescentar detalhes não confirmados.`;
}

function promptText(input) {
  const messages = Array.isArray(input?.messages) ? input.messages : [];
  return messages.map(message => contentText(message?.content)).filter(Boolean).join('\n');
}

function contentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(part => {
    if (typeof part === 'string') return part;
    if (typeof part?.text === 'string') return part.text;
    if (typeof part?.content === 'string') return part.content;
    return '';
  }).filter(Boolean).join('\n');
}

function extractAiText(result) {
  if (typeof result === 'string') return result.trim();
  if (!result || typeof result !== 'object') return '';
  const candidates = [
    result.response,
    result.output_text,
    result.text,
    result.result?.response,
    result.result?.output_text,
    result.result?.text,
    result.choices?.[0]?.message?.content,
    result.choices?.[0]?.text
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    const text = contentText(candidate);
    if (text.trim()) return text.trim();
  }
  return '';
}

function promptField(prompt, label) {
  const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(prompt || '').match(new RegExp(`(?:^|\\n)${escaped}:\\s*([^\\n]+)`, 'i'));
  return String(match?.[1] || '').trim();
}

function newsTokens(value) {
  return new Set(normalizeText(value).split(' ').filter((token) => token.length >= 3 && !NEWS_STOPWORDS.has(token)).slice(0, 24));
}

const NEWS_STOPWORDS = new Set(['a','o','as','os','de','da','do','das','dos','e','em','no','na','nos','nas','para','por','com','que','um','uma','uns','umas','se','ao','aos','mais','novo','nova','após','sobre','diz','hoje']);

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return String(value || '').trim();
  }
}

function firstNonEmpty(values) {
  return (values || []).find((value) => String(value || '').trim()) || '';
}

function cleanSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function headerValue(headers, name) {
  if (!headers) return '';
  try { return new Headers(headers).get(name) || ''; }
  catch { return ''; }
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
