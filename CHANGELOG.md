# Changelog

[Português (Brasil)](CHANGELOG.pt-BR.md)

## [Unreleased]

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
