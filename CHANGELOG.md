# Changelog

The Uorqui social platform uses [Semantic Versioning](https://semver.org/) for its application workspace manifests. The suffix `-beta.N` marks a **pre-release**, not a stable or generally available product.

## [Unreleased]

All subsequent changes must increase the version in all three npm manifests and update both changelogs. See [release policy](docs/en/versions.md).

## [0.1.0-beta.17] — 2026-11-09

- **Mail unread count accuracy:** Gmail now uses the authoritative `INBOX` label's `messagesUnread` field rather than the approximate `messages.list.resultSizeEstimate`. Outlook/IMAP continue with provider counts. The UI discards stale/out-of-order count refreshes started before a local read or move, synchronizes the shared badge on manual refresh and move, and avoids decrementing Inbox counts when reading Spam/Sent/Trash.
- **Server polling race:** successful read/batch-read/move actions timestamp their stored unread counts. A mail-poller snapshot started earlier cannot overwrite a newer action count when it completes later.
- **Push while already open:** a system notification clicked with a visible Uorqui tab now explicitly sends the deep-link destination to the running React app instead of relying on a browser navigate that may not reinitialize the app. Hidden/frozen/closed instances retain durable URL navigation. The signed-in shell also consumes incoming deep links on history, focus and page restoration.
- **Validation:** check single/batch reads, multiple linked accounts, provider refreshes, Gmail totals, notifications from a visible or background tab and closed PWA. Version and docs only besides the web/worker/API changes; no database migrations, authentication, R2 or mail-connection changes.

## [0.1.0-beta.16] — 2026-11-09

- **Language-aware community invitation:** the post-login invitation dialog, action labels, accessibility names, loading fallback and expired/banned/redeem error messages now use the app's active Portuguese/English locale. Initial locale follows `navigator.language`; an explicit saved language preference takes precedence. No bilingual slash-separated copy appears in the dialog, and joining still requires a click.
- **No redundant desktop notification opt-in:** `PwaFirstRun` offers the daily push permission reminder only while the browser permission is `default` (not yet granted or denied). A browser that already allows notifications will never see an 'Enable notifications' prompt solely because the push subscription is temporarily missing, syncing or errored. Reconnection remains a user action under Notifications → Settings → Push permission. Optional PWA install reminders remain separate.
- **Scope and verification:** frontend-only; no database, API, push schema or permission change. Validate English and Portuguese invitations (including switching language while the dialog is open), granted/denied/default browser permissions on desktop, and service-worker reconnection from Settings. Run Web UI build/typecheck, API and integration CI before merging.

## [0.1.0-beta.15] — 2026-11-09

- **Video compression refinements:** browser-side video preparation uses a maximum 1280×720 frame, ~1.3 Mbps video and 96 kbps audio, keeps the original when compression is unsupported or saves no significant space, and still enforces the existing 50 MB final upload limit. No increased R2 storage cap.
- **Visible and cancelable preparation:** during compression, the shared chat/channel composer shows the source size, live percentage progress, and an explicit Cancel control. Successful conversion reports original and final MB. Cancellation aborts before upload and frees local media resources; aborted metadata and playback setup no longer wait for the full timeout.
- **Power management:** when available, Screen Wake Lock is held temporarily during on-device video conversion and released afterward. Browsers/OS power policies may deny it.
- **Limits and validation:** source video selection remains up to 300 MB; the real-time browser encoder handles clips up to 180 seconds. Preserve audio and playback quality through real Safari iOS/PWA and Android/PWA tests; the integration CI only verifies code and API compatibility. No database/backend changes.

## [0.1.0-beta.14] — 2026-11-09

- **Voice recording:** the shared direct-message and channel composer requests a Screen Wake Lock while recording or paused, releasing it on stop, discard and unmount. It reacquires the lock when the page becomes visible; browser/OS restrictions may still prevent screen wake lock.
- **Edit channel in header:** owners/admins get Edit next to Invite in the channel header. It opens the existing Moderation → Channels editor for the selected channel, retaining server permission checks.
- **Gallery video compression:** Gallery accepts photos and MP4/WebM/MOV video selection; the Camera video picker uses the same path. Videos up to 300 MB may be compressed locally with canvas/MediaRecorder before upload. The final R2 attachment cap **stays 50 MB**, and unsupported/ineffective compression keeps the original only if it fits. The UI shows progress and a fallback notice. Photos can be batched; videos are selected individually.
- **Risks/verification:** browser compatibility, audio retention, conversion speed, device memory and media quality need real-device verification, especially Safari iOS/PWA. Real-time compression currently supports clips up to 3 minutes; longer ones retain the original if small enough. No backend, database or R2 limit changes.

## [0.1.0-beta.13] — 2026-11-08

- **Responsive onboarding:** the guide measures its own height, chooses a position above or below mobile navigation highlights based on available viewport space, and scrolls internally when the screen is short. Desktop keeps the side placement.
- **Dark by default:** users without a saved theme now start in Dark; saved Light/Dark preferences are respected and can be changed at any time.
- **Scope and validation:** frontend and bilingual UI Kit only; no API or database migration. Validate Communities, Messages and Email steps on iOS/Android PWA, narrow viewports, rotation, PT/EN and both themes.

## [0.1.0-beta.12] — 2026-11-07

- **Outlook message loading:** message detail, mark-as-read and reply now use short authenticated POST endpoints with validated opaque message IDs in JSON bodies, preventing HTTP 414 failures caused by long URL paths.
- **Unified inbox:** a new All accounts selector combines connected Gmail, Outlook and manual IMAP mailboxes with date ordering, source-email labels, per-mailbox pagination and individual account filters. Composing from All accounts requires selecting the sender.
- **Bulk read and move:** selected messages can be marked read across multiple accounts in addition to moving to Spam/Trash, with per-account requests, partial-failure reporting and updated unread indicators. The account identity is part of each selection key to avoid collisions.
- **Compatibility and security:** existing path-ID endpoints remain for older clients; new routes preserve account ownership, same-origin checks, message validation and encrypted tokens. No database migrations or new permissions.
- **Validation:** run API/web typechecks and builds, then test opening long-ID Outlook messages, marking read and replying in an updated PWA after deployment. The specific production 414 origin has not yet been verified.

## [0.1.0-beta.11] — 2026-11-06

- **No duplicate GIF previews in direct messages:** recognized GIPHY messages render their animated GIF in the private chat but do not mount the external `LinkPreview` card or request its metadata. Ordinary URLs retain link previews.
- **Scope:** web-only rendering guard; no API, database, storage, SSE or migration changes. Test GIPHY messages and ordinary links on mobile/desktop in Light/Dark themes.

## [0.1.0-beta.10] — 2026-11-06

- **Direct-message bubble sizing:** each message reserves a 36px ellipsis/options button and 6px row gap, even while optimistic/pending, preventing horizontal overflow and width shifts when the menu appears after sending.
- **Unified reply appearance:** direct messages now use the same compact right-turn arrow, one-line **author: excerpt** reference, truncation and click-to-original as community channels, including the one-line dismissible composer preview.
- **Legacy quote support:** older text-embedded replies use the same concise visual as a non-interactive reference, since they have no stored original-message ID.
- **Scope/tests:** frontend presentation and release documentation only; no API, database, message storage, or SSE changes. Validate narrow screens, long texts/attachments, optimistic sends, both themes, and jump-to-original on devices.

## [0.1.0-beta.9] — 2026-11-06

- **Channel reply arrow:** the reply reference and composer now use an explicit right-turn arrow, keeping the original author's name and ellipsized preview in one compact line (including in the composer), with click-to-jump to the complete original. No expanded multi-line quote or Read more control.
- **Private chats restored:** direct-message replies again use the earlier inset quote card and composer preview, with their Light/Dark contrast preserved independently from channel styling.
- **No channel grouping:** every community text-channel message displays its author's avatar, display name, handle and timestamp, even for consecutive messages by the same person.
- **Scope:** frontend-only. No changes to API, schema, database, permissions, SSE or message data. Check responsive channels and private conversations on mobile/desktop in both themes.

## [0.1.0-beta.8] — 2026-11-06

- **Inline reply references:** cited author and original message excerpt now start on the same line (for example, **Sandra: looks good**) in both community channels and direct messages, instead of rendering on separate rows.
- **Composer previews:** the reply author and source excerpt also appear inline, with the existing cancel button and expandable preview.
- **Long replies remain readable:** line clamping now applies to the combined author-and-text reference (up to four lines in messages and three lines in the composer), retaining **Read more / Show less** for the complete text and click-to-jump for the original.
- **Author names:** when the original community message is already loaded, prefer its display name; use the stored handle otherwise. Global semantic CSS retains mobile sizing and light/dark contrast. Frontend-only, no API or database migration.

## [0.1.0-beta.7] — 2026-11-06

- **Reply reading order:** in community channels, the new-message author/header now appears **before** the cited reference and the reply content. Direct-message replies keep the same source-then-response order inside their bubble.
- **Quoted message previews:** removed the hard 180-character cutoff. The original text can occupy up to **four lines** in message replies or **three lines** above the composer, with a **Read more / Show less** action to inspect the complete original message without losing the jump-to-original link.
- **Mobile layout:** reply bubbles gain enough minimum width for the quote, avoiding extremely narrow snippets; expanded previews respect screen width without horizontal scroll. Older text-quote replies remain readable.
- **Theming and navigation:** use shared global Light/Dark semantic styles and preserve existing reply IDs, optimistic states, and click-to-jump. Frontend-only; no backend or database changes.

## [0.1.0-beta.6] — 2026-11-06

- **Discord-style reply presentation:** both community channels and private chats now show a single compact reference line with a curved connector, the original author's name and a truncated message preview, rather than an inset quote card.
- **Position:** channel reply references appear above the message author's heading/content, while private chats keep the reference immediately before their message body. Both remain linked to the existing jump-to-original behavior.
- **Composer:** shared one-line reply preview above the input, with a cancel action, responsive truncation, and sensible previews for GIFs, deleted messages and attachments.
- **Styling:** one shared React component and global semantic CSS styles for Light/Dark contrast, keyboard focus and mobile widths. Legacy text-quote replies remain readable. No API or database migrations.

## [0.1.0-beta.5] — 2026-11-06

- **Notification center tabs:** the same responsive page now has **All, Messages, Mentions, Email, Invites, Contacts** tabs with keyboard navigation and tab-specific unread counters. All collects the categories without hiding the original activity history.
- **Messages:** direct-message unread threads and unread community channels show real data and open their respective conversations.
- **Mentions:** server-verified `@handles` are saved into a new durable inbox, even when browser push is disabled. Member access, protected/restricted channels, bans and blocks are checked before recording and reading. Each mention opens its channel.
- **Email:** newly detected messages are persisted with mailbox ownership and sender/subject information, with direct links to the existing email reader. All linked mailboxes also provide an unread-total shortcut. A first mailbox scan remains silent; prior historical emails are not backfilled as new alerts.
- **Actions:** individual persistent notifications can be read/dismissed, and the All tab can mark activity and newly tracked events as read. Disconnecting a mailbox or deleting a user cascades corresponding inbox records.
- **Database:** additive migration `0042_notification_inbox_events`; apply before deploying API/Worker. Integration tests cover per-user isolation, read/delete, cross-origin defense, sender attribution and mailbox disconnection. No bulk email/content migration.

## [0.1.0-beta.4] — 2026-11-06

- **Desktop notifications:** the daily push opt-in prompt has priority over the PWA installation offer in desktop browsers. Before this change, the install banner appeared earlier and cancelled the push reminder.
- **No overlapping requests:** the desktop install prompt may appear in a later visit, not immediately after the user has been offered notifications in the current session.
- **Browser permissions:** the native notification permission request is still triggered only by clicking **Enable notifications**; users with denied permissions see guidance instead of repeated native permission dialogs.
- **Mobile behavior preserved:** iOS still requires the Home Screen PWA for Web Push; mobile install and notification prompts retain their previous scheduling and per-account, per-day limits. The manual device control remains under Notifications → Settings.

## [0.1.0-beta.3] — 2026-11-06

- **Outlook OAuth restored:** new Outlook.com, Hotmail and Microsoft 365 mailbox connections can use Microsoft Entra and Graph again with PKCE, one-use state, refreshed credentials and encrypted token storage. Existing connections are preserved.
- **Email UI:** Outlook returns as an option beside Gmail and Manual server, disabled only until Microsoft credentials are configured in Render; Gmail and IMAP/SMTP remain available.
- **Diagnostics:** OAuth callback includes only the safe public provider label (never code, tokens or state), with provider-specific Microsoft authorization and permission guidance.
- **Setup:** register an Entra Web app for organizational and personal accounts with callback `https://uorqui.app/api/v1/mail/oauth/outlook/callback`; delegated `User.Read`, `Mail.ReadWrite`, `Mail.Send`, `offline_access`; set `MAIL_MICROSOFT_CLIENT_ID` and `MAIL_MICROSOFT_CLIENT_SECRET` **in Render only** while preserving `MAIL_TOKEN_KEY`.
- **Tests:** Microsoft consent, scopes, PKCE, callback isolation/replay/secret protection and fail-closed behavior without credentials. No database migration.

## [0.1.0-beta.2] — 2026-11-06

- **Channels:** removed Edit from headers. Channel names, pinned descriptions/rules, access and passwords are managed in **Moderation → Channels**.
- **Pinned descriptions:** optional texts up to 4,000 characters persist below the channel header, with **Read more / Show less** for long content in text, voice and meeting channels.
- **Default names:** new rooms suggest editable numbers per type (**Sala de texto 1**, **Sala de voz 1**, **Sala de reunião 1**) while the database uniqueness constraint remains authoritative.
- **Invitations:** removed standalone community invitations/sharing. One channel-specific link joins the community and navigates to the exact channel, and may be copied or sent via Uorqui DM. Meeting and channel invitations now use the same dialog and link.
- **Discover:** replaced the community-rail magnifying glass with a compass and **Discover** label, keeping access to the public-community directory.
- **Security:** links never bypass restricted-channel permissions, passwords or meeting approval. Existing temporary bearer invite tokens are reused, or generated by admins when missing.
- **Migration:** additive `0039_channel_descriptions` adds the nullable `community_channels.description` column without deleting data. Apply the database migration before deploying the new API.
- **Explicit invite consent:** after signup/sign-in, show the community name and **Join community / Not now**. Signing in or registering never redeems an invitation automatically.
- **Channel messages:** optimistic replies referencing original messages (including attachments), `@username` suggestions and highlighted links, a list of people who reacted to each emoji, and mention-specific push text. Access permissions still apply.
- **GIFs:** shared picker for channels and 1:1 messages, animated message display, and preserved drafts. Optional GIPHY trending, search and pagination when `VITE_GIPHY_API_KEY` is supplied at web build time; without it, the limited built-in catalog remains.
- **Account deletion:** password and exact `EXCLUIR` confirmation in Profile; erase personal data, sessions and messages from the active database, transfer shared community ownership, and queue durable R2 deletion via the Worker cron. Shared DM histories will be removed for both participants. Provider backups follow their retention policies.
- **Additional migrations:** `0040_community_message_replies`, `0041_account_media_cleanup`. Apply both before API deployment. Integration tests cover account deletion and reply/reactor flows. Test real-environment R2 cleanup before making irreversible account deletion available to users.
- **Testing:** API integration coverage for description persistence, role checks, size limits and clearing. Run web/API CI and manually verify invite acceptance with new accounts, expired links and installed PWAs.

## [0.1.0-beta.1] — 2026-11-06

**Official baseline for the technical beta.** This consolidates the current React UI, CSS tokens, Fastify API and documentation on a single GitHub version. Automated checks and deployment do not certify every mobile/browser workflow.

### Consolidated implementation (November 4–6)

- **Workspace UI:** compact responsive Messages/Contacts/Communities/Email layout, corrected dark/light reply contrast and global surface tokens. The UI Kit now documents the **actual** signed-in grayscale Sprintrix palette, not obsolete purple/blue mockups. One canonical global dark/light token pair replaces duplicate declarations.
- **Direct messages:** SSE delivery and read timestamps, optimistic text/replies, attachments, paginated all-history media/files gallery, one shared pinned message per conversation, media caching, responsive load placeholders and secure notification badges.
- **Communities:** channels, access permissions, visible in-place delete confirmations, voice/video meetings, mobile-aware chat and private in-memory lazy media caching.
- **Email:** Gmail OAuth and manual IMAP/SMTP, inbox/sent/spam/trash, read/reply/move operations, private HTML viewer with native external links and skeleton held until content/image/layout readiness (with a failsafe for stalled third-party images).
- **PWA/notifications:** configurable activity, community, DM and mail push categories, native unread badge where supported, and secure service-worker handling.
- **Code consolidation:** duplicate frontend JSON transports extracted into `apps/web/src/lib/apiClient.ts`, preserving each module's existing errors; the Fastify exact-match write-origin guard shared in `apps/api/src/request-origin.ts`. **No API route, authentication, or schema changes in this consolidation.**
- **Version governance:** `Version policy` checks every future PR for a greater SemVer version with synchronized root/API/web manifests and bilingual release notes. `Publish tagged beta releases` publishes immutable `v...` GitHub tags/releases on `main`, subject to repository permissions.

### November 2–3 product evolution included in the beta

The following work preceded the formal November 6 baseline and is included in this beta.

### Updated product and communities
- Removed the redundant **Explore communities** rail and public search/list from Communities. That area now focuses on joined groups, pending invitations and creation; public discovery stays exclusively under **Discover**.
- Chat channel-invitation links and link previews now open the destination through **in-app navigation**, without creating a new tab or reloading. Token-based invitations use the existing in-app join flow; channel invitation pushes also open their destination directly.
- **Invite to channel** now lists only other members of the selected community, omits blocked users and respects profile visibility; invitations use direct channel links instead of creating general community invite links.
- Migration `0034_channel_names_per_kind` applied to production Neon on 3 Nov 2026, with the per-community, per-kind name uniqueness index verified. Existing backups preserved; account limits prevented a fresh snapshot/branch.
- Invite push goes to recipients only: channel invitations use the existing direct-message push with invite-specific body, and community join invitations notify the invitee alone.
- Channel headers now offer **Invite**: select a friend and send a direct message containing the direct link to a text, voice or meeting channel. Reusable community invitation links are used when available; channel passwords and permissions still apply.
- **Discover** displays actor-aware summaries for GIFs, photos, video, audio, files, links, emojis, regular messages and reactions without displaying raw GIF URLs or technical filenames.
- Channels of different types may **share the same name**, while name uniqueness remains enforced per community and type. Versioned migration `0034_channel_names_per_kind` replaces the index safely and adds a reaction recency index, both applied to production.
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

### Initial implementation scope (historical preview notes)

**First technical beta for controlled testing.** This describes implemented code and automated checks, **not** certification of all browser/device flows.

### Included

- New open-source social application with React/TypeScript, a light/dark UIKit-inspired interface and a consistent Beta badge beside the header logo.
- Email/password authentication using Better Auth, profiles, privacy and account blocking; public registration protected by Turnstile and email configuration.
- Direct 1:1 messaging with persistence, attachments, replies, reactions, status tracking, SSE event delivery and Web Push support.
- Community discovery replaces the retired public feed; legacy feed routes and tables were removed as part of the beta evolution.
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
