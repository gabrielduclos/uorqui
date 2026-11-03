# Community channel permissions

**Versioned implementation: November 3, 2026.** The feature requires Drizzle migration `0033_restricted_channel_members.sql` in the target PostgreSQL environment. Do not claim production availability until the migration, API, Worker and relevant device tests are verified.

## Channel access modes

Community owners/admins can configure **text**, **voice** and **meeting** channels as:

- **Open:** any authorized community member can see/use the channel, subject to its optional password and meeting admission policy.
- **Closed / permission-only:** visible and usable only to owners/admins or members explicitly granted access. The moderator role does not bypass the allowlist.

Choose **Who can access** when creating a channel; change **Access permissions** later under **Edit channel** in the channel header. Existing channels remain **open** after migration.

Switching an open channel to closed immediately removes unauthorized active WebRTC sessions. Switching back to open clears the channel's individual grants to avoid unintentionally restoring access if it is closed again later.

## Member management

Under **Communities → Moderation → Members**, owners/admins can expand **Closed channel access** for each ordinary member or moderator and select which closed channels they may access. Unchecking immediately revokes access. Owners/admins have automatic access. Only current community members may receive grants.

Leaving, removing or banning a member clears their grants. Rejoining never silently restores old permission entries.

## Security and independence

- **Community membership** is always required.
- **Per-member permission** controls restricted channel visibility and content access.
- **Channel passwords**, when configured, must still be unlocked even after permission is granted.
- **Meeting admission approval**, when required, remains independent from channel permission.
- The API checks access for messages, reactions, read acknowledgements, attachments, presence, WebRTC state/signaling and ongoing sessions. Discover, unread badges and Web Push filter inaccessible channels.
- Access changes use SSE refreshes without exposing closed channel IDs to unauthorized users.
- UI hiding is never a substitute for server-side authorization.

## Deployment and validation

Apply migration **0033** using the normal Drizzle workflow against an isolated Neon test branch first. Production schema changes require operational approval and a verified backup.

Automated tests cover creation, grant/revoke, API and Discover filtering, independent password rules, cleanup on leaving, meeting permissions and WebRTC session eviction. Cross-network and installed Android/iOS PWA testing is still required.
