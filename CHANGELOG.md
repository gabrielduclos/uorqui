# Changelog

The Uorqui social platform uses [Semantic Versioning](https://semver.org/) for its application workspace manifests. The suffix `-beta.N` marks a **pre-release**, not a stable or generally available product.

## [Unreleased] — changes through 2026-11-03

This is ongoing technical-beta work on `main`, **not a tagged release or proof of a successful live deployment**.

### Updated product and communities
- Channel headers now offer **Invite**: select a friend and send a direct message containing the direct link to a text, voice or meeting channel. Reusable community invitation links are used when available; channel passwords and permissions still apply.
- **Discover** displays actor-aware summaries for GIFs, photos, video, audio, files, links, emojis, regular messages and reactions without displaying raw GIF URLs or technical filenames.
- Channels of different types may **share the same name**, while name uniqueness remains enforced per community and type. Versioned migration `0034_channel_names_per_kind` replaces the index safely and adds a reaction recency index; it still needs to be applied to production.
- Direct conversation rows now have **subtle inset dividers** between items, independent of the voice/video and text-panel separator.
- Notifications now include an **X** for per-item persistent deletion, updating the list and unread badge without cancelling friendship or join requests. In voice/meeting rooms a distinct divider separates audio/video and text when both are open (vertical on desktop, horizontal on phones); unintended DM list separators were removed.
- Community/meeting join-request notifications now identify the community (and meeting when available) in-app and in push. Moderation member identities have a larger profile-opening target and the public profile overlays the dialog. Community home participant names remain plain text; profile links stay within channels and moderation.
- Desktop conversation rows now use clearer continuous separators between items.
- **Communities** is now the default landing screen and first navigation tab; the logo returns to Communities and onboarding starts there. The app restores the most recently visited community only if the account remains a member, and offers discovery for newcomers.
- Community message authors and participants (including voice and moderation) link to their public profiles; the floating meeting player shows self video and the active speaker's video/avatar with speaking feedback.
- Subtle desktop conversation-list dividers; aligned 48 px desktop voice/meeting controls and chat composer actions, while preserving compact mobile controls.
- Main desktop sidebar navigation now has slightly larger labels and icons with taller rows; mobile conversation rows provide tactile pressed-state feedback when opening chats.
- Community moderation dialog organized into tabs: **Members** (including restricted-channel access), **Bans**, **Channels**, **Settings**, and **Delete** (owner-only), with mobile-friendly navigation.
- Community moderation now opens in a **responsive dialog**: full-screen on phones and centered on desktop, with managed focus, internal scrolling and no closing during pending operations.
- Replaced the old global posts/feed and immersive video browsing with **Discover** (community recommendations, search and authorized live activity); the feed retirement and recovery snapshots are documented separately.
- Added meeting channels with audio/video, invite links/DM invitations, per-room admission approval, screen sharing, active-speaker camera highlighting and fullscreen with own-camera picture-in-picture.
- Voice rooms and meetings now start with their text-chat panel **collapsed**; members can expand it without ending the call.
- Community join approvals deliver account-targeted SSE events and update the applicant's memberships without a page reload.
- Owners/admins edit channel names, passwords and **open/closed access mode** from the channel header; channel deletion stays in moderation.
- **Per-member closed-channel grants** under Moderation → Members. API filters content, Discover, push, media, presence and WebRTC; revocation ends ongoing calls. Versioned migration `0033_restricted_channel_members` requires application and verification on the target database before activation.

### Maintenance
- Translation audit removed 38 unused former feed/demo entries; active registration copy and English translation now describe Discover and communities.
- Revised PT/EN Terms and Privacy Notice for the current app; **new registrations** acknowledge version `2026-11-03`. Historical account acceptances remain untouched, and the unchanged Cookie Policy retains `2026-11-01`. Existing users are not forced to re-consent.
- Removed unreachable global-feed post-sharing controls from the DM sharing dialog and replaced broken historical post navigation with a retired-content notice.
- Removed unused shadcn Sheet/Tabs source components; retained versioned database migrations and recovery media.
- Reconciled bilingual product/architecture/meeting/UI documentation and recorded the [November 3 code audit](docs/en/maintenance-audit.md).

**Pending:** multi-device meeting and screen-sharing tests, iOS/Android installed-PWA checks, push and email E2E, and independently confirmed production deployment.

## [0.1.0-beta.1] — 2026-11-01

**First technical beta for controlled testing.** This describes implemented code and automated checks, **not** certification of all browser/device flows.

### Included

- New open-source social application with React/TypeScript, a light/dark UIKit-inspired interface and a consistent Beta badge beside the header logo.
- Email/password authentication using Better Auth, profiles, privacy and account blocking; public registration protected by Turnstile and email configuration.
- Direct 1:1 messaging with persistence, attachments, replies, reactions, status tracking, SSE event delivery and Web Push support.
- Continuous hybrid feed with persistent "For you" / "Following" filters, a + button opening a post-composer modal, and dedicated video navigation.
- Communities with invitations, roles, text channels, moderation, WebRTC voice sessions and a minimizable ongoing call.
- Cloudflare Worker frontend and R2 media storage; Render Fastify backend; Neon PostgreSQL; automated API/UI/integration tests.
- Initial custom-domain cutover preparation, origin allowlist and service-worker replacement path for previously installed PWAs.

### Not yet validated / known limitations

- Real user email verification, delivery and recovery **must** be tested end to end.
- PWA update, push and app-icon behavior on installed iOS/Android clients are **not** universally guaranteed.
- Voice connections on distinct networks may require TURN; iOS background suspension affects real-time audio.
- On 2026-11-01, Cloudflare confirmed `uorqui.app` enabled on production Worker `main`. Installed-PWA caches, device-specific routing and recovery flows still require independent checks.
- This beta does **not** migrate old Uorqui Chat accounts, messages, push subscriptions or customer data.
- Public growth still requires monitoring, backups/restore exercises, accessibility and security testing, moderation operations and operational limits.

### Deployment and rollback

Follow the [domain migration runbook](docs/pt-BR/migracao-dominio-uorqui-app.md). Build with `npm run build` and use the GitHub Actions checks before deployment. No credentials or data from the older enterprise messenger are part of this release.

> The version bump and this changelog are **not** a GitHub Releases prerelease/tag by themselves. A GitHub Release can be published once a tested commit is selected.
