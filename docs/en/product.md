# Product requirements — initial draft

[English](product.md) · [Português](../pt-BR/produto.md)

**Status:** planning. This is a requirements document, not a feature list of working software.

## Navigation

The main destinations are **Feed**, **Messages**, **Communities**, and **Profile**. Search, notifications, and settings are global. Desktop and mobile share the same domain concepts, with layouts adapted to each device.

## 1. One-to-one messaging

- Only two participants per direct conversation; **no traditional group conversations**.
- Initial capabilities: text, attachments within configured limits, replies, reactions, delivery/read states, notifications, and message history.
- Safety: block, report, contact/message requests, per-user limits, and server-side authorization.
- Distinguish sent, delivered, read, and failed states; do not promise end-to-end encryption until implemented and reviewed.

## 2. Hybrid feed

- A **continuous vertical scroll** of variable-height posts: text, photos, carousels, portrait and landscape videos.
- Public posts may lead to relevant public communities; restricted community posts must stay restricted.
- Videos may autoplay **muted** when visible, with only one active at a time. Use conservative preloading and explicit data-saving controls.
- Preserve the feed's scroll position when opening a post, profile, or immersive video and returning.
- Initial discovery: **For you** and **Following** filters; ranking starts with understandable/simple rules, not assumed AI.

## 3. Immersive Videos mode

- Accessible **directly** through a feed shortcut/filter and **from any eligible video post**.
- Opening from a post begins with that **specific video**.
- Full-screen, video-only sequence. Vertical swipes move between videos, and the user stays in this mode until intentionally leaving it.
- Offer share, comment, react, profile and eligible community entry actions.
- Return to the previous feed position when entered from the mixed feed; direct entry has its own coherent back behavior.
- **Videos is a working label. Do not call the feature “Reels.”**

## 4. Communities

- Public/open, public/requires approval, or private/invite-only.
- Multiple topic-based **text channels** and **voice rooms**, member roles, channel permissions, invitations, moderation, and reporting.
- Voice may persist while navigating the app, subject to OS/browser constraints. Other media should start muted during a voice session.
- Members must never gain visibility into private channels, media, notifications, or search results without authorization.

## 5. Cross-pillar experience

A user can find a relevant public post, inspect its author/community, join an eligible channel or voice room, and later start a private conversation. Content may be shared into direct conversations or authorized community channels.

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

### Initial persistent feed implementation

- Home now shows a real cursor-paginated hybrid timeline: **For you** contains authorized posts (public, friends and own); **Following** contains explicitly followed accounts and own posts; following is independent of mutual friendship.
- Publish text, up to **6 images** as a carousel or **1 video** (50 MB per media file), like/unlike, comment, edit and delete own posts. Private profiles require an accepted friendship; blocks hide posts.
- The Worker validates file signatures and draft ownership, stores media in private R2, and uses an HMAC signature to link uploaded media through the API. Posts with media are not visible until all expected assets are confirmed; upload retries resume completed slots, with editable captions and explicit draft discard.
- The immersive **Videos** mode starts at the tapped clip and animates vertical swipes, keyboard navigation and wheel scrolling, restoring the feed position on exit. Portrait videos fill the available mobile viewport while landscape videos fit without cropping. Playback, mute, pause and progress remain **inside Uorqui** with no native external-player or download controls. The inline and immersive player share a permission-checked temporary in-memory video file. While immersive mode is active, the next video is prefetched and the previous one remains prioritized in a bounded 160 MB tab-memory window; none of this private content enters persistent browser caches.
- Share URLs use `/?post=<id>`; image zoom is available. Private images use bounded per-tab memory caching, cleared on sign-out. Access to private shared posts remains authorization-gated.
- Drizzle migration `0019_hybrid_feed` creates `feed_posts`, `feed_media`, `feed_likes` and `feed_comments`. Production must be migrated before enabling feed endpoints; missing schema returns `FEED_NOT_READY`.
- Migration `0020_feed_follows` adds independent directional follows. Private accounts may only be followed by accepted friends; account blocks override follows. Follow/Following controls appear on posts.
- Future work: comment pagination, discovery ranking, video transcoding, reporting/moderation, previews, accessibility, and cleanup of orphaned uploads after interrupted sessions.

### Feed cache, comments and following

- The feed stays mounted when navigating to Chats, Communities, or Profile. Posts, scroll position, filter, pagination and draft remain in **per-account tab memory** and are dropped on sign-out. **Post contents are never persisted** to localStorage, IndexedDB, service workers, or persistent caches, protecting private content.
- **For you** and **Following** maintain separate in-memory timelines. After 30 seconds, they revalidate against the API when the feed becomes active or the browser tab is foregrounded, avoiding a skeleton when cached posts are present. Private images keep their existing permission-checked R2 access.
- Focusing a mobile comment field hides the bottom navigation and scrolls the field above the soft keyboard; fullscreen video comments follow the visible viewport. The send button displays only its spinner while busy.
- Comment deletion requires confirmation. Deleting **your own** comment removes it entirely without a notice; post authors can moderate comments written by other people, redacting their content and identity while keeping an **“A comment was deleted.”** placeholder. Migration `0021_feed_comment_moderation` supports moderator tombstones.
- Public profiles offer **Follow/Following**, follower and following totals, and paginated relationship lists independent of friendship. Private profiles **show the real totals** but **never expose the lists**. Public lists do not expose private accounts and respect blocks.

### Public profiles, chat and mobile sign-in

- Public profiles display a responsive **three-column** post grid with photo/video thumbnails, text-only previews, a post viewer and pagination. The `GET /api/v1/feed/posts?author=handle` API requires a session and returns only published posts from public accounts, honoring blocks. Signed-out visitors are prompted to sign in to see post media.
- One-to-one chat bubbles (live and demo) use subtle **5 px** corner radii; community channels keep their threaded message appearance.
- Mobile authentication puts sign-in ahead of promotional content, opens directly on **Sign in**, and offers Sign in/Create account tabs, mobile-friendly fields, accessible password visibility and larger touch targets. Server-side registration availability and abuse protection remain enforced.
