# Getting started — technical beta

[English](getting-started.md) · [Português](../pt-BR/primeiros-passos.md)

> **Technical beta `0.1.0-beta.1`:** direct messages, hybrid feed, communities, voice rooms and authentication are implemented and deployed. Real-device PWA, email and push tests are still incomplete. These instructions are for local development; never use production database credentials.

## Requirements

- Node.js 22 or later and npm.
- Local PostgreSQL or an **isolated Neon development branch** for authenticated, persistent features. A database is optional only to open the interface or check the running API process.

## Run locally

```sh
git clone https://github.com/gabrielduclos/uorqui.git
cd uorqui
npm install
npm run dev
```

- Web: http://localhost:5173
- API: http://127.0.0.1:3001/health
- API status: http://127.0.0.1:3001/api/v1/status

`/health` verifies **the API process only** and does not test the database.

## Configure a development database and authentication

Versioned Drizzle migrations include social data and the Better Auth tables (`user`, `session`, `account`, `verification`). Production has its own migration history. **Use an isolated development database**, run pending migrations through Drizzle and do not paste SQL into the production Neon branch.

1. Copy `apps/api/.env.example` to `apps/api/.env`.
2. Set `DATABASE_URL` to a **test branch** or local PostgreSQL, not production. Never paste credentials into source, CI logs or issues.
3. Generate `AUTH_SECRET` with `openssl rand -base64 48` and keep it private. Configure `AUTH_BASE_URL=http://localhost:3001` and `WEB_ORIGIN=http://localhost:5173`.
4. Apply pending migrations **to the test database** with `npm run db:migrate`. For local registration use `ENABLE_DEV_SIGNUP=true` and `NODE_ENV=development`, run `npm run dev`, and never expose the service publicly.
5. Open `http://localhost:5173`; sign up, log in, inspect your own session, choose a handle, and sign out. Verify `http://localhost:3001/health/db` reports `connected` before using auth.

Endpoints can return 503 when authentication or database readiness is not configured. Development registration is separate from `ENABLE_PUBLIC_SIGNUP`, which can permit production signup **only with** explicitly configured Resend/Turnstile protection and server-side controls. Email verification and password recovery are implemented but still require real end-to-end delivery testing. Better Auth hashes passwords and manages sessions; the API requires a valid session for onboarding.

`GET /health` checks the API process, `GET /health/db` checks PostgreSQL, `GET /api/v1/me` requires a session, and `POST /api/v1/onboarding` creates a social identity for the currently logged-in account.

For future schema changes, run `npm run db:generate`, review and commit SQL plus metadata, test in a temporary database branch and apply with `npm run db:migrate` only to the intended environment. Never re-run already applied migrations by pasting SQL.

## Automated integration test

GitHub Actions creates **ephemeral PostgreSQL**, applies versioned migrations and exercises authentication, onboarding, direct messaging, communities, feed and Worker → Fastify integration without production Neon data. See [API auth integration](https://github.com/gabrielduclos/uorqui/actions/workflows/auth-integration.yml).

## Cloudflare Workers preview

The Vite development server remains unchanged for local development. The frontend also has a Worker bundle/preview configuration; see [Cloudflare Workers hosting](cloudflare-workers.md). The web Worker and the Fastify API are separate services.

## Checks

```sh
npm run typecheck
npm run build
```

The Node API and Vite frontend are separate npm workspaces. Dependency versions and deployment targets may need updating as the implementation progresses.

## Security

Never commit `.env` or paste `DATABASE_URL` into issues or chat. Credentials must be kept in the provider secret store when deployed. Do not attach this new app to the live legacy Uorqui database.
