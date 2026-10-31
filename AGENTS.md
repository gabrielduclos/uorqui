# Uorqui — instructions for coding agents

## Project boundaries

- This repository is the **new open-source Uorqui social network**, not the legacy corporate Uorqui messenger. Never change the legacy `uorqui-chat` Worker, `uorqui.app` routing, or legacy database.
- Frontend: React/TypeScript on Cloudflare Workers Static Assets (`apps/web`), deployed by Cloudflare Builds.
- Backend: **Node.js 22 + Fastify** (`apps/api`), deployed separately on Render (`uorqui-social-api`). Do not migrate the API to Pages Functions or Workers.
- Database: Neon PostgreSQL with Drizzle ORM and Better Auth. Keep schema changes in `apps/api`; never treat the database as a substitute for checked-in migrations.
- The project has English and Brazilian Portuguese public documentation. Do not publish secrets or private commercial decisions.

## Neon agent setup and safe workflow

Read current Neon documentation and use the official Neon MCP tools already connected to the agent host. For local coding-agent environments, follow the Neon CLI onboarding:

```bash
npx neon@latest init
```

The command can configure local authentication, Neon MCP and agent skills; it requires an interactive, authorized local environment. To install just Neon agent skills where appropriate, follow the current Neon CLI instructions (`npx neon@latest skills`). Do **not** commit CLI credentials, generated environment files, or API keys.

Use the **existing Neon project** (`red-dream-55067893`), database `uorqui`. Confirm the branch/project before any SQL operation; do not create a second project by default.

- Prefer a **dedicated Neon development branch** for feature work and migration validation. With Neon CLI, use `neon link`, `neon checkout <feature-branch>` and `neon env pull` locally when authorized; keep `.neon/` and `.env*` out of Git.
- Before schema changes, inspect the current Drizzle schema and migration history. Generate and review migrations; apply and test them against an isolated branch before proposing production deployment.
- Use `neon diff` and read-only `neon inspect db` diagnostics where available. Request explicit approval for destructive SQL, resetting branches, rotating credentials or applying production migrations.
- CI integration tests use **temporary PostgreSQL**. Never point CI tests at the production Neon database or copy production credentials into test fixtures.
- Access Neon via authenticated tools; use least-privilege, project-scoped access where supported. Do not echo or store connection strings in chat, logs, commits or documentation.
- Runtime `DATABASE_URL` is configured as a private environment variable in **Render**, not in GitHub or Cloudflare frontend. `AUTH_SECRET` is also private. Public frontend Worker uses only an HTTPS `API_ORIGIN` binding to reach the Render API.
- Validate `/health/ready` (authentication config + database/schema readiness) before enabling login in the UI. Never enable public signup until email verification, recovery and abuse controls are reviewed.

## Verification

- `npm run typecheck` and `npm run build`.
- GitHub Actions tests must pass, especially the Worker → Fastify → PostgreSQL integration tests.
- Confirm actual Cloudflare Builds and Render deployment statuses separately. A successful Git commit does not prove a healthy live API.
- Keep documentation in `docs/en` and `docs/pt-BR` in sync when architecture changes.

References: https://neon.com/prompts/agent-setup.md ; https://neon.com/blog/just-landed-in-the-neon-cli
