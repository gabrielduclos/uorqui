# Changelog

[Português (Brasil)](CHANGELOG.pt-BR.md)

## [Unreleased]

## [0.2.0-beta.15]

- Adds an authorized, paginated media gallery for channels and direct messages, including thread attachments and history beyond the loaded messages.
- Keeps image, video and audio skeletons until each medium is ready; reactions appear and animate only after all message media load, including app restoration. Reactions update optimistically and roll back on failure; reduced-motion preferences disable animation.
- Renames the interface to communities and adds channel name, description and access settings in a tabbed dialog. Access changes apply to the existing history; closing a channel preserves explicit invitees and the editor.
- Lets owners assign Moderator or Member levels. Moderators can create/edit accessible channels and send invitations; owner-only community and role controls remain enforced by the API. Includes migration 0007 and a gallery paging index.

## [0.2.0-beta.14]

- Adds user and team photos with local 512 × 512 compression, validated Worker/R2 uploads, removal and team authorization. Extends compression to PNG and file-selected images; retains local video compression with original-file fallback when needed. Includes migration 0006.

## [0.2.0-beta.13]

- Fixes the mobile attachment dialog and adds persisted message reactions with counters, individual removal and SSE in channels, direct conversations and threads. Includes migration 0005 and authorization/cache invalidation tests.

## [0.2.0-beta.12]

- Organizes settings into tabbed dialogs: Profile, Security and Appearance; team settings use General, Members and Advanced. Preserves forms across tabs and supports keyboard navigation, theme and language.

## [0.2.0-beta.11]

- Hides filenames on audio messages and improves the stop-recording button contrast in both themes.
- Adds persisted per-user unread cursors, badges on teams/channels/direct messages and an authenticated inbox SSE stream for inactive conversations.
- Marks a visible conversation read only at its latest messages; hidden mobile conversations retain their unread state. Own and unsent messages do not count.
- Adds email verification, resend feedback and password changes in profile settings. Password changes verify the current password and revoke other sessions.
- Adds migration 0004, an unread-query index, account security regression tests and browser checks for PT/EN, mobile/desktop and SSE.
- Email delivery requires RESEND_API_KEY and AUTH_EMAIL_FROM on the API; missing configuration returns a translated delivery error.

## [0.2.0-beta.10]

- Applies the global system font, 16 px body/message reference, 14 px navigation with regular/medium states and accessible form sizing in both themes.

## [0.2.0-beta.9]

- Requires a unique lowercase @username at signup, stores it on the auth user and preserves existing public handles through migration 0003.
- Adds authenticated SSE for direct and team conversations, PostgreSQL LISTEN/NOTIFY between API instances, reconnect catch-up and polling fallback.
- Reuses the main branch attachment composer with gallery batches, camera, image markup, Office/documents, video, voice recording, emoji and current location.
- Adds private R2 uploads and downloads through the existing main Worker preview, with server-side access checks, byte ranges and unsend access revocation.
- Verifies API permissions, real HTTP SSE, revoked sessions, multi-instance delivery and desktop/mobile media flows.

## [0.2.0-beta.8]

- Adds owner controls to rename teams, list members and guests, remove access and confirm team deletion by name. Deleted teams and channels become inaccessible while stored data is retained.
- Adds private one-to-one conversations, unique per pair, with the existing optimistic send, threads, edit and unsend behavior.
- Adds editable name, unique public handle and biography, shareable public profiles and profile links on message authors. Email stays private.
- Adds migration 0002 for profiles, direct conversation pairs and logical team deletion, plus authorization and concurrency regression coverage.

## [0.2.0-beta.7]

- Adds a one-line composer that grows with text and immediate optimistic messages, including threads.
- Retains pending and failed sends across navigation within the session and retries with stable client IDs to avoid duplicates.
- Allows authors to edit or unsend delivered messages. Unsent messages retain a placeholder and thread replies.
- Adds migration 0001 for client IDs, edit and cancellation timestamps and a per-author uniqueness constraint.

## [0.2.0-beta.6]

- Shows a shared spinner on backend action buttons, preserves labels, prevents duplicate clicks and clears the pending state after success or error.

## [0.2.0-beta.5]

- Reuses tab-local data and coalesces duplicate requests, with bounded caches and invalidation on writes and authentication changes.
- Refreshes messages every 10 seconds and channels every 60 seconds while visible, and refreshes on foreground return.
- Caches message queries in the API for 5 seconds after authentication and authorization, invalidating on new messages.
- Caches fingerprinted assets for a year and adds cache isolation and concurrency regression coverage.

## [0.2.0-beta.4]

- Preserves static interface structure during loading and adds shared skeletons for data fields, with accessible states and reduced-motion support.

## [0.2.0-beta.3]

- Applies a monochrome shared UI kit in both themes and adds a vertical team rail with initials, names, active state and team creation.
- Keeps channels alongside the team rail on desktop and adapts navigation for mobile.
- Documents tokens, components, spacing and accessible states in both languages.

## [0.2.0-beta.2]

- Enables public account creation from the sign-in screen in English and Brazilian Portuguese.
- Preserves email-bound invitations and restricts new accounts to teams and channels they create or join.
- Validates registration, password length, sessions and access isolation with integration tests.

## [0.2.0-beta.1]

- Establishes the independent Workplace branch with a React workspace and a Fastify API.
- Adds teams, internal channels, invitation-only private channels, threaded messages and paginated history.
- Adds invite-only account creation, email-bound links and channel-only guest access.
- Adds the first Drizzle migration in an isolated schema and integration coverage for membership boundaries and threaded messaging.
