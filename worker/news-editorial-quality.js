const downstreamFetch = globalThis.fetch.bind(globalThis);

const SKIP_TOKEN = '__UORQUI_SKIP_INCOMPLETE_NEWS__';
const PROMOTIONAL_CONTEXT_RE = /(?:programa\s+de\s+afiliad|link(?:s)?\s+(?:de|para)\s+(?:compra|afiliad)|ganh(?:a|ar)\s+(?:uma\s+)?comiss[aã]o|parceiros?\s+(?:comerciais?|que\s+ajudam)|melhores\s+pre[cç]os|\d+x\s+sem\s+juros|cupom|publicidade|conte[uú]do\s+patrocinado|oferta\s+especial|compre\s+(?:agora|aqui)|loja\s+parceira|cart[aã]o(?:ões)?\s+presente)/i;
const BAD_OUTPUT_RE = /(?:n[aã]o\s+forneceu\s+mais\s+informa[cç][oõ]es|mais\s+detalhes\s+(?:devem|podem|ser[aã]o)\s+(?:surgir|divulgados|revelados)|not[ií]cia\s+importante\s+para|podem\s+esperar\s+por\s+mais\s+detalhes|ganh(?:a|ar)\s+(?:uma\s+)?comiss[aã]o|\d+x\s+sem\s+juros|melhores\s+pre[cç]os|programa\s+de\s+afiliad)/i;

// Última trava editorial antes do Firestore. Se a IA sinalizar que a matéria
// não identifica o assunto central, ou ainda devolver publicidade/enchimento,
// o post não é gravado. É melhor perder uma pauta do que publicar algo vago.
globalThis.fetch = async (input, init) => {
  try {
    const url = input instanceof Request ? input.url : String(input || '');
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const isNewsPostWrite = method === 'PATCH' &&
      /firestore\.googleapis\.com\/v1\/projects\/[^/]+\/databases\/\(default\)\/documents\/posts\//i.test(url) &&
      typeof init?.body === 'string';

    if (isNewsPostWrite) {
      const payload = JSON.parse(init.body);
      const fields = payload?.fields;
      const mode = String(fields?.aiContentMode?.stringValue || '');
      const text = String(fields?.text?.stringValue || '');
      if (mode === 'news' && shouldRejectPublishedText(text)) {
        console.warn('Uorqui incomplete/generic news blocked before publish', {
          headline: String(fields?.sourceHeadline?.stringValue || '').slice(0, 180),
          source: String(fields?.sourceName?.stringValue || '').slice(0, 100)
        });
        return new Response(JSON.stringify({
          error: { code: 422, message: 'Pauta descartada por qualidade editorial.' }
        }), {
          status: 422,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      }
    }
  } catch (error) {
    console.warn('Uorqui editorial publish guard failed:', error?.message || error);
  }

  return downstreamFetch(input, init);
};

export function withNewsEditorialQuality(env) {
  if (!env?.AI || env.__uorquiNewsEditorialQuality) return env;

  const originalAi = env.AI;
  const wrappedAi = Object.create(originalAi);

  wrappedAi.run = async (model, input) => {
    const prompt = promptText(input);
    const isNews = /MANCHETE:\s*/i.test(prompt) && /FONTE:\s*/i.test(prompt);
    if (!isNews) return originalAi.run.call(originalAi, model, input);

    const cleanInput = addQualityRules(input);
    let result = await originalAi.run.call(originalAi, model, cleanInput);
    let text = extractAiText(result);

    if (isWeakNewsText(text)) {
      const retryInput = addRetryRules(cleanInput);
      result = await originalAi.run.call(originalAi, model, retryInput);
      text = extractAiText(result);
    }

    if (isWeakNewsText(text)) return SKIP_TOKEN;
    return result;
  };

  const wrappedEnv = Object.create(env);
  Object.defineProperty(wrappedEnv, 'AI', { value: wrappedAi, enumerable: true });
  Object.defineProperty(wrappedEnv, '__uorquiNewsEditorialQuality', { value: true, enumerable: false });
  return wrappedEnv;
}

function addQualityRules(input) {
  const originalMessages = Array.isArray(input?.messages) ? input.messages : [];
  const messages = originalMessages.map((message) => {
    if (typeof message?.content !== 'string') return message;
    return { ...message, content: sanitizeContext(message.content) };
  });

  return {
    ...input,
    messages: [
      {
        role: 'system',
        content: [
          'Regra de qualidade editorial obrigatória do Uorqui.',
          'A publicação precisa entregar fatos concretos e ser autossuficiente.',
          'No primeiro parágrafo, identifique explicitamente o elemento central da notícia pelo nome quando ele existir no material: jogo, produto, empresa, pessoa, evento, filme, veículo ou local.',
          `Se o material NÃO identificar claramente o elemento central (por exemplo: diz apenas "um novo jogo" sem informar o título), responda EXATAMENTE ${SKIP_TOKEN}.`,
          'Nunca tente adivinhar ou completar um nome ausente.',
          'Ignore completamente publicidade, afiliados, comissão por links, cupons, parceiros comerciais, lojas, ofertas, condições de pagamento e autopromoção do veículo.',
          'Não escreva frases de enchimento como "a fonte não forneceu mais informações", "mais detalhes devem surgir", "é uma notícia importante" ou equivalentes.',
          'Cada parágrafo deve acrescentar pelo menos um fato concreto: nome, data, plataforma, disponibilidade, valor, número, local, mudança, consequência ou declaração realmente presente no material.',
          'Prefira um texto menor e informativo a um texto longo e vazio.'
        ].join(' ')
      },
      ...messages
    ]
  };
}

function addRetryRules(input) {
  const messages = Array.isArray(input?.messages) ? [...input.messages] : [];
  messages.push({
    role: 'system',
    content: `Sua resposta anterior ficou genérica ou trouxe conteúdo promocional. Reescreva usando somente fatos concretos. Nomeie o assunto central. Se o nome não estiver no material, responda somente ${SKIP_TOKEN}.`
  });
  return { ...input, messages };
}

function sanitizeContext(value) {
  const lines = String(value || '').split(/\n+/);
  const kept = lines.filter((line) => {
    const text = line.trim();
    if (!text) return true;
    if (/^FONTE:/i.test(text)) return true;
    return !PROMOTIONAL_CONTEXT_RE.test(text);
  });
  return kept.join('\n');
}

function shouldRejectPublishedText(text) {
  const value = String(text || '').trim();
  if (!value || value.includes(SKIP_TOKEN)) return true;
  if (BAD_OUTPUT_RE.test(value)) return true;
  return false;
}

function isWeakNewsText(text) {
  const value = String(text || '').trim();
  if (!value || value.includes(SKIP_TOKEN)) return true;
  if (BAD_OUTPUT_RE.test(value)) return true;

  // Padrões que normalmente denunciam que a pauta não conseguiu identificar
  // o próprio objeto da notícia. Não bloqueamos a expressão se houver um nome
  // próprio próximo (ex.: "o novo jogo Doom: ...").
  if (/\b(?:um|o)\s+novo\s+jogo\b/i.test(value) && !/\b(?:jogo|game)\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç'’:-]{2,}/u.test(value)) return true;
  if (/\b(?:um|o)\s+novo\s+(?:produto|modelo|filme|aplicativo|recurso)\b/i.test(value) && /n[aã]o\s+(?:foi|é)\s+(?:informado|revelado|divulgado)/i.test(value)) return true;

  return false;
}

function promptText(input) {
  const messages = Array.isArray(input?.messages) ? input.messages : [];
  return messages.map((message) => {
    if (typeof message?.content === 'string') return message.content;
    if (!Array.isArray(message?.content)) return '';
    return message.content.map((part) => typeof part === 'string' ? part : String(part?.text || part?.content || '')).join('\n');
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
  }
  return '';
}
