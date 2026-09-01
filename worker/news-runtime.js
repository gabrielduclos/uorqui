import liveNewsCore, { RealtimeHub } from './live-news.js';

export { RealtimeHub };

const emptyNewsAttempts = new Map();
const nativeFetch = globalThis.fetch.bind(globalThis);

// O publicador legado ainda pode decidir não gravar a imagem mesmo quando a
// matéria possui uma. Interceptamos somente a gravação de posts automáticos de
// notícia no Firestore: se sourceImageUrl vier vazio, tentamos recuperar a
// imagem social da própria matéria. Sem imagem válida, o post segue em texto.
globalThis.fetch = async (input, init) => {
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

      if (contentMode === 'news' && !currentImage && /^https?:\/\//i.test(sourceUrl)) {
        const sourceImageUrl = await discoverSourceImage(sourceUrl).catch(() => '');
        if (sourceImageUrl) {
          fields.sourceImageUrl = { stringValue: sourceImageUrl };
          init = { ...init, body: JSON.stringify(payload) };
        }
      }
    }
  } catch (error) {
    console.warn('Uorqui source image preference failed:', error?.message || error);
  }

  return nativeFetch(input, init);
};

export default {
  async fetch(request, env, ctx) {
    // Notícias automáticas são disparadas exclusivamente pelo Cron Trigger.
    // Evita corridas entre múltiplas instâncias do Worker e o cron, que podiam
    // publicar a mesma notícia duas vezes antes do estado editorial ser salvo.
    return liveNewsCore.fetch(request, withEditorialAi(env), ctx);
  },

  async scheduled(controller, env, ctx) {
    return liveNewsCore.scheduled(controller, withEditorialAi(env), ctx);
  }
};

async function discoverSourceImage(sourceUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await nativeFetch(sourceUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; UorquiNews/2.2)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    if (!response.ok) return '';

    const html = (await response.text()).slice(0, 500000);
    const candidates = [
      metaContent(html, 'og:image'),
      metaContent(html, 'twitter:image'),
      metaContent(html, 'twitter:image:src')
    ].filter(Boolean);

    for (const candidate of candidates) {
      try {
        const resolved = new URL(candidate, response.url || sourceUrl).toString();
        if (/^https?:\/\//i.test(resolved)) return resolved;
      } catch {}
    }
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function metaContent(html, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const direct = String(html || '').match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'));
  const reverse = String(html || '').match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'));
  return decodeHtml(direct?.[1] || reverse?.[1] || '');
}

function decodeHtml(value = '') {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function withEditorialAi(env) {
  if (!env?.AI || env.__uorquiEditorialAi) return env;

  const originalAi = env.AI;
  const wrappedAi = Object.create(originalAi);

  wrappedAi.run = async (model, input) => {
    const prompt = promptText(input);
    const isNewsPrompt = /MANCHETE:\s*/i.test(prompt) && /FONTE:\s*/i.test(prompt);
    if (!isNewsPrompt) return originalAi.run.call(originalAi, model, input);

    const key = prompt.slice(0, 1800);
    const adjustedInput = {
      ...input,
      messages: [
        {
          role: 'system',
          content: 'Regra editorial obrigatória do Uorqui: escreva em tom jornalístico e informativo. NÃO termine com pergunta, NÃO faça pergunta ao leitor e NÃO inclua chamada genérica de engajamento.'
        },
        ...(Array.isArray(input?.messages) ? input.messages : [])
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
  return `Segundo ${source}, ${normalizedHeadline}. A informação foi mantida em formato factual, sem acrescentar detalhes que não estejam confirmados na matéria original.`;
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
