# Gmail and Outlook email

[English](email.md) · [Português](../pt-BR/email.md)

Email integrates Gmail API and Microsoft Graph through OAuth 2.0 with PKCE. It does not use the user's password or change Better Auth sign-in. Each user can connect one account per provider; authorizing again replaces that provider's previous connection.

## Setup

1. Validate Drizzle migration `0035_cooing_shard.sql` on a Neon development branch before requesting production approval. `0034_snapshot.json` records manual migrations 0022–0034 without repeating their changes.
2. Create a web OAuth client in Google Cloud, enable Gmail API and configure consent. Request `gmail.readonly` and `gmail.send`. Read access is restricted: public availability requires Google verification and applicable security requirements. Use authorized test users during testing.
3. Register a web app in Microsoft Entra for organizational and personal accounts with delegated `User.Read`, `Mail.Read`, `Mail.Send` and `offline_access` permissions. Organizations may require administrator consent.
4. Register exact callbacks on the canonical `WEB_ORIGIN`: `/api/v1/mail/oauth/gmail/callback` and `/api/v1/mail/oauth/outlook/callback`. The existing Worker proxy forwards them to Fastify; the session must be active on that same domain.
5. Configure **private Render variables only**: `MAIL_GOOGLE_CLIENT_ID`, `MAIL_GOOGLE_CLIENT_SECRET`, `MAIL_MICROSOFT_CLIENT_ID`, `MAIL_MICROSOFT_CLIENT_SECRET` and `MAIL_TOKEN_KEY`. The key is independent of `AUTH_SECRET`: 32 random bytes encoded as base64. Do not rotate without a plan to re-encrypt or reconnect existing accounts.
6. Check `/health/ready`, then test authorization, callback, reading, sending, expiry and disconnect using controlled accounts for both providers. Credentials are not in the repository. Without configuration, the interface explains the unavailable connection and disables its buttons.

## Behavior

- `/api/v1/mail` routes list accounts, start OAuth, receive callbacks, list/read messages, send and disconnect. Sessions are required; mutations require an authorized Origin. Connections are scoped to the authenticated user.
- OAuth state is single-use, expires after ten minutes, is bound to user/provider and uses PKCE. Tokens and verifiers use AES-256-GCM encryption. Fastify request logs omit callback codes and state.
- Server-side token refresh is serialized per connection. Tokens never reach the frontend. Content is fetched on demand without database persistence. Responses are private and not cacheable.
- Inbox and Sent; All, Unread and Starred filters; pagination; local search over loaded messages. Reading does not mark messages read or modify stars. Messages render as text without executing HTML or fetching remote images; HTML-only Gmail messages may show just the snippet.
- Plain-text sending to one recipient. Attachments, persistent drafts, CC/BCC and realtime synchronization are outside this stage. Check Sent before retrying an uncertain result.
- Disconnect removes local tokens and preserves provider email. Revoke provider authorization separately in Google/Microsoft security settings.

## Validation

`mail.integration.test.mjs` uses temporary PostgreSQL and mocked provider responses. It verifies isolation, Origin, PKCE, state replay/expiry, encryption, refresh, sending and constrained pagination. It sends no real email. Live verification requires the configured clients and accounts above.

References: [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [Microsoft OAuth](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [Graph mail](https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview).
