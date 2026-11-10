import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

const MAX_AGE_MS = 120_000;
const proofHeaders = {
  ip: 'x-uorqui-edge-ip',
  timestamp: 'x-uorqui-edge-ts',
  signature: 'x-uorqui-edge-proof',
} as const;

function header(headers: Record<string, unknown>, key: string): string | null {
  const value = headers[key];
  return typeof value === 'string' ? value : null;
}

export function visitorIpProofPayload(
  ip: string, epochSeconds: string, method: string, pathname: string,
): string {
  return ['uorqui-edge-ip-v1', ip, epochSeconds, method.toUpperCase(), pathname].join('\n');
}

/** Authenticate a visitor IP sent across the public Worker -> Render hop. */
export function verifyEdgeVisitorIp(
  headers: Record<string, unknown>,
  method: string,
  pathname: string,
  secret: string | undefined,
  now = Date.now(),
): string | null {
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) return null;
  const ip = header(headers, proofHeaders.ip);
  const timestamp = header(headers, proofHeaders.timestamp);
  const signature = header(headers, proofHeaders.signature);
  if (!ip || !isIP(ip) || !timestamp || !/^\d{10}$/.test(timestamp) ||
      !signature || !/^[0-9a-f]{64}$/i.test(signature) ||
      !Number.isFinite(now) || Math.abs(now - Number(timestamp) * 1000) > MAX_AGE_MS ||
      !pathname.startsWith('/') || method.length > 12) return null;
  const expected = createHmac('sha256', secret)
    .update(visitorIpProofPayload(ip, timestamp, method, pathname))
    .digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected)
    ? ip : null;
}

/** Fail closed on untrusted client-supplied forwarding headers. */
export function resolveVisitorIp(
  headers: Record<string, unknown>,
  method: string,
  pathname: string,
  transportAddress: string | undefined,
  secret: string | undefined,
  now = Date.now(),
): { ip: string | null; source: 'verified-cloudflare' | 'transport' | 'unavailable' } {
  const verified = verifyEdgeVisitorIp(headers, method, pathname, secret, now);
  if (verified) return { ip: verified, source: 'verified-cloudflare' };
  if (transportAddress && isIP(transportAddress)) {
    return { ip: transportAddress, source: 'transport' };
  }
  return { ip: null, source: 'unavailable' };
}

/** A stable-but-anonymous log key so repeated 429s can be compared. */
export function visitorIpLogKey(ip: string | null, secret?: string): string | null {
  if (!ip || !secret) return null;
  return createHmac('sha256', secret).update('uorqui-ip-debug-v1\n' + ip)
    .digest('hex').slice(0, 12);
}
