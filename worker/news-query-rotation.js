const upstreamFetch = globalThis.fetch.bind(globalThis);
const HOUR_MS = 60 * 60 * 1000;
const ROTATION_SIZE = 11; // 10 agentes principais + Saúde
let rotationTimestamp = Date.now();

const RAW_QUERY_VARIANTS = [
  ['tecnologia inteligência artificial segurança digital brasil', [
    'tecnologia inteligência artificial Brasil',
    'inteligência artificial IA novidades',
    'tecnologia inovação startups Brasil',
    'cibersegurança segurança digital tecnologia'
  ]],
  ['games jogos videogames lançamento indústria', [
    'games lançamentos novidades videogames',
    'PlayStation PS5 jogos novidades',
    'Xbox Game Pass jogos novidades',
    'Nintendo Switch 2 jogos novidades',
    'Steam PC games lançamentos',
    'games DLC atualização novos jogos',
    'indústria de games estúdios aquisições',
    'videogames jogos Brasil novidades'
  ]],
  ['motos motociclismo motocicletas brasil', [
    'motos motocicletas Brasil',
    'Honda Yamaha Kawasaki motos',
    'lançamentos motos Brasil',
    'motociclismo motocicletas novidades'
  ]],
  ['carros automóveis indústria automotiva brasil', [
    'carros automóveis Brasil',
    'lançamentos carros Brasil',
    'indústria automotiva veículos',
    'carros elétricos híbridos Brasil'
  ]],
  ['finanças economia juros bancos brasil', [
    'economia finanças Brasil',
    'juros inflação Banco Central Brasil',
    'bancos fintech investimentos Brasil',
    'mercado financeiro dólar bolsa Brasil'
  ]],
  ['empregos carreira mercado de trabalho brasil', [
    'empregos mercado de trabalho Brasil',
    'carreira vagas trabalho Brasil',
    'salários profissões mercado Brasil',
    'trabalho remoto empresas carreira'
  ]],
  ['futebol esportes brasil campeonato seleção', [
    'futebol Brasil seleção brasileira',
    'Brasileirão futebol clubes',
    'esportes Brasil competições',
    'Libertadores Copa do Brasil futebol'
  ]],
  ['cinema filmes séries streaming brasil', [
    'filmes séries streaming',
    'Netflix Prime Video Disney séries',
    'cinema lançamentos filmes',
    'streaming entretenimento Brasil'
  ]],
  ['ciência pesquisa descoberta espaço saúde tecnologia', [
    'ciência pesquisa descobertas',
    'espaço astronomia ciência',
    'saúde pesquisa científica',
    'descobertas tecnologia ciência'
  ]],
  ['viagens turismo destinos aviação brasil', [
    'viagens turismo Brasil',
    'aviação companhias aéreas Brasil',
    'destinos turismo viagens',
    'passagens aeroportos viagens Brasil'
  ]]
];

const QUERY_VARIANTS = new Map(
  RAW_QUERY_VARIANTS.map(([key, variants]) => [normalize(key), variants])
);

const QUERY_AGENT_INDEX = new Map([
  [normalize('tecnologia inteligência artificial segurança digital brasil'), 0],
  [normalize('games jogos videogames lançamento indústria'), 1],
  [normalize('motos motociclismo motocicletas brasil'), 2],
  [normalize('carros automóveis indústria automotiva brasil'), 3],
  [normalize('finanças economia juros bancos brasil'), 4],
  [normalize('empregos carreira mercado de trabalho brasil'), 5],
  [normalize('futebol esportes brasil campeonato seleção'), 6],
  [normalize('cinema filmes séries streaming brasil'), 7],
  [normalize('ciência pesquisa descoberta espaço saúde tecnologia'), 8],
  [normalize('viagens turismo destinos aviação brasil'), 9]
]);

const EMPTY_RSS = '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Uorqui deferred news agent</title></channel></rss>';

export function setNewsRotationTimestamp(value) {
  const next = Number(value);
  if (Number.isFinite(next) && next > 0) rotationTimestamp = next;
}

export function activeNewsRotationIndex(value = rotationTimestamp) {
  const stamp = Number(value);
  const hourOrdinal = Math.floor((Number.isFinite(stamp) ? stamp : Date.now()) / HOUR_MS);
  return ((hourOrdinal % ROTATION_SIZE) + ROTATION_SIZE) % ROTATION_SIZE;
}

globalThis.fetch = async (input, init) => {
  try {
    const originalUrl = input instanceof Request ? input.url : String(input || '');
    const decision = rewriteNewsSourceUrl(originalUrl);

    if (decision?.deferred) {
      console.info('Uorqui news query deferred by hourly rotation', {
        agentIndex: decision.agentIndex,
        activeAgentIndex: decision.activeAgentIndex,
        query: decision.baseQuery
      });
      return new Response(EMPTY_RSS, {
        status: 200,
        headers: { 'content-type': 'application/rss+xml; charset=utf-8' }
      });
    }

    const rewritten = decision?.url || originalUrl;
    if (rewritten && rewritten !== originalUrl) {
      if (input instanceof Request) input = new Request(rewritten, input);
      else input = rewritten;
    }
  } catch (error) {
    console.warn('Uorqui news query rotation failed:', error?.message || error);
  }
  return upstreamFetch(input, init);
};

function rewriteNewsSourceUrl(value) {
  let url;
  try { url = new URL(String(value || '')); }
  catch { return { url: value }; }

  const google = url.hostname === 'news.google.com' && url.pathname.includes('/rss/search');
  const bing = /(^|\.)bing\.com$/i.test(url.hostname) && url.pathname.includes('/news/search');
  if (!google && !bing) return { url: value };

  const rawQuery = url.searchParams.get('q') || '';
  const baseQuery = rawQuery.replace(/\s+when:\d+d\b/gi, '').trim();
  const normalizedBase = normalize(baseQuery);
  const variants = QUERY_VARIANTS.get(normalizedBase);

  if (!variants?.length) {
    if (google && /when:1d/i.test(rawQuery)) {
      url.searchParams.set('q', rawQuery.replace(/when:1d/gi, 'when:2d'));
    }
    return { url: url.toString() };
  }

  const activeAgentIndex = activeNewsRotationIndex();
  const agentIndex = QUERY_AGENT_INDEX.get(normalizedBase);

  if (Number.isInteger(agentIndex) && agentIndex !== activeAgentIndex) {
    return { deferred: true, agentIndex, activeAgentIndex, baseQuery };
  }

  // Cada agente volta à rotação a cada 11 horas. O ordinal abaixo faz sua
  // consulta avançar apenas quando aquele agente efetivamente roda.
  const hourOrdinal = Math.floor(rotationTimestamp / HOUR_MS);
  const agentRunOrdinal = Math.floor(hourOrdinal / ROTATION_SIZE);
  const variantIndex = ((agentRunOrdinal % variants.length) + variants.length) % variants.length;
  const selected = variants[variantIndex];
  url.searchParams.set('q', google ? `${selected} when:2d` : selected);

  console.info('Uorqui hourly news query selected', {
    source: google ? 'google' : 'bing',
    query: selected,
    variant: variantIndex + 1,
    variants: variants.length,
    agentIndex,
    activeAgentIndex
  });
  return { url: url.toString() };
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
