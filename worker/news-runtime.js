import liveNewsCore, { RealtimeHub } from './live-news.js';

export { RealtimeHub };

const LIVE_NEWS_INTERVAL_MS = 15 * 60 * 1000;
let lastTrafficKickAt = 0;
let trafficKickInFlight = false;
const emptyNewsAttempts = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const now = Date.now();

    // Segunda garantia além do Cron Trigger: se o Uorqui estiver recebendo
    // tráfego e o último disparo local tiver mais de 15 minutos, roda o mesmo
    // ciclo editorial em background. Assim uma falha/atraso do trigger da
    // Cloudflare não obriga o Superadmin a publicar manualmente.
    if (
      url.pathname.startsWith('/api/') &&
      request.method !== 'OPTIONS' &&
      !trafficKickInFlight &&
      now - lastTrafficKickAt >= LIVE_NEWS_INTERVAL_MS
    ) {
      lastTrafficKickAt = now;
      trafficKickInFlight = true;
      const task = kickLiveNewsFromTraffic(env, ctx, now)
        .catch(error => console.error('Uorqui traffic live-news fallback failed:', error?.message || error))
        .finally(() => { trafficKickInFlight = false; });
      if (ctx?.waitUntil) ctx.waitUntil(task);
    }

    return liveNewsCore.fetch(request, withEditorialAi(env), ctx);
  },

  async scheduled(controller, env, ctx) {
    lastTrafficKickAt = Date.now();
    return liveNewsCore.scheduled(controller, withEditorialAi(env), ctx);
  }
};

async function kickLiveNewsFromTraffic(env, ctx, now) {
  // Usa minuto diferente de zero para não repetir as rotinas horárias antigas;
  // o live-news.js executa o editor de notícias em qualquer minuto do scheduled.
  const fakeTime = new Date(now);
  fakeTime.setUTCMinutes(fakeTime.getUTCMinutes() === 0 ? 1 : fakeTime.getUTCMinutes(), 0, 0);
  const controller = { scheduledTime: fakeTime.getTime(), cron: 'traffic-fallback' };
  return liveNewsCore.scheduled(controller, withEditorialAi(env), ctx);
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

  // Em conteúdo jornalístico do Uorqui, uma última sentença interrogativa é
  // tratada como chamada de engajamento e removida. O corpo factual permanece.
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
