import core, { RealtimeHub } from './product-v121-mentions-fix.js';

export { RealtimeHub };

const PRODUCT_VERSION = '1.2.22';

export default {
  async fetch(request, env, ctx) {
    const response = await core.fetch(request, env, ctx);
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === 'GET' && response.ok && /^\/api\/media\/[^/]+$/.test(url.pathname)) {
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=900');
      headers.set('X-Uorqui-Version', PRODUCT_VERSION);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    if (url.pathname.startsWith('/api/')) {
      const headers = new Headers(response.headers);
      headers.set('X-Uorqui-Version', PRODUCT_VERSION);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    return response;
  },

  async scheduled(controller, env, ctx) {
    if (typeof core.scheduled === 'function') return core.scheduled(controller, env, ctx);
  }
};
