/**
 * Signed visitor address proof for the Cloudflare Worker -> Render hop.
 *
 * This uses the existing shared attachment proof secret, with a separate
 * domain label so it cannot be confused with attachment or R2-GC signatures.
 * Only Cloudflare's incoming cf-connecting-ip is eligible; never trust a
 * browser-supplied x-forwarded-for or x-real-ip value.
 */
export const VISITOR_IP_PROOF_HEADERS = [
  'x-uorqui-edge-ip', 'x-uorqui-edge-ts', 'x-uorqui-edge-proof',
] as const;

export function visitorIpProofPayload(
  ip: string, epochSeconds: string, method: string, pathname: string,
): string {
  return ['uorqui-edge-ip-v1', ip, epochSeconds, method.toUpperCase(), pathname].join('\n');
}

export async function signedVisitorIpHeaders(
  request: Request, secret?: string, now = Date.now(),
): Promise<Record<(typeof VISITOR_IP_PROOF_HEADERS)[number], string> | null> {
  const ip = request.headers.get('cf-connecting-ip')?.trim() ?? '';
  // IP addresses are strictly validated again by the API using node:net.
  if (!secret || secret.length < 32 || ip.length < 3 || ip.length > 45 ||
      !/^[0-9a-fA-F:.]+$/.test(ip)) return null;
  const ts = String(Math.floor(now / 1000));
  const pathname = new URL(request.url).pathname;
  const hmacKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC', hmacKey, new TextEncoder().encode(
      visitorIpProofPayload(ip, ts, request.method, pathname),
    ),
  );
  return {
    'x-uorqui-edge-ip': ip,
    'x-uorqui-edge-ts': ts,
    'x-uorqui-edge-proof': Array.from(new Uint8Array(signature), byte =>
      byte.toString(16).padStart(2, '0')).join(''),
  };
}
