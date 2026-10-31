# Hosting the Uorqui Fastify API

The React UI is deployed by **Cloudflare Builds** to Worker `main` at https://main.uorqui1.workers.dev. The Fastify API requires a **separate Node.js runtime** and is deployed at **https://uorqui-social-api.onrender.com**. Live deployment and database/auth readiness were checked on Oct 31, 2026; repeat checks after each deploy.

## Render Blueprint in use

Root-level `render.yaml` configures a **separate** `uorqui-social-api` Node service. Its `free` plan is for development only and depends on Render availability, limits and spin-down policies; choose a paid plan as needed before real users. Connecting Render and approving any charges remain separate account actions.

- Build: `npm install --include=dev --no-audit --no-fund && npm run build -w @uorqui/api`
- Start: `node apps/api/dist/server.js`
- Health check: `/health/ready`; validates Better Auth configuration, Neon access and both Drizzle migrations. `/health/db` checks only the database.
- Node 22, `NODE_ENV=production`, `ENABLE_DEV_SIGNUP=false`.

The Render dashboard supplies `DATABASE_URL` privately (`sync: false`); `AUTH_SECRET` can be generated as an environment secret (`generateValue: true`). Never commit database credentials. The existing public Worker origin is used for `AUTH_BASE_URL` and `WEB_ORIGIN`.

The public Cloudflare Worker has **`API_ORIGIN=https://uorqui-social-api.onrender.com`** set. Verify `GET /health/ready` after deployments. The frontend Worker then proxies `/api/*` through the separate backend while preserving first-party session cookies.

GitHub Actions also runs a full Cloudflare Worker → Fastify → temporary PostgreSQL test with sessions and logout, without using Neon production data.

Fastify binds to `0.0.0.0` when `NODE_ENV=production` (and loopback locally); `HOST` can override this if needed.

Public registrations stay closed until explicitly enabled: the sign-up UI is navigable, but server-side access is gated on verified email delivery, password recovery, and server-side Turnstile challenges. These flows are implemented but not yet validated end-to-end with production providers. Never route the new service to `uorqui.app` or reuse the legacy `uorqui-chat` Worker or database.

## Enabling production registration (pending)

1. Verify a sending domain in [Resend](https://resend.com) and set `RESEND_API_KEY` and `AUTH_EMAIL_FROM` privately in Render.
2. Create a [Cloudflare Turnstile](https://dash.cloudflare.com/) widget for the **actual frontend hostname** (`main.uorqui1.workers.dev` for now) and set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in Render. The backend verifies CAPTCHA tokens even for requests sent directly to Render.
3. Test delivery and successful email confirmation, retry/resend, password recovery and rejection of invalid challenges with dedicated test accounts.
4. Only then set `ENABLE_PUBLIC_SIGNUP=true` in Render and redeploy. Verify `/api/v1/status` returns `publicRegistration:true`. Set the flag back to `false` to suspend new signups.

Development signup remains restricted to `NODE_ENV=development|test`. The existing 12-character password minimum is preserved. The frontend follows the project's signup-first welcome, accessible forms, password visibility, 16px inputs and action-spinner rules. Never store tokens in commits, chats or public documentation.
