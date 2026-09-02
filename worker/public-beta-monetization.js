const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

/**
 * Beta público: nenhuma nova cobrança ou ativação de monetização pode ser
 * iniciada. Mantemos consultas, cancelamentos e webhooks funcionando para que
 * estados antigos possam ser reconciliados sem risco.
 */
export function publicBetaMonetizationResponse(request) {
  const method = String(request?.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;

  let path = '';
  try { path = new URL(request.url).pathname; }
  catch { return null; }

  const companyCheckout = method === 'POST' && /^\/api\/companies\/[^/]+\/billing\/checkout\/?$/i.test(path);
  const creatorWrite = method !== 'GET' && /^\/api\/creator(?:\/|$)/i.test(path);

  if (!companyCheckout && !creatorWrite) return null;

  return new Response(JSON.stringify({
    error: 'Recurso em breve. Durante o beta público, pagamentos e monetização estão desativados.',
    code: 'PUBLIC_BETA_COMING_SOON',
    comingSoon: true,
    publicBeta: true
  }), {
    status: 423,
    headers: JSON_HEADERS
  });
}
