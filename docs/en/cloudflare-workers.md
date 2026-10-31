# Web frontend on Cloudflare Workers

[English](cloudflare-workers.md) · [Português](../pt-BR/cloudflare-workers.md)

## Architecture

The Uorqui React/Vite/Tailwind single-page application is built to **static assets** and served by **Cloudflare Workers Static Assets**, not Cloudflare Pages. Its separate Worker handles same-origin `/api/*` and `/health*` requests and forwards them to an independent **Node.js + Fastify** API. The API will connect to **Neon PostgreSQL using Drizzle**.

The Worker **does not** run Fastify or hold `DATABASE_URL`/`AUTH_SECRET`. The Fastify service's hosting provider has not been selected. No deployment has been made and the existing legacy `uorqui.app` domain and its Worker remain untouched.

## Files

- `apps/web/wrangler.jsonc`: unique Worker name `uorqui-social-web`, built asset directory, SPA fallback, API-first routing
- `apps/web/worker/index.ts`: small same-origin reverse proxy with 503 fallback when backend is unconfigured
- `apps/web/.dev.vars.example`: template for previewing a separate local API
- `apps/web/vite.config.ts`: unchanged Vite development proxy for the separately running local Fastify API

## Local validation

From the repository root, with Node.js 22 or later:

```sh
npm install
npm run build -w @uorqui/web
npm run check:worker -w @uorqui/web
```

To preview the Worker rather than the regular Vite server, start the API separately (`npm run dev -w @uorqui/api`), copy `apps/web/.dev.vars.example` to `apps/web/.dev.vars`, then run:

```sh
npm run preview:worker -w @uorqui/web
```

The preview uses `API_ORIGIN=http://127.0.0.1:3001` from the local example. For authentication in this preview, the API's private `AUTH_BASE_URL` and `WEB_ORIGIN` must both match the preview's browser origin; otherwise Better Auth may reject requests or cookies. Vite development at `http://localhost:5173` remains an option.

## Future isolated deployment (not performed)

1. Deploy **`uorqui-social-web`** as a **new Worker**, never to the existing legacy service or its domain. Do not add a route to `uorqui.app` while it serves the legacy product.
2. Build the frontend via `npm run build -w @uorqui/web`; deploy with `npm run deploy:worker -w @uorqui/web` only when explicitly approved. The Worker can serve static pages independently, but API calls will return 503 until the backend is configured.
3. Host the API on a separate Node.js service with HTTPS, a stable origin and private `DATABASE_URL` and `AUTH_SECRET` supplied through the hosting provider's secrets management.
4. Configure the new web Worker's **`API_ORIGIN`** as the HTTPS **origin only** of that independent API (no path). On Cloudflare, use the Worker's runtime variables/secrets settings; do not commit deployment URLs that might become invalid or private credentials.
5. Configure the Fastify service's `AUTH_BASE_URL` and `WEB_ORIGIN` to the **public origin of the new frontend Worker**. This preserves first-party cookie sessions on proxied `/api/auth/*` requests.
6. Test the Worker proxy, cookies, protected routes, logout, failure handling and security headers in a staging environment before authorizing public access. **Public registrations remain disabled** until email verification, recovery and abuse protection are implemented.

The frontend Worker forwards cookies and response headers but always sets `Cache-Control: no-store` on API responses to avoid caching private data. Missing or invalid `API_ORIGIN` returns 503 JSON instead of accidentally returning `index.html` to an API caller.
