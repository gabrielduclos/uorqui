import core, { RealtimeHub } from './official-hotfix.js';

export { RealtimeHub };

const emptyAttempts = new Map();

export default {
  async fetch(request, env, ctx) {
    return core.fetch(request, withAiNewsCompatibility(env), ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof core.scheduled === 'function') {
      return core.scheduled(controller, withAiNewsCompatibility(env), ctx);
    }
  }
};

function withAiNewsCompatibility(env) {
  if (!env?.AI || env.__uorquiAiNewsCompat) return env;

  const originalAi = env.AI;
  const wrappedAi = Object.create(originalAi);

  wrappedAi.run = async (model, input) => {
    const prompt = promptText(input);
    const isNewsPrompt = /MANCHETE:\s*/i.test(prompt) && /FONTE:\s*/i.test(prompt);
    const key = isNewsPrompt ? prompt.slice(0, 1800) : '';

    let result;
    let runError = null;
    try {
      result = await originalAi.run.call(originalAi, model, input);
    } catch (error) {
      runError = error;
    }

    const text = extractAiText(result);
    if (text) {
      if (key) emptyAttempts.delete(key);
      // Normaliza formatos novos/alternativos do Workers AI para o formato
      // que o pipeline editorial do Uorqui já consome.
      return { response: text };
    }

    if (!isNewsPrompt) {
      if (runError) throw runError;
      return result;
    }

    const attempts = (emptyAttempts.get(key) || 0) + 1;
    emptyAttempts.set(key, attempts);
    const lastTextModel = /llama-3\.1-8b-instruct-fast/i.test(String(model || '')) || attempts >= 2;

    if (!lastTextModel) {
      if (runError) throw runError;
      return result;
    }

    emptyAttempts.delete(key);
    const fallback = factualNewsFallback(prompt);
    if (fallback) {
      console.warn('Uorqui AI news text fallback used', model, runError?.message || 'empty response');
      return { response: fallback };
    }

    if (runError) throw runError;
    return result;
  };

  const compatibleEnv = Object.create(env);
  Object.defineProperty(compatibleEnv, 'AI', { value: wrappedAi, enumerable: true });
  Object.defineProperty(compatibleEnv, '__uorquiAiNewsCompat', { value: true, enumerable: false });
  return compatibleEnv;
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

  const direct = [
    result.response,
    result.output_text,
    result.text,
    result.result?.response,
    result.result?.output_text,
    result.result?.text,
    result.choices?.[0]?.message?.content,
    result.choices?.[0]?.text
  ];

  for (const candidate of direct) {
    const text = contentText(candidate);
    if (text.trim()) return text.trim();
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }

  return '';
}

function factualNewsFallback(prompt) {
  const headline = promptField(prompt, 'MANCHETE');
  if (!headline) return '';

  const source = promptField(prompt, 'FONTE') || 'a fonte original';
  const publishedAt = promptField(prompt, 'PUBLICADA EM');
  const normalizedHeadline = headline.replace(/[\s.!?]+$/g, '').trim();
  const when = publishedAt && !/^recentemente$/i.test(publishedAt)
    ? ` A matéria foi publicada em ${publishedAt}.`
    : '';

  return `Segundo ${source}, ${normalizedHeadline}.${when} Este resumo usa somente as informações confirmadas na manchete e na fonte original, sem acrescentar detalhes não verificados. O que você acha desse assunto?`;
}

function promptField(prompt, label) {
  const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(prompt || '').match(new RegExp(`(?:^|\\n)${escaped}:\\s*([^\\n]+)`, 'i'));
  return String(match?.[1] || '').trim();
}
