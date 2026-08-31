import core, { RealtimeHub } from './social.js';

export { RealtimeHub };

const AI_FACT_SEEDS = {
  'tecnologia-ia': 'O protocolo HTTPS usa TLS para criptografar a comunicação entre cliente e servidor, protegendo dados em trânsito contra leitura e alteração por terceiros.',
  games: 'Pong, lançado comercialmente pela Atari em 1972, é um dos jogos mais importantes da popularização inicial dos arcades.',
  motos: 'A pressão correta dos pneus de uma motocicleta deve seguir a recomendação do fabricante e normalmente é verificada com os pneus frios.',
  carros: 'O sistema ABS evita o travamento das rodas durante frenagens fortes ao modular a pressão de frenagem, ajudando o motorista a manter capacidade direcional.',
  financas: 'Juros compostos calculam juros sobre o capital inicial e também sobre os juros acumulados dos períodos anteriores.',
  carreira: 'A prática deliberada envolve treino focado em habilidades específicas, feedback e correção de erros, em vez de apenas repetir uma tarefa de forma automática.',
  esportes: 'A distância oficial da maratona é 42,195 quilômetros.',
  'filmes-series': 'O cinema sonoro comercial se consolidou no fim da década de 1920; The Jazz Singer, de 1927, é um marco histórico dessa transição.',
  ciencia: 'A luz no vácuo viaja a aproximadamente 299.792 quilômetros por segundo.',
  viagens: 'O fuso horário é definido a partir da rotação da Terra e da divisão convencional do globo em zonas de tempo, com ajustes políticos feitos por cada país.'
};

const AI_SPECIALTIES = {
  'tecnologia-ia': 'tecnologia, inteligência artificial e segurança digital',
  games: 'jogos, história dos games e desenvolvimento',
  motos: 'motociclismo, mecânica preventiva e segurança',
  carros: 'automóveis, manutenção e tecnologia automotiva',
  financas: 'educação financeira e finanças pessoais',
  carreira: 'carreira, mercado de trabalho e desenvolvimento profissional',
  esportes: 'esportes, treinamento e história esportiva',
  'filmes-series': 'cinema, séries e linguagem audiovisual',
  ciencia: 'ciência, natureza e divulgação científica',
  viagens: 'viagens, planejamento e cultura de destinos'
};

let googleTokenCache = { expires: 0, token: '' };
let officialCommunityCache = { expires: 0, items: [], promise: null };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    try {
      if (method === 'GET' && url.pathname === '/api/bootstrap') {
        return await bootstrapWithOfficialCommunities(request, env, ctx, url);
      }

      if (method === 'POST' && url.pathname === '/api/superadmin/ai-agents/seed') {
        return await seedOfficialCommunitiesFast(request, env, ctx, url);
      }

      if (method === 'POST' && url.pathname === '/api/superadmin/ai-agents/publish') {
        return await publishOfficialAgentsFast(request, env, ctx, url);
      }

      return core.fetch(request, env, ctx);
    } catch (error) {
      console.error('Official communities hotfix:', error);
      return json({ error: error?.message || 'Não foi possível concluir esta ação.' }, error?.status || 500);
    }
  },

  async scheduled(controller, env, ctx) {
    if (typeof core.scheduled === 'function') return core.scheduled(controller, env, ctx);
  }
};

async function bootstrapWithOfficialCommunities(request, env, ctx, url) {
  const response = await core.fetch(request, env, ctx);
  if (!response.ok) return response;

  const payload = await response.clone().json().catch(() => null);
  if (!payload || typeof payload !== 'object') return response;

  try {
    const official = await getOfficialCommunities(request, env, ctx, url);
    const joinedIds = new Set((payload.communities || []).map(community => community?.id).filter(Boolean));
    const existing = Array.isArray(payload.allCompanyCommunities) ? payload.allCompanyCommunities : [];
    const merged = new Map(existing.map(community => [community.id, community]));

    for (const community of official) {
      if (!joinedIds.has(community.id)) merged.set(community.id, community);
      payload.communityMap = payload.communityMap || {};
      payload.communityMap[community.id] = community;
    }

    payload.allCompanyCommunities = [...merged.values()];
  } catch (error) {
    console.warn('Official community bootstrap enrichment failed:', error?.message || error);
  }

  return rewriteJson(response, payload);
}

async function getOfficialCommunities(request, env, ctx, url) {
  if (officialCommunityCache.items.length && officialCommunityCache.expires > Date.now()) {
    return officialCommunityCache.items;
  }
  if (officialCommunityCache.promise) return officialCommunityCache.promise;

  officialCommunityCache.promise = (async () => {
    const discoverUrl = new URL('/api/discover', url.origin);
    const discoverResponse = await core.fetch(new Request(discoverUrl, {
      method: 'GET',
      headers: request.headers
    }), env, ctx);
    if (!discoverResponse.ok) return [];
    const discover = await discoverResponse.json().catch(() => ({}));
    const items = (Array.isArray(discover.communities) ? discover.communities : [])
      .filter(community => community?.officialUorqui === true && !community?.companyId);
    officialCommunityCache = {
      expires: Date.now() + 10 * 60 * 1000,
      items,
      promise: null
    };
    return items;
  })().finally(() => {
    officialCommunityCache.promise = null;
  });

  return officialCommunityCache.promise;
}

async function authorizeSuperadmin(request, env, ctx, url) {
  const statusUrl = new URL('/api/superadmin/ai-agents/status', url.origin);
  const response = await core.fetch(new Request(statusUrl, {
    method: 'GET',
    headers: request.headers
  }), env, ctx);
  if (!response.ok) return { response, status: null };
  return { response: null, status: await response.json() };
}

async function seedOfficialCommunitiesFast(request, env, ctx, url) {
  const authorization = await authorizeSuperadmin(request, env, ctx, url);
  if (authorization.response) return authorization.response;

  const backgroundRequest = new Request(new URL('/api/superadmin/ai-agents/seed', url.origin), {
    method: 'POST',
    headers: request.headers
  });
  const task = core.fetch(backgroundRequest, env, ctx).catch(error => {
    console.error('Background official seed failed:', error);
  });
  if (ctx?.waitUntil) ctx.waitUntil(task);

  return json({
    ...authorization.status,
    queued: true,
    message: 'Comunidades oficiais verificadas. A preparação de imagens continua em segundo plano.'
  });
}

async function publishOfficialAgentsFast(request, env, ctx, url) {
  const authorization = await authorizeSuperadmin(request, env, ctx, url);
  if (authorization.response) return authorization.response;

  const status = authorization.status || {};
  const agents = Array.isArray(status.agents) ? status.agents : [];
  const day = status.day || brazilDateKey();
  if (!agents.length) throw httpError(409, 'Nenhum agente oficial foi encontrado. Use “Garantir comunidades” e tente novamente.');

  let published = 0;
  let skipped = 0;
  let failed = 0;
  const results = [];
  let cursor = 0;

  const publishOne = async (agent) => {
    const postId = aiPostId(agent.key, day);
    if (agent.publishedToday || await fsGet(env, 'posts', postId)) {
      skipped += 1;
      results.push({ key: agent.key, name: agent.communityName, status: 'already_published', postId });
      return;
    }

    const text = await generateAgentPost(env, agent);
    if (!text) {
      failed += 1;
      results.push({ key: agent.key, name: agent.communityName, status: 'failed', postId: '' });
      return;
    }

    const createdAt = new Date().toISOString();
    await fsPut(env, 'posts', postId, {
      id: postId,
      authorUid: `uorqui_ai_agent_${agent.key}`,
      authorName: agent.name || 'Equipe Uorqui · IA',
      authorAvatarMediaId: '',
      authorAccountType: 'uorqui_agent',
      authorAiAssisted: true,
      authorTeamLabel: 'Equipe Uorqui · IA',
      scope: 'community',
      companyId: '',
      communityId: agent.communityId,
      communityName: agent.communityName || 'Comunidade Uorqui',
      communityVisibility: 'public',
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
      createdAt,
      updatedAt: createdAt
    });

    published += 1;
    results.push({ key: agent.key, name: agent.communityName, status: 'published', postId });
  };

  const runner = async () => {
    while (cursor < agents.length) {
      const index = cursor++;
      try {
        await publishOne(agents[index]);
      } catch (error) {
        failed += 1;
        results.push({
          key: agents[index]?.key || '',
          name: agents[index]?.communityName || '',
          status: 'failed',
          postId: '',
          error: String(error?.message || error).slice(0, 180)
        });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(3, agents.length) }, () => runner()));

  const refreshed = await authorizeSuperadmin(request, env, ctx, url);
  const freshStatus = refreshed.response ? status : refreshed.status;

  return json({
    ok: true,
    day,
    published,
    skipped,
    failed,
    total: agents.length,
    results,
    ...(freshStatus || status)
  });
}

async function generateAgentPost(env, agent) {
  if (!env.AI) throw httpError(503, 'O binding do Workers AI não está disponível.');
  const specialty = AI_SPECIALTIES[agent.key] || `conteúdo relacionado a ${agent.communityName || 'esta comunidade'}`;
  const factSeed = AI_FACT_SEEDS[agent.key] || 'Escolha apenas um fato científico, histórico ou técnico amplamente estabelecido e que não dependa de informação atual.';
  const prompt = [
    'Você escreve para uma rede social brasileira chamada Uorqui.',
    `Tema da comunidade: ${agent.communityName}. Especialidade: ${specialty}.`,
    'Crie UMA publicação curta, útil e convidativa, em português do Brasil, entre 350 e 700 caracteres.',
    `FATO-BASE VERIFICADO: ${factSeed}`,
    'Escreva a publicação EXCLUSIVAMENTE a partir do fato-base fornecido. Você pode explicar contexto e consequência direta, mas não acrescente números, datas, pesquisas ou alegações que não estejam no fato-base.',
    'Use somente conhecimento estável, consolidado e verificável.',
    'Não escreva notícia de última hora, preço, cotação, placar, estatística temporal ou fato que dependa de informação atual.',
    'Não invente estudos, números, fontes, experiências pessoais ou acontecimentos.',
    'Explique algo concreto e termine com uma pergunta natural para incentivar conversa.',
    'Não diga que é humano e não esconda que o perfil é assistido por IA.',
    'Não use título, hashtags, markdown ou links. Retorne somente o texto da publicação.'
  ].join('\n');

  const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast', {
    messages: [
      { role: 'system', content: 'Priorize precisão factual. Evite qualquer afirmação incerta ou temporal.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 320,
    temperature: 0.2
  });

  return clean(response?.response || response?.result?.response || '', 1200);
}

function aiPostId(key, day) {
  return `uorqui_ai_post_${`${key}_${day}`.replace(/[^a-z0-9-]/g, '_')}`;
}

function brazilDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

async function getGoogleAccessToken(env) {
  if (googleTokenCache.token && googleTokenCache.expires > Date.now() + 60000) return googleTokenCache.token;
  if (!env.FIREBASE_SERVICE_ACCOUNT_EMAIL || !env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw httpError(503, 'Service Account do Firebase não configurada no Worker.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = b64urlJson({ alg: 'RS256', typ: 'JWT' });
  const claims = b64urlJson({
    iss: env.FIREBASE_SERVICE_ACCOUNT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  });
  const input = `${header}.${claims}`;
  const key = await importPrivateKey(env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY);
  const signature = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(input));
  const assertion = `${input}.${b64url(new Uint8Array(signature))}`;
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth2:grant-type:jwt-bearer',
    assertion
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw httpError(503, 'Não foi possível autenticar no Firebase.');
  googleTokenCache = {
    token: data.access_token,
    expires: Date.now() + Number(data.expires_in || 3600) * 1000
  };
  return data.access_token;
}

async function importPrivateKey(pem) {
  const value = String(pem)
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const bytes = Uint8Array.from(atob(value), char => char.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', bytes, {
    name: 'RSASSA-PKCS1-v1_5',
    hash: 'SHA-256'
  }, false, ['sign']);
}

function fsBase(env) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)`;
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
  if (!response.ok) throw httpError(500, `Firestore: ${data?.error?.message || response.statusText}`);
  return data;
}

async function fsGet(env, collection, docId) {
  const document = await fsRequest(env, `/documents/${encPath(collection)}/${encodeURIComponent(docId)}`);
  return document ? fromDoc(document) : null;
}

async function fsPut(env, collection, docId, object) {
  const document = await fsRequest(env, `/documents/${encPath(collection)}/${encodeURIComponent(docId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: toFields({ ...object, id: object.id || docId }) })
  });
  return fromDoc(document);
}

function encPath(value) {
  return String(value).split('/').map(encodeURIComponent).join('/');
}

function fromDoc(document) {
  const object = fromFields(document.fields || {});
  object.id = object.id || decodeURIComponent(document.name.split('/').pop());
  return object;
}

function toFields(object) {
  return Object.fromEntries(
    Object.entries(object)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, toValue(value)])
  );
}

function toValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value)
    ? { integerValue: String(value) }
    : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (typeof value === 'object') return { mapValue: { fields: toFields(value) } };
  return { stringValue: String(value) };
}

function fromFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromValue(value)]));
}

function fromValue(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromValue);
  if ('mapValue' in value) return fromFields(value.mapValue.fields || {});
  return null;
}

function b64urlJson(object) {
  return b64url(new TextEncoder().encode(JSON.stringify(object)));
}

function b64url(bytes) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function rewriteJson(response, payload) {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
