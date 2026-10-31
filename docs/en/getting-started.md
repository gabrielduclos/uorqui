# Getting started (development scaffold)

[English](getting-started.md) · [Português](../pt-BR/primeiros-passos.md)

> This is a development prototype, **not a functional social network**. Auth code is present, but it needs configuration and the pending migration. Voice, messaging and feeds remain unimplemented.

## Requirements

- Node.js 22 or later and npm.
- A Neon PostgreSQL database is **optional for the initial UI and API health check**. Required when applying migrations or querying data; generating migrations works offline.

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

## Connect the existing Neon database and auth (local development only)

The Neon project `uorqui` already has the **six social tables** and migration `0000` applied to its main branch. The new **Better Auth tables** (`user`, `session`, `account`, `verification`) are defined in migration `0001`, which has been **tested on a temporary Neon branch only**. Do **not** manually apply migration 0001, run `db:migrate` against main, or start real registrations until that migration is approved and applied.

1. Copy `apps/api/.env.example` to `apps/api/.env`.
2. Set `DATABASE_URL` to the private connection string from the Neon console; never paste it into source, CI logs, or issues.
3. Generate `AUTH_SECRET` with `openssl rand -base64 48` and keep it private. Configure `AUTH_BASE_URL=http://localhost:3001` and `WEB_ORIGIN=http://localhost:5173`.
4. **After the approved 0001 migration is verified in main**, set `ENABLE_DEV_SIGNUP=true` for local development only and run `npm run dev`.
5. Open `http://localhost:5173`; sign up, log in, inspect your own session, choose a handle, and sign out. Verify `http://localhost:3001/health/db` reports `connected` before using auth.

The runtime automatically rejects requests to unconfigured authentication endpoints with a 503 error. Registration is disabled by default and **always disabled for `NODE_ENV=production`**. This prototype has **no email-delivery/verification or password-reset implementation**; those are required before any public launch. Better Auth manages password hashing and session cookies; the API checks authenticated sessions before profile creation.

`GET /health` checks the API process, `GET /health/db` checks PostgreSQL, `GET /api/v1/me` requires a session, and `POST /api/v1/onboarding` creates a social identity for the currently logged-in account.

For future schema changes, run `npm run db:generate`, review and commit SQL plus metadata, test in a temporary database branch and apply with `npm run db:migrate` only to the intended environment. Never re-run already applied migrations by pasting SQL.

## Checks

```sh
npm run typecheck
npm run build
```

The Node API and Vite frontend are separate npm workspaces. Dependency versions and deployment targets may need updating as the implementation progresses.

## Security

Never commit `.env` or paste `DATABASE_URL` into issues or chat. Credentials must be kept in the provider secret store when deployed. Do not attach this new app to the live legacy Uorqui database.
