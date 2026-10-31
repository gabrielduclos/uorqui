# Direct messenger — Uorqui

## First connected release

Direct messages use Better Auth, Neon PostgreSQL, `direct_conversations`, and `direct_messages`. React now shows real one-to-one conversations rather than demo contacts.

### Included
- Search public users by name/@username and start a conversation from a public profile.
- Exactly one conversation for each pair of participants.
- Persistent text history (latest 100 messages), 4,000-character limit, idempotent `clientId` retries.
- Each message retains its inline timestamp. Sending/Sent/Received/Read appears as one centered system-style status row with the time of the latest relevant update after each consecutive outgoing message block. The block conservatively reflects the least advanced non-deleted message, so it cannot claim Read before all messages are read. Delivery acknowledgement does not mark a message read.
- Optimistic message bubble with spinner and retry (same client ID) while the composer remains available.
- Edit, delete for both participants (tombstone), forward to another existing conversation, and persist reactions to received messages. Reactions update optimistically with rollback on failure.\n- **Reply** sends an optional authorized `replyToId` referring to a message in the same conversation; the reply preview is clickable and scrolls/highlights the original, fetching an older history window when necessary; the UI shows a live preview without copying the source into the body. Deleted sources show a tombstone.\n- A visible, focused inbox marks incoming messages **Received** even without opening the conversation, but never **Read**.
- **SSE push signaling backed by PostgreSQL LISTEN/NOTIFY**, with polling safety fallback. WebSocket, background push and presence are not yet included.
- Mobile-first responsive conversation layout with fixed headers and keyboard handling, high-contrast composer in Light/Dark and no “Live” visual badge.

### API
- `GET /api/v1/dm/people?q=`
- `GET /api/v1/dm/conversations`
- `POST /api/v1/dm/conversations`
- `GET /api/v1/dm/conversations/:id/messages`
- `POST /api/v1/dm/conversations/:id/messages` (optional `replyToId` for replies)
- `POST /api/v1/dm/conversations/:id/received` (delivery, not read)
- `PATCH /api/v1/dm/conversations/:id/messages/:messageId` (author-only edit)
- `DELETE /api/v1/dm/conversations/:id/messages/:messageId` (author-only delete for both)
- `PUT/DELETE /api/v1/dm/conversations/:id/messages/:messageId/reaction` (reactions from recipient)
- `POST /api/v1/dm/conversations/:id/messages/:messageId/forward` (to another authorized conversation)
- `POST /api/v1/dm/conversations/:id/read`

All routes require a valid session; message endpoints validate membership. Writes require the expected Origin. Only public profiles are discoverable, but previously established conversations are unaffected by visibility changes.


### Real-time synchronization (SSE)

- `GET /api/v1/dm/events` provides SSE over the existing Better Auth cookie session; no URL auth tokens.
- The browser maintains an EventSource while visible and reconnects automatically. `message`, `read`, `received`, `update`, and `conversation` notifications trigger immediate authorized list/history fetching.
- One process-wide PostgreSQL `LISTEN uorqui_dm_events` connection handles `NOTIFY` events across Fastify instances. A direct Neon connection is needed for session-scoped LISTEN; set `DATABASE_DIRECT_URL` when necessary.
- SSE contains only event type and conversation ID, never message text. All actual content is fetched through participant-authorized APIs.
- 15-second heartbeat, 5-minute maximum stream lifetime for session revalidation, disconnect while the page is hidden.
- Safety polling remains at around 25–30 seconds when SSE is connected and resumes the existing 3/4-second cadence if the stream fails. This does **not** include offline push notifications.

### Database rollout
Migration `0003_live_direct_messages` adds unique `client_id` and `read_at` to direct messages. Migration `0004_dm_actions` adds `delivered_at`, `edited_at`, `deleted_at`, `forwarded_from_id`, and `direct_message_reactions`. Migration `0005_dm_replies` adds a nullable, self-referencing `reply_to_id` to real DMs. Apply **before deploying** the API/frontend.

### Not included yet
Older-message pagination, R2 attachments, push, presence, anti-spam and moderation.

### Cancellation, reaction events, and navigation

- `DELETE /api/v1/dm/conversations/:id/messages/:messageId` cancels a user's own **unread** message, permanently and without a placeholder. Already-read messages return HTTP 409 without mutation.
- `GET /api/v1/dm/conversations/:id/messages?around=<uuid>` returns an authorized segment centered around the original for reply navigation/highlighting.
- Reactions stay as compact optimistic chips on their source messages, **not separate timeline bubbles**. Received reactions update the inbox preview (emoji, time, source excerpt) and are **unread notifications** counted in both the thread and navigation badges until a real read receipt.
- The chat icon shows the aggregate number of unread messages account-wide via SSE/polling on mobile and desktop.
- Visual identity: square chat message bubbles.

### Persistent unread reaction notifications

- Migration `0006_dm_reaction_notifications` adds `updated_at` and `read_at` to reactions; legacy reactions start marked read to avoid spurious retroactive notifications.
- PUT reaction upserts the emoji and makes the recipient's reaction receipt unread, while DELETE removes the pending receipt. SSE refreshes the inbox.
- Inbox API provides `previewKind`, `previewReactionEmoji`, `previewReactionBody`, `previewReactionAt`, `unreadMessageCount`, `unreadReactionCount`, and their sum `unreadCount`. Only another participant's reactions on your messages notify you.
- Read acknowledgements clear unread messages and reactions only upon actually viewing the chat, never just browsing the inbox.
