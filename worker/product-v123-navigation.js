import core, { RealtimeHub } from './product-v122-stabilization.js';

export { RealtimeHub };

const PRODUCT_VERSION = '1.2.23';

export default {
  async fetch(request, env, ctx) {
    const response = await core.fetch(request, env, ctx);
    const url = new URL(request.url);

    // Preserve Cloudflare's special 101 WebSocket response. Rebuilding it with
    // new Response(...) would discard the webSocket object and throw a RangeError.
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket' || response.status === 101) {
      return response;
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
