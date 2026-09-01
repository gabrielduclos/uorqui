import liveNewsCore, { RealtimeHub } from './live-news.js';

export { RealtimeHub };

const emptyNewsAttempts = new Map();

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
