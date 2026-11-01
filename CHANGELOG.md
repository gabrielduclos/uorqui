# Changelog

The Uorqui social platform uses [Semantic Versioning](https://semver.org/) for its application workspace manifests. The suffix `-beta.N` marks a **pre-release**, not a stable or generally available product.

## [0.1.0-beta.1] — 2026-11-01

**First technical beta for controlled testing.** This describes implemented code and automated checks, **not** certification of all browser/device flows.

### Included

- New open-source social application with React/TypeScript and a light/dark UIKit-inspired interface.
- Email/password authentication using Better Auth, profiles, privacy and account blocking; public registration protected by Turnstile and email configuration.
- Direct 1:1 messaging with persistence, attachments, replies, reactions, status tracking, SSE event delivery and Web Push support.
- Continuous hybrid feed for multimedia posts with dedicated video navigation.
- Communities with invitations, roles, text channels, moderation, WebRTC voice sessions and a minimizable ongoing call.
- Cloudflare Worker frontend and R2 media storage; Render Fastify backend; Neon PostgreSQL; automated API/UI/integration tests.
- Initial custom-domain cutover preparation, origin allowlist and service-worker replacement path for previously installed PWAs.

### Not yet validated / known limitations

- Real user email verification, delivery and recovery **must** be tested end to end.
- PWA update, push and app-icon behavior on installed iOS/Android clients are **not** universally guaranteed.
- Voice connections on distinct networks may require TURN; iOS background suspension affects real-time audio.
- Domain `uorqui.app` must not be described as migrated until Cloudflare routing is independently confirmed.
- This beta does **not** migrate old Uorqui Chat accounts, messages, push subscriptions or customer data.
- Public growth still requires monitoring, backups/restore exercises, accessibility and security testing, moderation operations and operational limits.

### Deployment and rollback

Follow the [domain migration runbook](docs/pt-BR/migracao-dominio-uorqui-app.md). Build with `npm run build` and use the GitHub Actions checks before deployment. No credentials or data from the older enterprise messenger are part of this release.

> The version bump and this changelog are **not** a GitHub Releases prerelease/tag by themselves. A GitHub Release can be published once a tested commit is selected.
