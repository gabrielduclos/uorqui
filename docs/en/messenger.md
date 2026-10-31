# Direct messenger — Uorqui

## First connected release

Direct messages use Better Auth, Neon PostgreSQL, `direct_conversations`, and `direct_messages`. React now shows real one-to-one conversations rather than demo contacts.

### Included
- Search public users by name/@username and start a conversation from a public profile.
- Exactly one conversation for each pair of participants.
- Persistent text history (latest 100 messages), 4,000-character limit, idempotent `clientId` retries.
- Sent/read indicators, unread counts, latest message.
- **SSE push signaling backed by PostgreSQL LISTEN/NOTIFY**, with polling safety fallback. WebSocket, background push and presence are not yet included.
- Mobile-first responsive conversation layout with fixed headers and keyboard handling.

### API
- `GET /api/v1/dm/people?q=`
- `GET /api/v1/dm/conversations`
- `POST /api/v1/dm/conversations`
- `GET /api/v1/dm/conversations/:id/messages`
- `POST /api/v1/dm/conversations/:id/messages`
- `POST /api/v1/dm/conversations/:id/read`

All routes require a valid session; message endpoints validate membership. Writes require the expected Origin. Only public profiles are discoverable, but previously established conversations are unaffected by visibility changes.


### Real-time synchronization (SSE)

- `GET /api/v1/dm/events` provides SSE over the existing Better Auth cookie session; no URL auth tokens.
- The browser maintains an EventSource while visible and reconnects automatically. `message`, `read`, and `conversation` notifications trigger immediate authorized list/history fetching.
- One process-wide PostgreSQL `LISTEN uorqui_dm_events` connection handles `NOTIFY` events across Fastify instances. A direct Neon connection is needed for session-scoped LISTEN; set `DATABASE_DIRECT_URL` when necessary.
- SSE contains only event type and conversation ID, never message text. All actual content is fetched through participant-authorized APIs.
- 15-second heartbeat, 5-minute maximum stream lifetime for session revalidation, disconnect while the page is hidden.
- Safety polling remains at around 25–30 seconds when SSE is connected and resumes the existing 3/4-second cadence if the stream fails. This does **not** include offline push notifications.

### Database rollout
Migration `0003_live_direct_messages` adds unique `client_id` and `read_at` to direct messages. Apply **before deploying** the API/frontend.

### Not included yet
Older-message pagination, R2 attachments, push, presence, persisted reactions/replies, edit/delete, anti-spam and moderation.
