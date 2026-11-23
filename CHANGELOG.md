# Changelog

[Português (Brasil)](CHANGELOG.pt-BR.md)

## [Unreleased]

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
