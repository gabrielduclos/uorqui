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
- The browser maintains an EventSource while visible and reconnects automatically. `message`, `read`, `received`, `update`, and `conversation` notifications trigger immediate authorized list/history fetching. **Global badge delivery:** once an unread message is included in the navigation badge's successful conversation fetch, the connected client acknowledges `/received` regardless of the current app area; it **never calls `/read`** or clears unread count. Edited content receives a new delivery acknowledgement.
- One process-wide PostgreSQL `LISTEN uorqui_dm_events` connection handles `NOTIFY` events across Fastify instances. A direct Neon connection is needed for session-scoped LISTEN; set `DATABASE_DIRECT_URL` when necessary.
- SSE contains only event type and conversation ID, never message text. All actual content is fetched through participant-authorized APIs.
- 15-second heartbeat, 5-minute maximum stream lifetime for session revalidation, disconnect while the page is hidden.
- Safety polling remains at around 25–30 seconds when SSE is connected and resumes the existing 3/4-second cadence if the stream fails. This does **not** include offline push notifications.

### Database rollout
Migration `0003_live_direct_messages` adds unique `client_id` and `read_at` to direct messages. Migration `0004_dm_actions` adds `delivered_at`, `edited_at`, `deleted_at`, `forwarded_from_id`, and `direct_message_reactions`. Migration `0005_dm_replies` adds a nullable, self-referencing `reply_to_id` to real DMs. Migration `0006_dm_reaction_notifications` adds `notified_at` and `read_at` to reactions; older reactions do not generate retroactive alerts. Apply **before deploying** the API/frontend.

### Not included yet
Older-message pagination, R2 attachments, push, presence, anti-spam and moderation.

### Cancellation, reaction events, and navigation

- `DELETE /api/v1/dm/conversations/:id/messages/:messageId` cancels a user's own **unread** message, permanently and without a placeholder. Already-read messages return HTTP 409 without mutation.
- `GET /api/v1/dm/conversations/:id/messages?around=<uuid>` returns an authorized segment centered around the original for reply navigation/highlighting.
- Reactions are attached to their original message as compact optimistic chips, with Undo; they never create an extra chat message or timeline row.
- The inbox preview shows the latest reaction when newer than the last message. The message author sees “Alex reacted ❤️ to your message”, counted as **one unread reaction** until the conversation is read. The person who reacted sees “You reacted ❤️ to a message” **without incrementing their own unread count**. `lastReactionAuthorId` distinguishes perspectives. Undo removes that preview when no other later reaction remains. The global badge adds unread messages and *received* reactions via SSE/polling.
- Visual identity: square chat message bubbles.
- Outgoing receipt rows split whenever adjacent messages have different statuses, so Read never merges with Sent/Received. An edited message gets its own fresh Sent receipt until the recipient acknowledges that revision via `/received` and `/read`. Previous receipt timestamps remain stored and count for the revised message only if they are no older than `edited_at`; retaining the historical `read_at` also prevents previously read messages from being cancelable after editing. No new migration is needed.


### Private individual chat attachments — first delivery

- Gallery, Camera, Video and File pickers connect to the live messenger. Location awaits its own permission flow. First scope: **one attachment per message**, max **20 MB**, JPEG/PNG/WebP/GIF, MP4/WebM, PDF, TXT, ZIP or a generic download; no transcoding, audio recorder or batch uploads.
- Separate **private R2 bucket** `uorqui-dm-attachments` with no public URL. The Worker validates same-origin requests, session and conversation membership before upload; creates a real message through Fastify with an idempotent client ID and attachment metadata. PostgreSQL stores metadata **only**, never binary file bytes.
- `GET/HEAD /media/dm/:conversationId/:attachmentId` checks session, membership and attachment association with a non-canceled message before R2 access. Private `no-store`, `nosniff` responses, safe content-disposition. Unread cancellation attempts R2 object cleanup.
- Square chat message bubbles support enlarged image previews, inline video controls and safe file downloads. Optimistic local previews, retryable failed uploads, delivery/read receipts, replies, reactions and global unread counts continue.
- **Migration `0007_dm_attachments`** adds four attachment metadata fields and consistency check. Test on a temporary Neon branch and obtain production migration authorization **before merge/deploy**.
