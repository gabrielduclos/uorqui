const upstreamFetch = globalThis.fetch.bind(globalThis);
const SLOT_MS = 15 * 60 * 1000;

const QUERY_VARIANTS = new Map([
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
]);

globalThis.fetch = async (input, init) => {
  try {
    const originalUrl = input instanceof Request ? input.url : String(input || '');
    const rewritten = rewriteNewsSourceUrl(originalUrl);
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
  catch { return value; }

  const google = url.hostname === 'news.google.com' && url.pathname.includes('/rss/search');
  const bing = /(^|\.)bing\.com$/i.test(url.hostname) && url.pathname.includes('/news/search');
  if (!google && !bing) return value;

  const rawQuery = url.searchParams.get('q') || '';
  const baseQuery = rawQuery.replace(/\s+when:\d+d\b/gi, '').trim();
  const variants = QUERY_VARIANTS.get(normalize(baseQuery));
  if (!variants?.length) {
    if (google && /when:1d/i.test(rawQuery)) {
      url.searchParams.set('q', rawQuery.replace(/when:1d/gi, 'when:2d'));
      return url.toString();
    }
    return value;
  }

  const slot = Math.floor(Date.now() / SLOT_MS);
  const selected = variants[slot % variants.length];
  url.searchParams.set('q', google ? `${selected} when:2d` : selected);

  console.info('Uorqui news query selected', {
    source: google ? 'google' : 'bing',
    query: selected,
    variant: (slot % variants.length) + 1,
    variants: variants.length
  });
  return url.toString();
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
