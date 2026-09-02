const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

/**
 * O Uorqui continua operando normalmente no modo Free e nos fluxos já
 * existentes. Somente novas ativações/mutações do modo Criador ficam
 * temporariamente indisponíveis.
 */
export function publicBetaMonetizationResponse(request) {
  const method = String(request?.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;

  let path = '';
  try { path = new URL(request.url).pathname; }
  catch { return null; }

  const creatorWrite = /^\/api\/creator(?:\/|$)/i.test(path);
  if (!creatorWrite) return null;

  return new Response(JSON.stringify({
    error: 'O modo Criador está temporariamente indisponível.',
    code: 'CREATOR_MODE_UNAVAILABLE',
    creatorUnavailable: true
  }), {
    status: 423,
    headers: JSON_HEADERS
  });
}
