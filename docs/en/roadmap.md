# Roadmap and release gates

[English](roadmap.md) · [Português](../pt-BR/roadmap.md)

**Status:** roadmap for the **technical beta `0.1.0-beta.1`**. Checked items refer to implemented code or CI evidence; real-device/operational acceptance remains separately pending.

## Phase 0 — Discovery and foundation

- [x] Public repository created under MIT license.
- [x] Initial bilingual product and technical documentation.
- [ ] Conduct user discovery with prospective communities; document validated product needs.
- [ ] Verify trademark strategy and plan isolation from the legacy production domain.
- [x] Decide core stack: React, TypeScript, Tailwind CSS, Node.js, Fastify, Neon PostgreSQL and Drizzle.
- [x] Choose Cloudflare Workers Static Assets for the frontend, prepare Wrangler/SPA routing and an isolated future API proxy.
- [x] Connect Cloudflare Worker `main` to the GitHub repository, configure Cloudflare Builds root `/apps/web` and web build/deploy commands, and limit GitHub Actions to API checks.
- [x] Prepare Fastify for external Node.js hosting with production network binding, an optional Render Blueprint and uncommitted secrets.
- [x] Show a helpful API-offline message in the frontend until backend setup is complete.
- [x] Deploy the Render API, verify Neon health, and configure the Worker `API_ORIGIN`.
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
- [x] Validate the real Cloudflare Worker → Fastify → temporary PostgreSQL proxy, including first-party cookies, onboarding and logout.
- [x] Gate web login and Node.js deployment readiness on both auth configuration and migrated database with `/health/ready`.
- [x] Apply Better Auth migration 0001 to Neon main, verify 10 application tables and the second Drizzle journal entry, and remove the temporary branch.
- [x] Configure private runtime secrets and check health, status and anonymous access against Neon main (live account sign-in remains to be tested).
- [x] Commit email verification, recovery, server-side Turnstile gating and signup-first UI.
- [x] Configure Resend and Turnstile, enable `ENABLE_PUBLIC_SIGNUP=true` and pass live readiness and fake-token rejection tests without creating accounts.
- [ ] Validate a real human signup, email delivery/verification, login, and password recovery end-to-end.

**Exit condition:** credible pilot interest, defined scope and operating constraints.

## v0.1 — Social foundation

- [x] Implement sign-up/sign-in, profiles, basic discovery and follows (human email-delivery acceptance still pending).
- [x] Implement persisted 1:1 messages, media, status and SSE reconnection handling; validate real-world reliability separately.
- [x] Implement community creation/membership, invitations, roles and text channels.
- [x] Implement initial reports, blocking, rate limits and server-side checks; operational moderation still needs testing.

**Exit condition:** mobile workflows are reliable and private content stays private.

## v0.2 — Voice communities

- [x] Implement joining/leaving voice, mute and participant list.
- [x] Implement voice permissions, WebRTC signaling, session grace and small-room limits; test TURN/mobile reconnection.
- [ ] Test on desktop, Android browser/PWA and iOS browser/PWA.

**Exit condition:** stable small-group voice calls and measurable costs.

## v0.3 — Hybrid discovery

- [x] Implement the mixed post feed with text, images, carousels and video.
- [x] Implement immersive video-only navigation; verify behavior on real devices.
- [ ] Cross-sharing and public community discovery; enforce privacy boundaries.
- [ ] Video quotas, processing pipeline, adaptive loading and moderation.

**Exit condition:** content → community flow can be tested by real users.

## v0.4 — Pilot

- [ ] Validate the experience with invited pilot communities.
- [ ] Track technical reliability, accessibility, moderation response and performance.
- [ ] Resolve usability friction and prioritize fixes based on pilot feedback.

**Exit condition:** stable workflows, responsible moderation and acceptable operational performance.

## v1.0 — Stable public release readiness

- [ ] Automated tests and CI/CD, metrics, backups, restore drills and release rollback.
- [ ] Accessible UI, privacy policy, terms, moderation procedures and age-related safeguards.
- [ ] Security review, contributor governance and documented deployment.
- [ ] Confirm capacity and support plan before expanding access.

**Do not launch broadly** if private data leaks, messages can disappear silently, moderation is unavailable, or media costs are unbounded.

## Open decisions

Feature priorities, dependency licenses, operating budgets/quotas, video recommendation, moderation procedures, TURN quality and domain cutover acceptance. The initial realtime/SSE, WebRTC and media/R2 implementations are no longer hypothetical.
