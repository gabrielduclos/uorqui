# Architecture — confirmed core stack and proposed integrations

[English](architecture.md) · [Português](../pt-BR/arquitetura.md)

> An initial local React/Fastify scaffold and Drizzle schema exist. **Neon PostgreSQL and the initial six-table Drizzle migration are applied and verified; the application is not deployed.**

## Design approach

Start with a **modular monolith**: one API deployment with clear bounded modules. Split high-cost media and live voice responsibilities into dedicated components or managed services only where justified.

## Confirmed application stack — decision 2026-10-30

| Layer | Decision | Role |
| --- | --- | --- |
| Web/PWA | **React + TypeScript + Tailwind CSS** | Responsive, accessible UI, component logic and styling |
| API | **Node.js + Fastify + TypeScript** | HTTP endpoints, validation and authorization |
| Database | **PostgreSQL hosted on Neon** | Relational storage for users, posts, communities, conversations and permissions |
| Database access | **Drizzle ORM + Drizzle Kit** | Type-safe SQL queries, schema and versioned migrations |

These choices are **approved for the new Uorqui project**, but **the Neon database, initial schema migration and development scaffold are ready; production app deployment is still pending**.

## Authentication decisions

**Chosen:** Better Auth (email/password and cookie sessions), using Fastify and the Drizzle PostgreSQL adapter. The auth schema has separate `user`, `account`, `session` and `verification` tables, while the social schema keeps `users`, `profiles`, direct messages and communities. Social user UUIDs are created from the authenticated account's UUID during the protected onboarding flow.

- Auth tables are versioned in migration `0001`, tested in a temporary Neon branch; **not yet applied to main**.
- Fastify uses a PostgreSQL connection pool; Better Auth has a dedicated configuration, strict trusted origins, secure-cookie behavior, server-side session checks and 12-character minimum passwords.
- No runtime credentials are in the public repository; `AUTH_SECRET` and `DATABASE_URL` must stay private.
- Signup is disabled by default and disabled unconditionally in production until email verification, password reset, durable abuse controls, and security tests are completed.
- Sign-in, sign-up, sign-out and profile creation have passed compile/type checks, but **have not been proven end to end against main**.

### Remaining technical evaluations

| Layer | Candidate | Status |
| --- | --- | --- |
| Realtime events | WebSocket | Proposed; define infrastructure and delivery semantics |
| Voice rooms | WebRTC + LiveKit or equivalent | Proposed; validate cost, hosting and mobile support |
| Media/video | Object storage, transcoding and CDN | Proposed; evaluate providers and usage limits |
| Presence and distributed fan-out | Redis | Optional, only when justified |
| Deployment | To be selected | Must remain isolated from the legacy Uorqui production environment |

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

The earlier Uorqui messenger runs separately. Do **not** point this new project to its production databases, messaging keys, deployed Workers or domain until a future migration plan is explicitly approved.
