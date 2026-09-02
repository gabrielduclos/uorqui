const upstreamFetch = globalThis.fetch.bind(globalThis);
const SLOT_MS = 15 * 60 * 1000;
const BATCH_COUNT = 3;

const RAW_QUERY_VARIANTS = [
  ['tecnologia inteligência artificial segurança digital brasil', [
    'tecnologia inteligência artificial Brasil',
    'inteligência artificial IA novidades',
    'tecnologia inovação startups Brasil',
    'cibersegurança segurança digital tecnologia'
  ]],
  ['games jogos videogames lançamento indústria', [
    'games jogos lançamentos',
    'PlayStation Xbox Nintendo games',
    'PC games indústria de jogos',
    'videogames novidades Brasil'
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

// As chaves também precisam ser normalizadas. Antes apenas a consulta recebia
// normalize(), então categorias com acentos não encontravam suas variantes.
const QUERY_VARIANTS = new Map(
  RAW_QUERY_VARIANTS.map(([key, variants]) => [normalize(key), variants])
);

// Distribui as 10 comunidades pelos três ciclos principais de cada hora.
// O minuto :00 está reservado à manutenção + Saúde em news-runtime-safe.js.
// :15/:30/:45 processam um lote por vez, mantendo cada invocation bem abaixo
// do limite de subrequests do Cloudflare.
const QUERY_BATCH = new Map([
  [normalize('tecnologia inteligência artificial segurança digital brasil'), 0],
  [normalize('games jogos videogames lançamento indústria'), 0],
  [normalize('motos motociclismo motocicletas brasil'), 0],

  [normalize('carros automóveis indústria automotiva brasil'), 1],
  [normalize('finanças economia juros bancos brasil'), 1],
  [normalize('empregos carreira mercado de trabalho brasil'), 1],

  [normalize('futebol esportes brasil campeonato seleção'), 2],
  [normalize('cinema filmes séries streaming brasil'), 2],
  [normalize('ciência pesquisa descoberta espaço saúde tecnologia'), 2],
  [normalize('viagens turismo destinos aviação brasil'), 2]
]);

const EMPTY_RSS = '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Uorqui deferred news batch</title></channel></rss>';

globalThis.fetch = async (input, init) => {
  try {
    const originalUrl = input instanceof Request ? input.url : String(input || '');
    const decision = rewriteNewsSourceUrl(originalUrl);

    if (decision?.deferred) {
      console.info('Uorqui news query deferred by subrequest budget', {
        batch: decision.batch + 1,
        activeBatch: decision.activeBatch + 1,
        query: decision.baseQuery
      });
      return new Response(EMPTY_RSS, {
        status: 200,
        headers: { 'content-type': 'application/rss+xml; charset=utf-8' }
      });
    }

    const rewritten = decision?.url || originalUrl;
    if (rewritten && rewritten !== originalUrl) {
      if (input instanceof Request) {
        input = new Request(rewritten, input);
      } else {
        input = rewritten;
      }
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

  const slot = Math.floor(Date.now() / SLOT_MS);
  const activeBatch = slot % BATCH_COUNT;
  const batch = QUERY_BATCH.get(normalizedBase);

  if (Number.isInteger(batch) && batch !== activeBatch) {
    return { deferred: true, batch, activeBatch, baseQuery };
  }

  const variantIndex = slot % variants.length;
  const selected = variants[variantIndex];
  url.searchParams.set('q', google ? `${selected} when:2d` : selected);

  console.info('Uorqui news query selected', {
    source: google ? 'google' : 'bing',
    query: selected,
    variant: variantIndex + 1,
    variants: variants.length,
    batch: Number.isInteger(batch) ? batch + 1 : null,
    activeBatch: activeBatch + 1
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
