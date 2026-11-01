# Hosting the Uorqui Fastify API

The React UI is deployed by **Cloudflare Builds** to Worker `main` at https://main.uorqui1.workers.dev. The Fastify API requires a **separate Node.js runtime** and is deployed at **https://uorqui-social-api.onrender.com**. Live deployment and database/auth readiness were checked on Oct 31, 2026; repeat checks after each deploy.

## Render Blueprint in use

Root-level `render.yaml` configures a **separate** `uorqui-social-api` Node service. Its `free` plan is for development only and depends on Render availability, limits and spin-down policies; choose a paid plan as needed before real users. Connecting Render and approving any charges remain separate account actions.

- Build: `npm install --include=dev --no-audit --no-fund && npm run build -w @uorqui/api`
- Start: `node apps/api/dist/server.js`
- Health check: `/health/ready`; validates Better Auth configuration, Neon access and both Drizzle migrations. `/health/db` checks only the database.
- Node 22, `NODE_ENV=production`, `ENABLE_DEV_SIGNUP=false`.

The Render dashboard supplies `DATABASE_URL` privately (`sync: false`); `AUTH_SECRET` can be generated as an environment secret (`generateValue: true`). Never commit database credentials. The canonical frontend origin is configured using `AUTH_BASE_URL` and `WEB_ORIGIN`. During the cutover use `WEB_EXTRA_ORIGINS=https://uorqui.app,https://main.uorqui1.workers.dev` as an explicit allowlist. Change the canonical variables together only after confirming domain routing; revert them if the cutover fails.

The public Cloudflare Worker has **`API_ORIGIN=https://uorqui-social-api.onrender.com`** set. Verify `GET /health/ready` after deployments. The frontend Worker then proxies `/api/*` through the separate backend while preserving first-party session cookies.

GitHub Actions also runs a full Cloudflare Worker → Fastify → temporary PostgreSQL test with sessions and logout, without using Neon production data.

Fastify binds to `0.0.0.0` when `NODE_ENV=production` (and loopback locally); `HOST` can override this if needed.

Public registrations were explicitly enabled on Oct 31, 2026: the sign-up UI is navigable, but server-side access is gated on verified email delivery, password recovery, and server-side Turnstile challenges. These flows are implemented; a human Turnstile completion and real Resend delivery are not yet validated end-to-end. `uorqui.app` is the intended new social domain. Follow the [safe migration runbook](../pt-BR/migracao-dominio-uorqui-app.md) and confirm actual Cloudflare routing before declaring the cutover complete. Never reuse the legacy `uorqui-chat` databases, secrets or Worker bindings.

## Production registration enabled — human E2E still pending

1. Verify a sending domain in [Resend](https://resend.com) and set `RESEND_API_KEY` and `AUTH_EMAIL_FROM` privately in Render.
2. Use the [Cloudflare Turnstile](https://dash.cloudflare.com/) widget configured for **both** `main.uorqui1.workers.dev` and `uorqui.app`. Keep `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in Render. The backend verifies CAPTCHA tokens even for requests sent directly to Render.
3. Test delivery and successful email confirmation, retry/resend, password recovery and rejection of invalid challenges with dedicated test accounts.
4. Set `ENABLE_PUBLIC_SIGNUP=true` in Render and redeploy. **Completed Oct 31, 2026**: `/api/v1/status` returns `publicRegistration:true`; the positive human signup/email path is still pending. Set the flag back to `false` to suspend new signups.

Development signup remains restricted to `NODE_ENV=development|test`. The password minimum is **8 characters**, enforced by Better Auth and the registration/reset forms (since PR #52). The frontend follows the project's signup-first welcome, accessible forms, password visibility, 16px inputs and action-spinner rules. Never store tokens in commits, chats or public documentation.

### Release evidence (Nov 1, 2026)

- [Production smoke run 41333848037](https://github.com/gabrielduclos/uorqui/actions/runs/41333848037) and [auth integration run 41333848001](https://github.com/gabrielduclos/uorqui/actions/runs/41333848001): automated checks pass for the new worker/API path, ephemeral PostgreSQL integration and rejection of invalid Turnstile tokens. These are not human verification or email-delivery tests.
- **Outstanding:** complete a real human Turnstile, receive/verify a Resend email, sign in, test recovery and onboarding. Do not represent this negative security smoke test as full email E2E proof. For emergency rollback, set `ENABLE_PUBLIC_SIGNUP=false` in Render and redeploy.
