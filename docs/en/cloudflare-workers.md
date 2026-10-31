# Web frontend on Cloudflare Workers

[English](cloudflare-workers.md) · [Português](../pt-BR/cloudflare-workers.md)

## Architecture

The Uorqui React/Vite/Tailwind single-page application is built to **static assets** and served by **Cloudflare Workers Static Assets**, not Cloudflare Pages. Its separate Worker handles same-origin `/api/*` and `/health*` requests and forwards them to an independent **Node.js + Fastify** API. The API will connect to **Neon PostgreSQL using Drizzle**.

The Worker **does not** run Fastify or hold `DATABASE_URL`/`AUTH_SECRET`. The Fastify service's hosting provider has not been selected. The new Cloudflare Worker `main` already exists and is connected to the `main` branch of `gabrielduclos/uorqui`; **Cloudflare Builds** now owns the frontend build and deployment. The existing legacy `uorqui.app` domain and Worker remain untouched.

## Files

- `apps/web/wrangler.jsonc`: Worker name `main` (matching the already connected Cloudflare Worker), built asset directory, SPA fallback, API-first routing
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

## Automated deployment via Cloudflare Builds

The user has created Worker **`main`** and connected it to the **`main`** branch of **`gabrielduclos/uorqui`**. Cloudflare Builds is configured as follows:

| Setting | Value |
| --- | --- |
| Root directory | `/apps/web` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Worker name in `wrangler.jsonc` | `main` |
| Git repository / branch | `gabrielduclos/uorqui` / `main` |
| CI/CD | Cloudflare Builds deploys on pushes |

Cloudflare installs the web workspace dependencies, builds the React SPA, then uses the Wrangler dependency under `apps/web` to publish the Worker. For frontend changes use **commit → push to main → Cloudflare Builds → Worker**. GitHub Actions is retained for API and Drizzle tests only, not frontend deployment.

**Important:** the Cloudflare Worker named `main` is not the Git branch `main`. Do not use the legacy `uorqui-chat` Worker or point this project at `uorqui.app` without separately authorizing a migration.

The Node.js API has a [separate deployment guide](api-hosting.md), including an optional root-level Render Blueprint. The product is a pre-MVP. Until a separate secure Fastify origin is set as **runtime** `API_ORIGIN`, `/api/*` returns 503. Later, configure database/auth credentials only on the Fastify API host. To retain first-party cookies, the backend `AUTH_BASE_URL` and `WEB_ORIGIN` must match the public origin of the new frontend. Public registration remains disabled pending email verification and abuse controls.

Track builds at **Workers & Pages → main → Builds**. A successful deployment is not proof that social features are finished.
