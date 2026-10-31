# Hosting the Uorqui Fastify API

The React UI is deployed by **Cloudflare Builds** to Worker `main` at https://main.uorqui1.workers.dev. The Fastify API requires a **separate Node.js runtime** and is **not deployed yet**.

## Optional Render Blueprint

Root-level `render.yaml` describes a **separate** `uorqui-social-api` Node service. Its proposed `free` plan is for development only and depends on Render availability, limits and spin-down policies; choose a paid plan as needed before real users. Connecting Render and approving any charges remain separate account actions.

- Build: `npm install --no-audit --no-fund && npm run build -w @uorqui/api`
- Start: `node apps/api/dist/server.js`
- Health check: `/health/db`; requires Neon access and both Drizzle migrations.
- Node 22, `NODE_ENV=production`, `ENABLE_DEV_SIGNUP=false`.

The Render dashboard supplies `DATABASE_URL` privately (`sync: false`); `AUTH_SECRET` can be generated as an environment secret (`generateValue: true`). Never commit database credentials. The existing public Worker origin is used for `AUTH_BASE_URL` and `WEB_ORIGIN`.

After the Node service has a stable HTTPS URL, verify its `GET /health/db` returns 200 and configure Cloudflare Worker **runtime** variable `API_ORIGIN` to the HTTPS origin (without a path). The frontend Worker then proxies `/api/*` through the separate backend while preserving first-party session cookies.

Fastify binds to `0.0.0.0` when `NODE_ENV=production` (and loopback locally); `HOST` can override this if needed.

Public registrations remain disabled. Email verification, account recovery and abuse controls are required before launch. Never route the new service to `uorqui.app` or reuse the legacy `uorqui-chat` Worker or database.
