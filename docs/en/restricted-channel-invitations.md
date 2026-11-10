# Restricted channel invitation links

**Version:** 0.1.0-beta.33 — November 10, 2026

## Behavior

- **Restricted** channels have independent authorization links; a general community share link never grants access to a restricted channel.
- Only the **owner, administrators, and moderators with current channel access** may issue them.
- Each copied link is **single-use** and expires after **24 hours**. Any signed-in user in possession of an unbound link can claim it first; share it carefully.
- A direct-message invitation to a specific **@username** creates a different token **bound to that account's stable user ID**.
- Viewing the invitation, registering, or signing in never changes membership. An explicit **Accept and open channel** action is required.
- Redemption atomically joins the community, grants access to the one restricted channel, and consumes the token. It never bypasses password entry or meeting admission approval.
- Used, expired, revoked, banned, or no-longer-authorized issuer links are rejected. The issuer can revoke an unused link in the invitation dialog.

## Technical security

- Cryptographically random **256-bit bearer token**; the database stores a **SHA-256 digest only**.
- Bearer tokens are carried in the link URL **fragment** and temporarily in browser `sessionStorage`, not in API URLs/query strings or standard HTTP access logs; the fragment is cleared on load.
- API preview/redeem require authentication and exact Origin, plus current issuer role, channel permission, optional recipient binding, and community-ban checks.
- Redemption locks the invite row with **`FOR UPDATE`** so two users cannot consume it simultaneously.
- Issuers are limited to **10 outstanding invitations per restricted channel**.
- Audit fields record issuer, optional intended recipient, redemption account and redemption timestamp.

## Deployment and QA

- Additive Drizzle migration **`0044_restricted_channel_invites.sql`** applied to the default Uorqui Neon branch on November 10, 2026, with the migration journal updated.
- CI includes static security and UI regression checks, frontend typecheck and build.
- Manually verify new user sign-in, one-time claims, wrong recipient, expired/revoked links, bans, role changes, password-protected channels and meeting approval.

**Rollback:** Code rollback does not remove the audit table. Disable the endpoint if emission and redemption must stop immediately; only delete the table under a retention policy.
