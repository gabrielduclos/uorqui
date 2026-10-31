# Direct messenger — Uorqui

## First connected release

Direct messages use Better Auth, Neon PostgreSQL, `direct_conversations`, and `direct_messages`. React now shows real one-to-one conversations rather than demo contacts.

### Included
- Search public users by name/@username and start a conversation from a public profile.
- Exactly one conversation for each pair of participants.
- Persistent text history (latest 100 messages), 4,000-character limit, idempotent `clientId` retries.
- Sent/read indicators, unread counts, latest message.
- **Polling every 3 seconds** for messages and **4 seconds** for conversation lists while the tab is visible. This is near-real-time synchronization, not WebSocket or instantaneous delivery.
- Mobile-first responsive conversation layout with fixed headers and keyboard handling.

### API
- `GET /api/v1/dm/people?q=`
- `GET /api/v1/dm/conversations`
- `POST /api/v1/dm/conversations`
- `GET /api/v1/dm/conversations/:id/messages`
- `POST /api/v1/dm/conversations/:id/messages`
- `POST /api/v1/dm/conversations/:id/read`

All routes require a valid session; message endpoints validate membership. Writes require the expected Origin. Only public profiles are discoverable, but previously established conversations are unaffected by visibility changes.

### Database rollout
Migration `0003_live_direct_messages` adds unique `client_id` and `read_at` to direct messages. Apply **before deploying** the API/frontend.

### Not included yet
Older-message pagination, R2 attachments, WebSocket/SSE, push, presence, persisted reactions/replies, edit/delete, anti-spam and moderation.
