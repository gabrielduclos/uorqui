# Direct messenger — Uorqui

## First connected release

Direct messages use Better Auth, Neon PostgreSQL, `direct_conversations`, and `direct_messages`. React now shows real one-to-one conversations rather than demo contacts.

### Included
- Search public users by name/@username and start a conversation from a public profile.
- Exactly one conversation for each pair of participants.
- Persistent text history (latest 100 messages), 4,000-character limit, idempotent `clientId` retries.
- Each message retains its inline timestamp. **Only Read and its confirmation time** (for example, **Read at 08:32**) are displayed as a subtle receipt after consecutive outgoing messages that the recipient has actually read. Sending, Sent and Received are still tracked internally but never shown as bubble or receipt states. Edited messages become Read only after the recipient acknowledges the current revision; the unread badge remains accurate.
- Optimistic bubbles render immediately **without a spinner**, while the composer stays available. Failed sends retain a **Retry** button using the same `clientId`. Loading indicators for unrelated actions and media placeholders are unaffected.
- Edit, delete for both participants (tombstone), forward to another existing conversation, and persist reactions to received messages. Reactions update optimistically with rollback on failure.\n- **Reply** sends an optional authorized `replyToId` referring to a message in the same conversation; the reply preview is clickable and scrolls/highlights the original, fetching an older history window when necessary; the UI shows a live preview without copying the source into the body. Deleted sources show a tombstone.\n- A visible, focused inbox marks incoming messages **Received** even without opening the conversation, but never **Read**.
- **SSE push signaling backed by PostgreSQL LISTEN/NOTIFY**, with polling safety fallback. WebSocket and general online presence are not implemented. Background Web Push is implemented on a best-effort basis and still requires real-device validation.
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


### Real-time synchronization (SSE) — before and after optimization

**Real-time updates already existed before November 4, 2026.** Uorqui already used `GET /api/v1/dm/events`, browser `EventSource`, and PostgreSQL `LISTEN/NOTIFY`. The optimization **did not introduce SSE**: it reduced the work required to turn each event into a visible message.

| Area | Before November 4, 2026 | Current implementation |
| --- | --- | --- |
| Incoming message | The event carried `kind` and `conversationId`; the browser fetched the latest history again over HTTP. | A `message` event may include a compact message projection, which is immediately rendered in an open conversation. |
| Connections | Chat and global unread count used separate `EventSource` instances. | `dmEventStream.ts` shares one `EventSource` across chat and unread badge. |
| Inbox refresh | Independent consumers could request the same inbox simultaneously. | `loadDmInboxNetwork` deduplicates concurrent inbox requests and invalidates results on updates. |
| Safety reconciliation | Relatively frequent HTTP polling continued even with healthy SSE. | Approximately every 120 s with healthy SSE; roughly every 12–15 s if disconnected while the page is visible. |
| Edits, reactions, receipts | Events signaled changes and triggered HTTP reads. | Incomplete event types still reconcile through the authenticated API. |

**Current message flow:**

1. An authenticated route enforces permissions, persists the message, and publishes a conversation event. The API uses one SQL round trip to notify both participants.
2. Each Fastify process maintains a PostgreSQL `LISTEN uorqui_dm_events` session and forwards relevant events only to authenticated subscribers. `LISTEN` needs a session-capable Neon connection (`DATABASE_DIRECT_URL` when needed), not transaction pooling.
3. If the compact payload is present, the visible conversation inserts the message directly in React state and the local snapshot without waiting for another `GET /messages`. Otherwise it fetches authorized history.
4. The conversation list and unread badge reconcile via deduplicated authenticated requests. Receipt, edit, reaction and cancellation events still use the API where complete details are unavailable.
5. After reconnecting, regaining focus or reaching a safety interval, the client reconciles with the authoritative server while preserving newer events received during an in-flight HTTP request.

**Connection security and limitations:**

- SSE authenticates through the existing Better Auth cookie, with no credentials embedded in the URL. Only user-authorized subscribers receive their events. **An authenticated SSE event can now contain message content**; the former claim that events contain only `kind` and `conversationId` is outdated.
- A heartbeat is emitted every 15 seconds; streams are renewed about every 5 minutes to revalidate sessions and closed while the page is hidden. The browser reconnects automatically.
- Compact payloads are omitted if the notification exceeds its size cap; the client falls back to the authorized API. SSE is **not Web Push** and cannot guarantee closed-app notification delivery. Uorqui continues using SSE, not WebSocket.
- A successful badge refresh can acknowledge a message as **Received** without marking it **Read**. Read acknowledgement requires the conversation to be visible and focused at its latest content; background events and cached data do not themselves mark messages as read.

Primary code: `apps/api/src/dm-events.ts`, `apps/api/src/direct-message-routes.ts`, `apps/web/src/dmEventStream.ts`, `apps/web/src/LiveDirectChat.tsx`, and `apps/web/src/useUnreadDirectMessages.ts`.

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
- Outgoing receipts are still grouped by effective state, but **only Read** is displayed for confirmed current revisions, without a spinner or intermediate delivery labels. The receipt displays **Read at HH:mm** using the confirmed read timestamp formatted in the device's local time zone. Earlier `delivered_at` and `read_at` timestamps do not acknowledge edited content; server receipt logic remains unchanged, including preventing cancellation of previously read messages. No migration is needed.


### Private individual chat attachments — first delivery

- Gallery, Camera, Video and File pickers connect to the live messenger. Location is requested only when the user taps the location picker; coordinates are staged before sending as a normal persistent message with a map link. First scope: **one attachment per message**, max **50 MB**, JPEG/PNG/WebP/GIF, MP4/WebM, PDF, TXT, ZIP or a generic download; no transcoding, audio recorder or batch uploads.

- **Anti-forgery control:** the Worker signs metadata using HMAC SHA-256 and private `DM_ATTACHMENT_PROOF_SECRET`. The Fastify API verifies the signature in constant time before accepting an attachment, rejecting direct forged uploads. Configure the **same secret** (at least 32 characters) in Cloudflare Worker and Render before deployment; never commit it or put it in URLs.
- Separate **private R2 bucket** `uorqui-dm-attachments` with no public URL. The Worker validates same-origin requests, session and conversation membership before upload; creates a real message through Fastify with an idempotent client ID and attachment metadata. PostgreSQL stores metadata **only**, never binary file bytes.
- `GET/HEAD /media/dm/:conversationId/:attachmentId` checks session, membership and attachment association with a non-canceled message before R2 access. Private `no-store`, `nosniff` responses, safe content-disposition. Unread cancellation attempts R2 object cleanup.
- Square chat message bubbles support enlarged image previews, inline video controls and safe file downloads. Optimistic local previews, retryable failed uploads, delivery/read receipts, replies, reactions and global unread counts continue.
- **Migration `0007_dm_attachments`** adds four attachment metadata fields and consistency check. Test on a temporary Neon branch and obtain production migration authorization **before merge/deploy**.


### Parity with the original demo (PR #31)

- Attachments are **staged for preview and explicit send**, showing name/size and Remove; typed text becomes an attachment caption. Paste a clipboard image to stage it.
- Camera picker offers native **Take photo** and **Record video**, alongside gallery and files.
- Voice recorder supports stop, pause/resume, discard and **play before sending**. Audio player with seek/duration and **1×, 1.5×, 2×** playback speeds, using browser-supported WebM/MP4/OGG/MP3/WAV/AAC formats.
- Image annotation editor **before send** provides freehand pen, rectangle, ellipse, arrows, colors, undo and clear; saving creates a new PNG without modifying the original.
- Photo/video carousel navigates conversation media with prev/next controls, ← → Esc, and download; videos have native controls.
- The restored **50 MB** cap requires migration `0008_dm_attachment_50mb` changing only `dm_attachment_consistency`; apply Neon production migration before publishing API/Worker. No existing files are removed.
- Location requires user-triggered browser permission and staged confirmation; one normal DM carries a Google Maps link, with no background tracking.


### Private media caching, filenames and Google Maps (PR #32)

- Attachment menu shows **Gallery, Camera, File and Location** only. Record video from the Camera submenu, not a duplicated top-level picker. The **Add a link** action and its URL-entry dialog have been removed; URLs can still be pasted and sent in the regular message field, with the existing link preview.
- For **files/documents** (PDF, TXT, ZIP and other non-media attachments), show the **original filename** in the pre-send attachment preview and in the downloadable file card, both in direct and community chats; visually truncate long filenames while retaining the full download name. Photos, videos and voice notes retain localized **Photo, Video, Audio** labels so camera-generated filenames are not exposed.
- Current private-media cache stays **in tab memory only**: **48 MiB total**, **12 MiB per item**, **24 entries**, **45-minute maximum age**, and **3 parallel downloads**, with request deduplication. Images load on demand, audio when needed, and videos when opened. Oversized files bypass the Blob cache and use the authenticated route. Never persist received private media in IndexedDB, Service Worker, Cache Storage or localStorage. Access still requires Worker authorization, and logout/account changes clear temporary media. **The IndexedDB cache below stores DM message snapshots and outgoing commands; it is not a persistent cache for downloaded private media.**
- Audio player uses Light/Dark semantic high-contrast colors, distinct primary Play/Pause button, legible slider and playback speed.
- Locations open **Google Maps** without API key. Previously sent OpenStreetMap coordinates are displayed with a Google Maps link, without changing or losing historical messages.
### Friend requests and privacy-gated messages

- **Public profiles** accept new direct messages from any authenticated user. **Private profiles** accept them only from mutually accepted friends. The server enforces this when opening a conversation or sending, editing, reacting, and forwarding messages.
- Switching a profile to private immediately prevents further writes by nonfriends; previously exchanged messages remain visible. Unfriending keeps DM history but revokes private messaging rights.
- The messenger has Friends, Received and Sent tabs with add, accept, decline, cancel and unfriend actions. A private user can be requested by an exact known @handle; private accounts do not appear in public people searches. In-app SSE updates refresh friend request lists without exposing message content.
- API: `GET /api/v1/friends`, `GET /api/v1/friends/relationship/:handle`, `POST /api/v1/friends/requests`, `POST /api/v1/friends/requests/:handle/accept`, `POST /api/v1/friends/requests/:handle/decline`, `DELETE /api/v1/friends/:handle`. All authenticated, with Origin checks on writes. Request controls: max 10/day and 25 pending, 24h cooldown for canceled and 7 days after decline.
- Drizzle migration **`0009_mutual_friendships`** creates canonical `user_friendships` pairs and statuses. **Migrate production Neon before publishing the API/Worker.** This replaces the unshipped unilateral contacts migration; blocking, reports and closed-app push remain future work.

### Account blocking and hidden profile media

- Block from public profiles or DM headers; unblock in **Friends → Blocked**. Blocking is directional, but prevents messages, edits, reactions, forwards, attachments and friend requests in **both directions**. It cancels pending/accepted friendships without deleting chat history; unblocking never restores friendships.
- Profile photos and covers are hidden from each other, including direct authorized R2 links. Conversation list URLs and names are masked, blocked accounts are excluded from authenticated public search, and cached profile pictures are cleared on block/unblock and SSE friend updates. The blocked-account management list deliberately contains no profile image URLs.
- Authenticated API: `GET /api/v1/blocks`, `POST /api/v1/blocks`, `DELETE /api/v1/blocks/:handle` with origin validation for writes.
- Previously downloaded images and publicly hosted external images cannot be revoked retroactively. Only Worker-controlled R2 authorization can guarantee live access revocation.
- `0010_user_blocks` introduces the table; migrate Neon production before deploying the corresponding API and Worker.

## Performance, cache and recovery (2026-11-04)

This upgrade addresses reports that the social messenger felt slower than the older **Uorqui-chat** product. **The key improvement is avoiding a complete HTTP history reload after each SSE event—not enabling real time, which was already present.** The legacy product and its infrastructure are separate and were not modified.

- **Cache-first:** the inbox and latest 120 messages per conversation use account-scoped IndexedDB. The API remains authoritative; cached data is only shown after authentication and is cleared after successful logout.
- **Durable outbox:** messages and Files are stored in IndexedDB before network delivery. The sender stays active while the account shell is mounted, including when leaving the DM screen. Transient failures receive up to eight attempts with backoff, and permanent failures expose manual retry. The stable `clientId` provides server idempotency.
- **Optimistic inbox preview:** sending text, a location, an attachment or **a reply to another message** immediately updates the conversation's **preview, timestamp and position** in the inbox, without waiting for an API response. Attachment captions/labels are preserved; failed queued sends show **Failed to send**, without a spinner. This is a presentation-only overlay: it never changes unread counts, marks messages delivered/read, or overwrites authoritative inbox snapshots. After send confirmation, the overlay stays until the server summary catches up; durable outbox entries restore on returning to the DM screen.
- **Realtime:** unread badges and chat share one authenticated SSE connection. Compact message events are rendered immediately in visible conversations; receipt, reaction and history changes without complete details are reconciled through the API. Concurrent inbox requests are deduplicated. **See the before/after SSE table above.**
- **Fallback:** with a healthy SSE stream, only a low-frequency safety reconciliation runs every ~120 seconds. On disconnection, visible pages reconcile over HTTP approximately every 12–15 seconds.
- **Private media:** retains in-memory only, bounded to 48 MiB overall, 12 MiB per item, 24 entries, a 45-minute maximum age, and three parallel downloads; never stored in the shared service worker or CDN. Large items use the authenticated fetch path without aggressive prefetch.
- **Event efficiency:** the API notifies both conversation participants with a single SQL query, reducing unnecessary database round trips.
- **Validation:** run typecheck/build and isolated integration tests, then test across two real devices: offline/online, media delivery, account switching, logout, disconnected SSE, concurrent sends and resumption. CI cannot prove Brazilian end-to-end latency.

**Limits:** browsers can suspend JavaScript; the outbox does not guarantee background delivery while the PWA is terminated. Server authorization and cancellation rules remain authoritative.


**Optimistic replies (2026-11-04):** sending a reply with text or a file immediately renders a bubble with the referenced message preview, using localized media labels if the source has no body. SSE events and outbox acknowledgements preserve that reply preview until authenticated history reconciliation; failures keep **Retry**. The conversation list labels replies **“You replied: …”** or **“Name replied: …”** before and after confirmation via the `lastReplyToId` projection, without a database migration.


**Media loading indicator (2026-11-04):** a spinner appears **only on media** while its content or metadata buffers/loads (images, videos and audio), across direct messages, community channels and media viewers. Plain-text bubbles, delivery/read status rows and ready-to-download file cards **do not** show a spinner. Media failures stop the loading animation.

Outgoing attachment bubbles still pending upload display a small “Uploading media” spinner. It disappears on confirmation or failure and never appears on text-only messages.
