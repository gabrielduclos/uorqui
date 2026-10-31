# Roadmap and release gates

[English](roadmap.md) · [Português](../pt-BR/roadmap.md)

**Status:** proposed milestones; no completion dates or implemented features are claimed.

## Phase 0 — Discovery and foundation

- [x] Public repository created under MIT license.
- [x] Initial bilingual product and technical documentation.
- [ ] Conduct user discovery with prospective communities; document validated product needs.
- [ ] Verify trademark strategy and plan isolation from the legacy production domain.
- [x] Decide core stack: React, TypeScript, Tailwind CSS, Node.js, Fastify, Neon PostgreSQL and Drizzle.
- [ ] Set operating budget, design conventions, data privacy principles and remaining realtime/voice/media providers.
- [x] Commit the initial React/Tailwind, Fastify and Drizzle development scaffold.
- [x] Create and verify a Neon PostgreSQL development database.
- [x] Validate the initial scaffold with GitHub Actions typechecks and build.
- [x] Generate and commit initial Drizzle SQL migration and schema snapshot.
- [x] Verify the SQL creates tables, enums, foreign keys and indexes on a temporary Neon branch.
- [x] Apply the initial migration to Neon `main`; verify six tables, foreign keys, indexes and the Drizzle migration record.
- [x] Choose Better Auth, implement Fastify/React authentication flows and commit migration 0001.
- [x] Test auth migration on temporary Neon and pass CI type/build/schema checks.
- [x] Pass a real signup, session, profile, duplicate protection and logout integration test using ephemeral PostgreSQL in GitHub Actions.
- [ ] Request approval to apply migration 0001 to main; configure secrets and verify registration/login end-to-end.
- [ ] Implement email verification, password recovery and production-safe signup controls before opening access.

**Exit condition:** credible pilot interest, defined scope and operating constraints.

## v0.1 — Social foundation

- [ ] Sign-up/sign-in, profiles, basic discovery and follows.
- [ ] Secure 1:1 messaging with history, clear receipts and reconnection.
- [ ] Create/join communities, public/private membership, roles and text channels.
- [ ] Reporting, blocking, rate limiting and server-side authorization.

**Exit condition:** mobile workflows are reliable and private content stays private.

## v0.2 — Voice communities

- [ ] Join/leave voice, mute and participant list.
- [ ] Permissions, reconnection, moderation and operating limits.
- [ ] Test on desktop, Android browser/PWA and iOS browser/PWA.

**Exit condition:** stable small-group voice calls and measurable costs.

## v0.3 — Hybrid discovery

- [ ] Continuous mixed feed supporting text, images, carousels and videos.
- [ ] Standalone immersive video-only mode with correct direct entry and back navigation.
- [ ] Cross-sharing and public community discovery; enforce privacy boundaries.
- [ ] Video quotas, processing pipeline, adaptive loading and moderation.

**Exit condition:** content → community flow can be tested by real users.

## v0.4 — Pilot

- [ ] Validate the experience with invited pilot communities.
- [ ] Track technical reliability, accessibility, moderation response and performance.
- [ ] Resolve usability friction and prioritize fixes based on pilot feedback.

**Exit condition:** stable workflows, responsible moderation and acceptable operational performance.

## v1.0 — Public beta readiness

- [ ] Automated tests and CI/CD, metrics, backups, restore drills and release rollback.
- [ ] Accessible UI, privacy policy, terms, moderation procedures and age-related safeguards.
- [ ] Security review, contributor governance and documented deployment.
- [ ] Confirm capacity and support plan before expanding access.

**Do not launch broadly** if private data leaks, messages can disappear silently, moderation is unavailable, or media costs are unbounded.

## Open decisions

Feature priority, third-party dependency licenses, remaining realtime/voice/media providers, recommendation ranking, moderation policy, video mode naming, deployment and future domain migration.
