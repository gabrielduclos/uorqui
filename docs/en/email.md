# Gmail and Outlook email

**Unread badge (beta.17):** Uorqui shows the sum of unread Inbox messages across connected accounts. Gmail uses the `INBOX` label's `messagesUnread` (rather than the approximate `messages.list.resultSizeEstimate`); Microsoft Graph and manual IMAP use their provider's unread-Inbox count. Marking as read updates the sidebar immediately; older requests and background scans cannot overwrite newer counts. The Inbox refresh control and move-to-Spam/Trash operations also refresh the badge. Provider sync can still be delayed or fail; counters reconcile on the next successful check.

[English](email.md) · [Português](../pt-BR/email.md)

Email integrates Gmail API and Microsoft Graph through OAuth 2.0 with PKCE. It does not use the user's password or change Better Auth sign-in. Users can connect multiple different email addresses per provider; reconnecting the same address refreshes its saved authorization.

## Enable Outlook OAuth in Microsoft Entra — `v0.1.0-beta.3`

1. Go to [Microsoft Entra](https://entra.microsoft.com) → **Identity → Applications → App registrations → New registration**. Select **Accounts in any organizational directory and personal Microsoft accounts** to support both Microsoft 365 and Outlook.com.
2. Under **Authentication → Add a platform → Web**, register exactly `https://uorqui.app/api/v1/mail/oauth/outlook/callback`. Use **Web**, not SPA, because Fastify exchanges the authorization code server-side.
3. Under **API permissions → Add a permission → Microsoft Graph → Delegated permissions**, enable `User.Read`, `Mail.ReadWrite` and `Mail.Send`. The authorization flow requests `offline_access` as well. Company tenants might require administrator consent.
4. Copy the **Application (client) ID**. In **Certificates & secrets → Client secrets → New client secret**, generate a credential and copy its **Value** (not Secret ID) immediately. Monitor its expiration.
5. In **Render → `uorqui-social-api` → Environment**, set `MAIL_MICROSOFT_CLIENT_ID` and `MAIL_MICROSOFT_CLIENT_SECRET`. Preserve the existing `MAIL_TOKEN_KEY`, because rotation without migration would make stored encrypted tokens unreadable.
6. After deployment, use **Uorqui → Email → Connect email → Outlook**, or **Connect another email → Outlook**. Test consent, inbox, read state, replies, sending, Spam and Trash. The Outlook button remains disabled until the server is configured.

This connects an Outlook mailbox and **does not** add Microsoft SSO for signing into Uorqui. The Microsoft Graph integration is HTTPS and does not require an SMTP relay.

## Setup

1. Validate Drizzle migration `0035_cooing_shard.sql` on a Neon development branch before requesting production approval. `0034_snapshot.json` records manual migrations 0022–0034 without repeating their changes.
2. Create a web OAuth client in Google Cloud, enable Gmail API and configure consent. Request `gmail.modify` and `gmail.send`. Read access is restricted: public availability requires Google verification and applicable security requirements. Use authorized test users during testing.
3. Register a web app in Microsoft Entra for organizational and personal accounts with delegated `User.Read`, `Mail.ReadWrite`, `Mail.Send` and `offline_access` permissions. Organizations may require administrator consent.
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

## OAuth troubleshooting

- The `/api/v1/mail/accounts` endpoint returns `webOrigin`; before connecting, the client checks that its current domain matches `WEB_ORIGIN` to prevent login session cookies from being lost when returning from OAuth at another hostname. When origins differ, the UI links to the canonical host rather than starting OAuth.
- The callback never redirects OAuth authorization codes, state, tokens or raw provider error strings to the browser. A failed callback carries only a fixed `mail_reason` category and safe public `mail_provider` label (`session`, `state`, `denied`, `invalid_return`, `token`, `mailbox`, `storage`). The UI shows actionable advice and removes the callback flags from the URL.
- `session`: missing login on the canonical origin; `state`: expired/invalid/replayed attempt; `denied`: denied consent or non-test account; `token`: rejected OAuth token exchange (client credentials, redirect URI or scopes); `mailbox`: Gmail API or scope issue; `storage`: Neon persistence error. The UI does not claim a connection succeeded until the provider confirms it.

## Rich mail, folders and read/reply sync

- Inbox, Sent, Spam and Trash are read from the actual Gmail/Outlook mailbox with pagination and filters. Opening a message marks it read at the provider (Gmail removes `UNREAD` using `gmail.modify`; Outlook PATCH sets `isRead`).
- HTML is rendered inside a separate, sandboxed iframe with no JavaScript, form submissions, or access to the Uorqui document. Gmail CID embedded pictures are loaded with per-message/per-image size bounds. External HTTPS images are disabled until the user chooses **Load external images** for that message to avoid tracking pixels.
- Reply uses the original provider message: Gmail preserves `threadId` plus RFC822 `In-Reply-To`/`References` and derives the recipient server-side; Outlook uses Microsoft Graph `/reply`. User-supplied recipients cannot override replies.
- **Reconnect Gmail or Outlook once** after deployment to grant the new `gmail.modify` / `Mail.ReadWrite` scopes. Update the Google consent screen / Microsoft Entra permissions accordingly. Existing connections are not deleted, but old read-only grants cannot persist read status.

## Manual servers, account switcher and bulk mail actions

- Accounts may include multiple distinct Gmail addresses and manual IMAP/SMTP mailboxes. The account selector contains **Connect another email**, with Gmail OAuth, Outlook OAuth or manual IMAP/SMTP setup. New Outlook connections are enabled when Microsoft credentials are configured in Render; existing accounts remain intact.
- Migration `0036_mail_multiple_accounts.sql` updates uniqueness to (user, provider, email) and allows the `manual` provider. Apply before use; existing connections are preserved.
- Manual mail settings are encrypted and never returned by the list API. Connections require public DNS targets, verified TLS, IMAP 993, SMTP 465/587 or 2525. SMTP login is not tested at account creation.
- Render Free blocks outbound SMTP ports 25/465/587; manual sending on those ports requires alternative hosting, or SMTP 2525 where the provider supports STARTTLS.
- Multi-select up to 100 messages, then move to Spam/Trash via Gmail batchModify, Microsoft Graph move or IMAP MOVE. No permanent deletion action is exposed.
- External HTTPS images load by default in a sandboxed iframe without scripts or forms. This may expose view activity to tracking pixels despite no-referrer policy.
- Outlook.com/Microsoft 365 require OAuth2, and password-based manual setup does not substitute for that authentication.

## New mail push notifications

The Render API periodically polls connected Gmail and manual IMAP inboxes (120-second default, configurable with `MAIL_POLL_INTERVAL_MS` between 60 seconds and an hour). New and existing Outlook accounts are scanned too. The first successful scan establishes a **silent baseline**, while observed message IDs are persisted in `mail_seen_messages` to prevent duplicate pushes after restarts. `mail_inbox_state` stores per-account unread badge counts.

Only mail arriving after the baseline is eligible for a push. The payload contains sender and subject (not the message body), is restricted to the signed-in recipient, is reauthorized if the account has been disconnected, and opens the correct account/message when tapped. The **New emails** notification category can be switched off. Background delivery is best-effort: if the Render API is asleep/unavailable, scans are delayed. Gmail unread totals are provider estimates.

Apply `0037_mail_push.sql` to the correct Neon database **before deploying the API**; existing mailbox connections and credentials are preserved. Read/move actions refresh the cached counts. The mobile footer navigation has been replaced by the desktop-style side drawer.

## Email image preview and enlargement

The reader adapts **the entire HTML email iframe** to the available mobile width, including newsletters with fixed 600–800px tables. Frame height follows the document so scrolling normally happens in the email reader. Images retain their intended layout size and aspect ratio, rather than an artificial thumbnail limit; tap or press Enter to open an enlarged viewer. The email remains isolated inside a sandboxed iframe with scripts and forms disabled. The fit updates when images load or the viewport width changes.

## Account configuration modal

New mail accounts are set up in a **scrollable dialog**, both for first-time setup and when selecting **+ Connect another email** with existing accounts. The dialog contains Gmail OAuth, Outlook OAuth and IMAP/SMTP credentials with a fixed heading, dismissal via X, Escape or backdrop (disabled during submission), mobile-friendly scrolling and focus restoration. The inbox list remains separate from the form.

## External links in HTML email

HTTP(S) links within an HTML email — including linked images and banners — open **in the external browser in a new tab/window** rather than inside the iframe or over Uorqui. The parent reader handles the actual user click, while the email iframe remains sandboxed (no scripts or forms). Unlinked images still open the enlarged viewer. Relative URLs without a trustworthy sender base and unsafe schemes such as `javascript:` and `data:` are blocked. External pages do not receive the Uorqui referrer (`noopener,noreferrer`).

## Native external link navigation and full HTML rendering

Absolute HTTP(S) links in HTML messages are normalized as native `target="_blank"` anchors with `rel="noopener noreferrer"`. The browser handles external navigation, rather than a parent-side `window.open` (unreliable in iOS PWAs). The iframe stays script-free, form-free and unable to navigate the top page, with only `allow-popups` and `allow-popups-to-escape-sandbox` added for external links. Relative and unsafe-scheme links have their `href` removed. Linked banners follow their link; unlinked images still open the zoom viewer. The skeleton remains until the document, fonts, images and two responsive layout measurement frames are ready. A 15-second failsafe prevents broken remote assets from freezing the reader; late images still resize the iframe.
