# Architecture — technical beta implementation and future work

[English](architecture.md) · [Português](../pt-BR/arquitetura.md)

> **Version `0.1.0-beta.1`.** The PWA and Fastify API are deployed for controlled testing on Cloudflare/Render with Neon PostgreSQL. This is not a stable public release; real-device and email tests remain open.

## Design approach

Start with a **modular monolith**: one API deployment with clear bounded modules. Split high-cost media and live voice responsibilities into dedicated components or managed services only where justified.

## Confirmed application stack — decision 2026-10-30

| Layer | Decision | Role |
| --- | --- | --- |
| Web/PWA | **React + TypeScript + Tailwind CSS on Cloudflare Workers Static Assets** | Cached SPA, accessible responsive UI and same-origin API gateway |
| API | **Node.js + Fastify + TypeScript** | HTTP endpoints, validation and authorization |
| Database | **PostgreSQL hosted on Neon** | Relational storage for users, posts, communities, conversations and permissions |
| Database access | **Drizzle ORM + Drizzle Kit** | Type-safe SQL queries, schema and versioned migrations |

These technologies are **implemented in the current technical beta**. The custom-domain cutover is managed separately and must be verified before announcing `uorqui.app` as live.

## Web hosting and proxy boundary

The **React SPA is configured for Cloudflare Workers Static Assets** (`apps/web/wrangler.jsonc`) with SPA fallback and a small Worker proxy for `/api/*` and `/health*`. API calls use the same web origin, allowing normal first-party session cookies. The Node.js/Fastify backend stays a separate service and still connects to Neon; the Worker does not run the Fastify server or use Neon credentials.

The Worker requires `API_ORIGIN` before it can forward requests. Without it, API paths return 503 rather than serving an incorrect HTML page. Authentication `AUTH_BASE_URL` and `WEB_ORIGIN` must be configured to the actual public Worker origin before real sign-in. **Cloudflare Worker `main` deploys via Cloudflare Builds; Fastify runs on Render (`uorqui-social-api`).** Domain routing is managed separately with a reversible cutover plan; the legacy databases remain isolated. [Workers deployment guide](cloudflare-workers.md).

## Authentication decisions

**Chosen:** Better Auth (email/password and cookie sessions), using Fastify and the Drizzle PostgreSQL adapter. The auth schema has separate `user`, `account`, `session` and `verification` tables, while the social schema keeps `users`, `profiles`, direct messages and communities. Social user UUIDs are created from the authenticated account's UUID during the protected onboarding flow.

- Auth tables are versioned in migration `0001`, **applied and verified on Neon main**, with two migration entries in Drizzle.
- Fastify uses a PostgreSQL connection pool; Better Auth has a dedicated configuration, strict trusted origins, secure-cookie behavior, server-side session checks and 8-character minimum passwords.
- No runtime credentials are in the public repository; `AUTH_SECRET` and `DATABASE_URL` must stay private.
- Public signup is explicitly enabled in production only when Resend and Turnstile settings are present; human email-verification and recovery E2E checks are still pending.
- Sign-up, signed-in session, protected reads, profile creation, invalid inputs, duplicate protection and sign-out **passed an end-to-end test against temporary CI PostgreSQL**. Live Neon health and anonymous access are checked separately; these CI flows use disposable PostgreSQL and do not prove positive real-user email verification.

### Implemented components and remaining evaluations

| Layer | Candidate | Status |
| --- | --- | --- |
| Realtime events | **Server-Sent Events (SSE)** | Implemented for chat/community event delivery; test mobile reconnect behavior |
| Voice rooms | **WebRTC peer-to-peer (mesh)** | Implemented for small rooms; TURN and background support need real-device tests |
| Media/video | **Cloudflare R2** | Implemented for protected uploads; transcoding, quotas and cost controls need further validation |
| Presence and distributed fan-out | Redis | Optional, only when justified |
| Web deployment | **Cloudflare Worker `main` (deployed)** | New beta at `main.uorqui1.workers.dev`; custom-domain cutover separately verified |
| Fastify API deployment | **Render `uorqui-social-api` (deployed)** | Independent Node.js runtime, accessed through Worker proxy |

PostgreSQL and Drizzle manage **structured data**, not original video/image files. Store media separately, with references and permissions in PostgreSQL. The hosted database has service quotas and possible costs that should be monitored as the project grows.

### Local development and environment

- Define versioned migrations with Drizzle Kit; run them through a documented workflow rather than automatic startup mutations.
- Use separate PostgreSQL databases/branches for development, tests and production when available.
- Keep `DATABASE_URL` and all credentials in environment variables; commit only a safe `.env.example` once the scaffold exists.
- Use parameterized, type-safe access and enforce access rules in Fastify services, never only in the React client.
- Prefer straightforward SQL and indexes before adding an extra cache or queue. Measure query performance and connection usage.


## Modules and boundaries

**Identity & profiles:** accounts, authentication, settings and relationships. **Direct messaging:** strictly two-person conversations and receipts. **Communities:** membership, roles, channels and invitations. **Feed:** posts, follows, ranking and content permissions. **Media:** uploads, processing, quotas and signed access. **Voice:** rooms, participants and moderation. **Trust & safety:** reports, blocking, rate limits and audit trails. **Notifications:** delivery state and privacy-aware payloads.

## Core entities (draft)

user, profile, follow, direct_conversation, direct_message, community, member, role, channel, channel_message, voice_room, presence, post, media_asset, comment, reaction, notification, report, moderation_action.

## Non-negotiable security requirements

- All content and membership authorization is enforced **server-side**, not just hidden in UI.
- Never expose a private community through feed recommendations, thumbnails, copied media URLs, search, or push notifications.
- Apply rate limits, file type/size validation, content scanning strategy, secure credentials, and audit events.
- Use short-lived media access when appropriate; secrets and production data do not belong in Git.
- Define data retention, deletion/export requests, backups, restoration tests and migration policies.
- Avoid saying messages are end-to-end encrypted until a reviewed design is implemented.
- Build abuse reporting and moderator controls before public rollout.

## Reliability and resource economics

Define delivery/receipt semantics, pagination, idempotent sends, replay on reconnect, push cancellation rules, and offline behavior before coding. Monitor media storage/egress and voice participant-minutes from the beginning. PWA background voice behavior differs across mobile operating systems; test on real devices instead of promising universal support.

## Delivery and developer experience

Versioned schema migrations; automated linting, unit/integration/E2E tests; CI on pull requests; local development setup (once scaffold exists); release notes and rollback playbooks. English and Brazilian Portuguese documentation must be updated together when modifying product decisions.

## Isolation from the old product

The earlier enterprise messenger remains separate. The migration of `uorqui.app` to the new Worker is a **separately authorized, reversible change**; never reuse the legacy messenger's databases, credentials, push keys or other Worker bindings.
