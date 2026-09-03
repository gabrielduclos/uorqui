const downstreamFetch = globalThis.fetch.bind(globalThis);

// Esta camada deve ser importada ANTES das demais camadas de imagem. Assim ela
// recebe a gravação final depois que recovery/source-safety já fizeram suas
// alterações e funciona como última barreira antes do Firestore.
globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input || '');
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  let nextInit = init;

  try {
    if (
      method === 'PATCH' &&
      /firestore\.googleapis\.com\/v1\/projects\/[^/]+\/databases\/\(default\)\/documents\/posts\//i.test(url) &&
      typeof init?.body === 'string'
    ) {
      const payload = JSON.parse(init.body);
      const fields = payload?.fields;
      if (fields && String(fields?.aiContentMode?.stringValue || '') === 'news') {
        const current = [
          String(fields?.sourceImageUrl?.stringValue || ''),
          ...((fields?.sourceImageUrls?.arrayValue?.values || []).map(item => String(item?.stringValue || '')))
        ];
        const safe = unique(current).filter(isSafeArticleImage).slice(0, 4);
        fields.sourceImageUrl = { stringValue: safe[0] || '' };
        fields.sourceImageUrls = { arrayValue: { values: safe.map(value => ({ stringValue: value })) } };
        nextInit = { ...init, body: JSON.stringify(payload) };

        if (safe.length !== unique(current).filter(Boolean).length) {
          console.info('Uorqui social/icon images removed from news post', {
            removed: Math.max(0, unique(current).filter(Boolean).length - safe.length),
            kept: safe.length
          });
        }
      }
    }
  } catch (error) {
    console.warn('Uorqui final news image safety failed:', error?.message || error);
  }

  return downstreamFetch(input, nextInit);
};

function isSafeArticleImage(value) {
  const raw = String(value || '').trim();
  if (!/^https?:\/\//i.test(raw)) return false;

  let url;
  try { url = new URL(raw); }
  catch { return false; }

  const host = url.hostname.toLowerCase();
  const full = safeDecode(url.toString()).toLowerCase();
  const path = safeDecode(url.pathname).toLowerCase();

  if (/\.svg(?:\?|$)/i.test(full)) return false;

  // Marcas sociais e elementos de interface nunca são conteúdo editorial.
  if (/(?:^|[\/_\-.])(?:facebook|fb|instagram|insta|youtube|linkedin|twitter|x-twitter|tiktok|tik-tok|whatsapp|telegram|pinterest|reddit|threads|bluesky|mastodon|snapchat|discord)(?:[\/_\-.]|$)/i.test(path)) return false;
  if (/(?:social|share|sharing|follow|rede[-_]?social|social[-_]?media|social[-_]?network)/i.test(full)) return false;
  if (/(?:logo|favicon|brandmark|sprite|avatar|author|perfil|profile|badge|emoji|icon|icone|ícone|widget|newsletter|advert|publicidade|tracking|pixel|placeholder|default[-_.]?image|no[-_.]?image)/i.test(full)) return false;

  // CDNs usados essencialmente para ícones/fontes de interface.
  if (/(?:^|\.)(?:flaticon\.com|icons8\.com|simpleicons\.org|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|fontawesome\.com)$/i.test(host)) return false;
  if (/(?:^|\.)gstatic\.com$/i.test(host)) return false;
  if (/(?:^|\.)news\.google\./i.test(host)) return false;

  // Arquivos explicitamente pequenos/ícones quadrados são descartados. Não
  // usamos isso para tamanhos editoriais maiores para não perder thumbnails.
  if (/(?:^|[\/_\-])(?:16|20|24|28|32|36|40|48|50|56|60|64|72|80|96|100|120|128)x(?:16|20|24|28|32|36|40|48|50|56|60|64|72|80|96|100|120|128)(?:[\/_\-.]|$)/i.test(path)) return false;

  return true;
}

function unique(values) {
  const seen = new Set();
  const output = [];
  for (const value of values || []) {
    const item = String(value || '').trim();
    if (!item) continue;
    const key = imageIdentity(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function imageIdentity(value) {
  try {
    const url = new URL(value);
    for (const key of ['url', 'src', 'image', 'img']) {
      const nested = url.searchParams.get(key);
      if (!nested) continue;
      const decoded = safeDecode(nested);
      if (/^https?:\/\//i.test(decoded) && decoded !== value) return imageIdentity(decoded);
    }
    const path = safeDecode(url.pathname).toLowerCase()
      .replace(/[-_](?:\d{2,4})x(?:\d{2,4})(?=\.[a-z0-9]{2,5}$)/gi, '')
      .replace(/\/\d{2,4}x\d{2,4}\//g, '/');
    return `${url.hostname.toLowerCase()}|${path.split('/').filter(Boolean).pop() || path}`;
  } catch {
    return String(value || '').split(/[?#]/)[0].toLowerCase();
  }
}

function safeDecode(value) {
  try { return decodeURIComponent(String(value || '')); }
  catch { return String(value || ''); }
}
