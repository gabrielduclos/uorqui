interface Env {
  /**
   * The separate Node.js/Fastify backend origin, for example
   * https://api.your-future-domain.example. Never point it to the legacy Uorqui.
   */
  API_ORIGIN?: string;
}

function noCacheJson(status: number, error: string): Response {
  return Response.json(
    { error },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function resolveApiOrigin(raw: string, frontEndUrl: URL): URL | null {
  try {
    const url = new URL(raw);
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !localHttp) return null;
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    if (url.origin === frontEndUrl.origin) return null; // Avoid recursive proxy.
    return url;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const incoming = new URL(request.url);
    const apiPath = incoming.pathname.startsWith('/api/');
    const healthPath = incoming.pathname === '/health' || incoming.pathname.startsWith('/health/');

    if (!apiPath && !healthPath) {
      return noCacheJson(404, 'Not found');
    }

    if (!env.API_ORIGIN) {
      // Never serve the SPA index.html for missing authentication endpoints.
      return noCacheJson(503, 'API unavailable');
    }

    const origin = resolveApiOrigin(env.API_ORIGIN, incoming);
    if (!origin) return noCacheJson(503, 'API unavailable');

    const upstreamUrl = new URL(incoming.pathname + incoming.search, origin);
    // Rebuild the request with the backend URL. Cookies and request body are
    // forwarded, but the new request gets the backend host automatically.
    const headers = new Headers(request.headers);
    headers.delete('host');

    try {
      const upstream = await fetch(new Request(upstreamUrl, {
        method: request.method,
        headers,
        body: request.body,
        redirect: 'manual',
      }));
      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.set('Cache-Control', 'no-store');
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch {
      return noCacheJson(502, 'API unavailable');
    }
  },
};
