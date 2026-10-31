# Getting started (development scaffold)

[English](getting-started.md) · [Português](../pt-BR/primeiros-passos.md)

> This starter is a development scaffold, **not a functional social network**. Auth, persistence endpoints, community voice and content feeds are not implemented.

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

## Connect to the existing Neon database

1. In your Neon console, open the existing `uorqui` project (São Paulo region); the PostgreSQL database `uorqui` has been provisioned and verified with a read-only SQL query. The initial six application tables and the Drizzle migration journal **have been applied to main and verified**.
2. Copy `apps/api/.env.example` to `apps/api/.env`.
3. Set `DATABASE_URL` to the full database connection URI from Neon.
4. Review the **already generated** initial migration at `apps/api/drizzle/0000_nice_machine_man.sql` and its tracking metadata under `apps/api/drizzle/meta/`. Use `npm run db:generate` only when the Drizzle schema changes.
5. The initial migration **has already been applied** to Neon `main` and recorded in `drizzle.__drizzle_migrations` (verified). **Do not run the initial SQL manually again.**
6. For future schema changes, generate a new migration with `npm run db:generate`, review the new SQL and run `npm run db:migrate` with a private `DATABASE_URL` on the intended environment.

Migrations **change database structure** and are not run automatically during normal application startup. The schema currently describes users, profiles, direct conversations/messages, communities and members, without API or authentication implementations.

## Checks

```sh
npm run typecheck
npm run build
```

The Node API and Vite frontend are separate npm workspaces. Dependency versions and deployment targets may need updating as the implementation progresses.

## Security

Never commit `.env` or paste `DATABASE_URL` into issues or chat. Credentials must be kept in the provider secret store when deployed. Do not attach this new app to the live legacy Uorqui database.
