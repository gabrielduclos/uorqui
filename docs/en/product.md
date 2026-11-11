# Product requirements — technical beta

[English](product.md) · [Português](../pt-BR/produto.md)

**Status (November 3, 2026):** Discover, 1:1 messaging, communities, voice and video meetings are implemented on `main`. The global feed was retired November 2. The older feed sections below are **historical only**, not supported features. Real-device tests and verification of current deployment remain separate tasks.

## Channel ordering (beta.41)

Community owners and admins can use **Moderation → Channels** to reorder the text, voice and meeting channel lists. Drag and drop is available on supported desktop browsers; up/down controls work with touch and keyboard navigation. Select **Save order** to apply the change to every community member. Only channels of the same kind can be reordered relative to each other because the navigation groups them by type. The API validates the full list and stores the shared order in PostgreSQL; new channels appear last. Apply migration `0047_community_channel_order` before deploying the corresponding API.

## Product decision

Uorqui is **community-first**, without a public/global post feed or infinite immersive video mode. The home destination is **Discover**, featuring recommended communities and activities **from communities the person has joined**. Text, photos, video, audio, files and links remain available inside messages and channels.

Details, authorization, migration and success metrics: [Discover replaces the feed](discover.md). The retired global feed UI/API/schema was removed with versioned migrations and recovery snapshots. No feed restoration is planned; see [maintenance audit](maintenance-audit.md).

## Unified email (beta.12)

- **All accounts** in the email account selector combines connected Gmail, Microsoft Outlook and manual IMAP inboxes, as well as Sent/Spam/Trash views, with each item showing its source address. The original per-account selector remains available.
- The combined list sorts by date and fetches up to one provider page per account; each account keeps its own pagination cursor. Search applies to loaded messages only, not the complete remote history.
- Multiple selected messages can be **marked read**, moved to Spam or moved to Trash. Operations are grouped by source account, capped at 100 selected items, and return partial failures without falsely marking unread messages as read.
- Compose while viewing all accounts offers a sender-account selector. Replies and message details always use the original source account. Only disconnect an account from its own filtered view.
- Opaque Outlook message IDs are sent via validated same-origin JSON request bodies rather than long URL paths. Old endpoints remain supported for deployed clients.

## Navigation

Primary destinations: **Discover**, **Messages**, **Communities**. Profile, search, notifications and settings stay accessible as secondary navigation on mobile and desktop.

## 1. One-to-one messaging

- Only two participants per direct conversation; **no traditional group conversations**.
- Initial capabilities: text, attachments within configured limits, replies, reactions, delivery/read states, notifications, and message history.
- Safety: block, report, contact/message requests, per-user limits, and server-side authorization.
- Distinguish sent, delivered, read, and failed states; do not promise end-to-end encryption until implemented and reviewed.

## 2. Discover — home screen

- **Happening now:** real text-channel and voice-room activity **from communities the person belongs to**, including authorized community/channel names, unread counts, presence and contextual shortcuts. Never auto-join voice calls.
- **Recommended communities:** list discoverable public communities only, with search by name/interest, category, description, photo and factual counts. Begin with understandable ranking, not post/video algorithms.
- **No memberships yet:** show helpful search and public community suggestions without invented activity.
- **Privacy:** enforce permission checks server-side for all activity, search, previews and counts; respect private communities, channel policies and blocks.
- **Freshness:** reuse available realtime/SSE events and bounded fallback with loading states; background activity is never a read acknowledgement.
- **Actions:** open channels/room details, view communities, join, request approval or accept invitations as permitted.

## 3. Communities

- Public/open, public/requires approval, or private/invite-only.
- Multiple topic-based **text channels** and **voice rooms**, member roles, channel permissions, invitations, moderation, and reporting.
- Voice may persist while navigating the app, subject to OS/browser constraints. Other media should start muted during a voice session.
- Members must never gain visibility into private channels, media, notifications, or search results without authorization.

## 4. Cross-pillar experience

A person discovers a public community on Discover, explores available channels and activities, joins under its access rules, participates in text/voice, and may later start a private one-to-one conversation. Media and links continue to be shared within messages and authorized channels.

## Quality and safety acceptance criteria

No unauthorized private content exposure; no silent message loss; clear upload limits; reconnect behavior tested on mobile; user blocking and reporting; accessible controls; video and voice spending monitored.

## Out of scope for the first MVP

Traditional group chats, large-scale livestreaming, creator payouts, marketplace, AI-first personalization, full federation, 1:1 video calls, and unlimited free media/voice.

## Text-channel message reactions

- Active community messages support emoji reactions from other members. Authors cannot react to their own messages, consistently with Uorqui's current chat behavior.
- A member can react **once per emoji** on a message and use several distinct emojis. Reaction chips show the emoji and count; the member's own selections are highlighted. Clicking a selected reaction removes it; the `+` control opens the compact emoji picker.
- Message lists expose `reactions: [{emoji,count,mine}]` and `canReact` and refresh during normal channel polling. Authenticated `PUT` and `DELETE /api/v1/communities/:id/channels/:channelId/messages/:messageId/reactions` accept `{emoji}` and enforce Origin and membership checks.
- Reactions are not separate messages; canceled messages hide reactions and reject further changes.
- Additive Drizzle migration **`0017_community_message_reactions`** creates `community_message_reactions`. Apply it to Neon PostgreSQL before enabling reactions in production. Until migration, channel histories remain readable and reaction writes return unavailable.

## Unified text-channel composer

- Community text channels reuse the existing `LiveMessageComposer`: gallery, camera, files, Google Maps location, image editor, voice recording with pause/resume, and emojis.
- The existing **GIF picker remains available** from the shared composer.
- Channel posts have **no sent/delivered/read receipts**. Only transient upload/send progress and retry on failure are shown.
- Attachments up to 50 MB, including recorded voice notes, reuse the existing signed Worker and private R2 storage, under a `community/<communityId>/<channelId>` namespace. API authorization is community- and channel-specific.
- Uploads require Worker-issued HMAC proof. Media downloads require current membership and an active, non-canceled message.
- Drizzle migration `0018_community_message_attachments` adds attachment metadata and allows empty text only with an attachment. Apply it to Neon before enabling the feature in production; existing text messages remain intact.

### Beta history: persistent feed implementation (retired November 2, 2026)

> **Technical record of previously implemented behavior.** These items do not define the future experience. Do not delete existing posts, media, database tables, endpoints or links without a retention, migration and rollback plan. See the [Discover decision](discover.md).

- Home now shows a real cursor-paginated hybrid timeline: **For you** contains authorized posts (public, friends and own); **Following** contains explicitly followed accounts and own posts; following is independent of mutual friendship.
- Publish text, up to **6 images** as a carousel or **1 video** (50 MB per media file), like/unlike, comment, edit and delete own posts. Private profiles require an accepted friendship; blocks hide posts.
- The Worker validates file signatures and draft ownership, stores media in private R2, and uses an HMAC signature to link uploaded media through the API. Posts with media are not visible until all expected assets are confirmed; upload retries resume completed slots, with editable captions and explicit draft discard.
- The immersive **Videos** mode starts at the tapped clip and animates vertical swipes, keyboard navigation and wheel scrolling, restoring the feed position on exit. Portrait videos fill the available mobile viewport while landscape videos fit without cropping. Playback, mute, pause and progress remain **inside Uorqui** with no native external-player or download controls. The inline and immersive player share a permission-checked temporary in-memory video file. While immersive mode is active, the next video is prefetched and the previous one remains prioritized in a bounded 160 MB tab-memory window; none of this private content enters persistent browser caches.
- Share URLs use `/?post=<id>`; image zoom is available. Private images use bounded per-tab memory caching, cleared on sign-out. Access to private shared posts remains authorization-gated.
- Drizzle migration `0019_hybrid_feed` creates `feed_posts`, `feed_media`, `feed_likes` and `feed_comments`. Production must be migrated before enabling feed endpoints; missing schema returns `FEED_NOT_READY`.
- Migration `0020_feed_follows` adds independent directional follows. Private accounts may only be followed by accepted friends; account blocks override follows. Follow/Following controls appear on posts.
- Future work: comment pagination, discovery ranking, video transcoding, reporting/moderation, previews, accessibility, and cleanup of orphaned uploads after interrupted sessions.

### Beta history: feed cache, comments and following (legacy)

- The feed stays mounted when navigating to Chats, Communities, or Profile. Posts, scroll position, filter, pagination and draft remain in **per-account tab memory** and are dropped on sign-out. **Post contents are never persisted** to localStorage, IndexedDB, service workers, or persistent caches, protecting private content.
- **For you** and **Following** maintain separate in-memory timelines. After 30 seconds, they revalidate against the API when the feed becomes active or the browser tab is foregrounded, avoiding a skeleton when cached posts are present. Private images keep their existing permission-checked R2 access.
- Focusing a mobile comment field hides the bottom navigation and scrolls the field above the soft keyboard; fullscreen video comments follow the visible viewport. The send button displays only its spinner while busy.
- Comment deletion requires confirmation. Deleting **your own** comment removes it entirely without a notice; post authors can moderate comments written by other people, redacting their content and identity while keeping an **“A comment was deleted.”** placeholder. Migration `0021_feed_comment_moderation` supports moderator tombstones.
- Public profiles offer **Follow/Following**, follower and following totals, and paginated relationship lists independent of friendship. Private profiles **show the real totals** but **never expose the lists**. Public lists do not expose private accounts and respect blocks.

### Public profiles, chat and mobile sign-in

- Public profiles display a responsive **three-column** post grid with photo/video thumbnails, text-only previews, a post viewer and pagination. The `GET /api/v1/feed/posts?author=handle` API requires a session and returns only published posts from public accounts, honoring blocks. Signed-out visitors are prompted to sign in to see post media.
- One-to-one chat bubbles (live and demo) use subtle **5 px** corner radii; community channels keep their threaded message appearance.
- Mobile authentication puts sign-in ahead of promotional content, opens directly on **Sign in**, and offers Sign in/Create account tabs, mobile-friendly fields, accessible password visibility and larger touch targets. Server-side registration availability and abuse protection remain enforced.

### Integrated sharing and account sign-out

- The one-to-one chat **Send** control matches the subtle **5 px** message bubble corners.
- Message actions and the media viewer support sharing text, photos, videos, audio and files with **friends** or **existing conversations** using a searchable recipient picker with per-recipient delivery feedback. Blocked or restricted destinations cannot receive new messages.
- Private media is checked for access and uploaded as a **new destination-scoped attachment**, never by reusing a private URL across conversations. The 50 MB upload limits still apply. Text forwarding uses the idempotent authorized forwarding API.
- **Retired behavior:** feed-post sharing is no longer available. The current `InternalShareDialog` forwards messages/media only. Older post URLs already present in DMs show a historical-content notice rather than linking to a nonexistent feed screen.
- A **Sign out** button is now visible at the top of the account profile on mobile and desktop and shows a confirmation dialog. Signing out clears session-scoped media caches.

### Voice-room presence and login resilience (November 2026)

- The community's main channel screen now shows **who is in each voice room** without joining it, including privacy-authorized avatars, names, participant totals, microphone-muted and audio-disabled states. Presence revalidates about every 5 seconds while visible (15 seconds while in the background), omits expired sessions and respects account blocks/privacy. Live speaking activity remains available only in the connected WebRTC room; it is never invented for other rooms.
- `GET /api/v1/communities/:id/voice/presence` is authenticated and member-only and groups active participants by channel. Integration tests cover anonymous/nonmember denial, sessions, mute/deafen, blocks and departure.
- The sign-in entry no longer waits up to 20 seconds for session initialization; the form appears after a short initial attempt. Session/status probes are bounded, and users may retry sign-in after a transient readiness failure. Both `/` and `/index.html` are served with no-store headers to prevent stale HTML references to replaced JS bundles. Authentication remains enforced by the API.

### First-run tour and community unread badges

- On first authenticated entry per account, a **four-stage onboarding** introduces **Discover** (communities and their activity), **Messages** (one-to-one chats), **Communities** (text/voice channels) and **Profile photo** (choose, crop and save or proceed with no photo). The tour can be skipped; completion is saved per account on the device.
- Avatar onboarding reuses the private profile-media endpoint and photo cropper; the avatar can be replaced later in Profile.
- **Numeric unread badges** are shown on text channels, individual community icons and the main mobile/desktop Communities navigation. Own/deleted messages are excluded; reading is acknowledged only when a text channel is open and its messages have loaded. Per-user/channel cursors persist in PostgreSQL across devices. The API checks session, membership, origin and enforces monotonic read progress.
- Sign-in and account creation use edge-to-edge mobile card spacing and actual link styles for recovery and email verification in both light and dark modes.

### Realtime communities

- The main voice-room channel list shows **name, microphone on/off and speaker audio on/off**, with no profile images. A small presence dot remains next to the username; speaking is highlighted only when actual activity is known.
- Text-channel messages, unread badges and voice-room occupants use authenticated **Server-Sent Events (SSE)**, the same pattern as direct messaging. `GET /api/v1/communities/events` requires a valid session, resubscribes every five minutes and transmits only channel/community IDs plus event kinds. All content is fetched via membership-gated API requests. A ~30-second fallback covers disconnections.
- A dedicated cluster-wide PostgreSQL `LISTEN/NOTIFY` subscription per API instance dispatches message, channel and voice activity without message bodies. Community approval also emits account-targeted membership events; the applicant refreshes community access and reconnects SSE without reloading.

### Video meetings and password-protected channels

- **Meeting rooms** are distinct from ordinary voice and text channels. They reuse WebRTC signaling for up to six participants. Text starts collapsed in voice and meeting channels; meeting cameras highlight the active speaker and support a fullscreen view with self-picture-in-picture, manual selection and screen sharing (when supported by the browser).
- Organizers can copy the room link or send it as a one-to-one Uorqui Messenger invitation. A link never bypasses community membership, user blocks or meeting admission policy.
- Meeting administrators choose **open admission** or **approval required**. Pending requests are enforced server-side; verified community and meeting join requests can notify moderators via the inbox and opt-in push preference.
- **Closed channel permissions:** any text, voice or meeting channel may be **open** to community members or **closed** to the owner, admins and specifically permitted members. Configure at creation or under **Edit channel**; grant users access in **Moderation → Members**. Server-side permission checks cover messages, media, events, notifications and WebRTC; revocation ends ongoing RTC sessions. See [Channel permissions](channel-permissions.md). Migration **0033** is required in the target environment.
- **Channel passwords:** owners/admins can set, rotate and remove passwords from the channel header in text, voice and meeting channels. Passwords use random-salt scrypt hashes, not plaintext storage. Unlock grants are scoped to the member and channel and are revoked on password changes. Server-side gates protect messages, attachments, message push recipients, live participant presence and WebRTC signaling. Incorrect guesses are rate limited.
- Channel passwords do not replace community membership or community moderation. Admins can access the channels they manage.
- **Deployment:** migrations `0030`–`0032` are versioned and recorded in the project's production deployment history. Always verify the live API, backup and migration state independently of GitHub CI.
