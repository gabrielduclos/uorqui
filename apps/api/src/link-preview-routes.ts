import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { FastifyInstance, FastifyRequest } from 'fastify';

type SessionReader = (request: FastifyRequest) => Promise<{ user: { id: string } } | null>;
type Preview = { url: string; siteName: string; title: string; description: string | null; image: string | null };
const cache = new Map<string, { expires: number; data: Preview | null }>();
const requestCounts = new Map<string, { minute: number; count: number }>();
const MAX_HTML = 128 * 1024;

function safeUrl(raw: string): URL | null {
  if (raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.port || url.username || url.password ||
        !url.hostname.includes('.') || isIP(url.hostname) ||
        /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(url.hostname)) return null;
    return url;
  } catch { return null; }
}

function publicIPv4(value: string) {
  if (isIP(value) !== 4) return false;
  const [a,b,c] = value.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 192 && b === 0 && c === 0) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

async function loadHtml(url: URL): Promise<{ html?: string; redirect?: string } | null> {
  // Resolve only public IPv4 addresses. Pin the verified IP while keeping
  // the original hostname for TLS SNI, certificate verification and Host.
  const addresses = await lookup(url.hostname, { family: 4, all: true }).catch(() => []);
  if (!addresses.length || addresses.some(address => !publicIPv4(address.address))) return null;
  return new Promise(resolve => {
    let settled = false;
    const finish = (value: { html?: string; redirect?: string } | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const req = httpsRequest({
      hostname: addresses[0].address,
      servername: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'GET',
      timeout: 4500,
      headers: {
        host: url.host,
        accept: 'text/html,application/xhtml+xml',
        'accept-encoding': 'identity',
        'user-agent': 'UorquiLinkPreview/1.0'
      }
    }, response => {
      const status = response.statusCode ?? 0;
      if ([301,302,303,307,308].includes(status) && typeof response.headers.location === 'string') {
        response.resume(); finish({ redirect: response.headers.location }); return;
      }
      const mime = String(response.headers['content-type'] ?? '').toLowerCase();
      if (status !== 200 || !mime.includes('text/html') ||
          Number(response.headers['content-length'] ?? 0) > 1024 * 1024) {
        response.resume(); finish(null); return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_HTML) {
          finish({ html: Buffer.concat(chunks).toString('utf8') });
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => finish({ html: Buffer.concat(chunks).toString('utf8') }));
      response.on('error', () => finish(null));
    });
    req.on('timeout', () => { finish(null); req.destroy(); });
    req.on('error', () => finish(null));
    req.end();
  });
}

function decode(value: string): string {
  return value.replace(/&(?:amp|quot|apos|lt|gt|nbsp|#(\d+)|#x([0-9a-f]+));/gi,
    (entity: string, decimal: string | undefined, hex: string | undefined) => {
      if (decimal || hex) {
        const code = parseInt(decimal ?? hex, decimal ? 10 : 16);
        return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
          ? String.fromCodePoint(code) : '';
      }
      const named: Record<string,string> = {
        '&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '
      };
      return named[entity.toLowerCase()] ?? entity;
    }).replace(/\s+/g, ' ').trim().slice(0,280);
}

function meta(html: string, key: string): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs: Record<string,string> = {};
    for (const match of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
    }
    if ((attrs.property ?? attrs.name ?? '').toLowerCase() === key) return decode(attrs.content ?? '');
  }
  return '';
}

async function fetchPreview(raw: string): Promise<Preview | null> {
  let target = safeUrl(raw);
  if (!target) return null;
  for (let redirects = 0; redirects <= 2; redirects++) {
    const result = await loadHtml(target).catch(() => null);
    if (!result) return null;
    if (result.redirect) {
      if (redirects === 2) return null;
      target = safeUrl(new URL(result.redirect, target).href);
      if (!target) return null;
      continue;
    }
    if (!result.html) return null;
    const html = result.html;
    const title = meta(html, 'og:title') || meta(html, 'twitter:title') ||
      decode(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
    const description = meta(html, 'og:description') || meta(html, 'description') ||
      meta(html, 'twitter:description');
    let image: string | null = null;
    const imageRaw = meta(html, 'og:image') || meta(html, 'twitter:image');
    if (imageRaw) {
      try {
        const candidate = new URL(imageRaw, target);
        if (safeUrl(candidate.href)) image = candidate.href;
      } catch { /* Metadata image is optional. */ }
    }
    return {
      url: target.href,
      siteName: meta(html, 'og:site_name') || target.hostname.replace(/^www\./, ''),
      title: title || target.hostname,
      description: description || null,
      image
    };
  }
  return null;
}

export function registerLinkPreviewRoutes(app: FastifyInstance, readSession: SessionReader) {
  app.get('/api/v1/links/preview', {
    schema: {
      querystring: {
        type: 'object',
        required: ['url'],
        additionalProperties: false,
        properties: { url: { type: 'string', minLength: 8, maxLength: 2048 } }
      }
    }
  }, async (request, reply) => {
    const session = await readSession(request);
    if (!session) return reply.code(401).send({ error: 'Unauthorized' });
    const url = safeUrl((request.query as { url: string }).url);
    if (!url) return reply.code(400).send({ error: 'Invalid link' });
    const key = url.href;
    const saved = cache.get(key);
    if (saved && saved.expires > Date.now())
      return reply.header('Cache-Control','private, no-store').send({ preview: saved.data });
    const nowMinute = Math.floor(Date.now() / 60000);
    const limit = requestCounts.get(session.user.id);
    if (limit?.minute === nowMinute && limit.count >= 24)
      return reply.code(429).send({ error: 'Too many link previews' });
    requestCounts.set(session.user.id, {
      minute: nowMinute, count: limit?.minute === nowMinute ? limit.count + 1 : 1
    });
    const result = await fetchPreview(key).catch(() => null);
    if (cache.size >= 500) cache.delete(cache.keys().next().value!);
    cache.set(key, { data: result, expires: Date.now() + (result ? 3600000 : 300000) });
    return reply.header('Cache-Control','private, no-store').send({ preview: result });
  });
}
