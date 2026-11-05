# Product decision — Discover replaces the feed

> Superseded on November 5, 2026: Discover is no longer a navigation tab. The workspace contains Messages, Communities and Email. Public community browsing is inside Communities. See [workspace UI](sprintrix-workspace-ui.md) and [email](email.md). The remaining text records the earlier decision.

[English](discover.md) · [Português](../pt-BR/descobrir.md)

**Decision date:** November 2, 2026. **Status:** initial implementation committed to `main`: Discover home, recommendations, authenticated activity, navigation and onboarding. **Production deployment and device acceptance are not yet confirmed.** Old feed data/code remain for compatibility.

## Product proposition

Uorqui is a social platform built around **communities, one-to-one messaging, and real-time participation**. Main destinations become **Discover · Messages · Communities**; Profile, search, notifications and settings remain accessible without turning profiles into public post timelines.

There will be **no global post feed**. Retire the “For you”/“Following” filters, global post creation/likes/comments, public post grids on profiles, and infinite short-video browsing. Photos, videos, links, voice messages and files remain available **inside direct messages and authorized community channels**. Removing global posts does not remove channel conversations or their media.

## Home destination: Discover

1. **Happening now:** active voice rooms and recent channel activity **from communities the person has joined**. Display the authorized community/channel name, activity type and grounded counts. Shortcuts open channels or room details; they never connect the microphone without explicit user action.
2. **Recommended communities:** discoverable public communities with name, avatar, description, category/interests and factual membership/activity. Begin with understandable recommendations based on category, language, interests and popularity, not an opaque engagement algorithm. Never reveal private communities without authorization.
3. **Search and explore:** search by name/topic/category, browse public community information and offer the correct action for its access policy: join, request access or accept an invitation.
4. **New-user and empty states:** show search and discoverable public communities even if the user has joined none. Never invent participants, messages or counts. The home screen must be useful without a critical mass of posts.

**Display priority:** current activity from joined communities first when available, alongside search and public recommendations. Never leak private channels or blocked accounts in search/activity. Notifications and unread badges link to the correct channel and do not prematurely mark it read.

## UX and security requirements

- Use realtime events where supported with bounded fallback and loading states; counts/presence must be server-grounded.
- Enforce server-side user, community and channel permissions for activity, titles, previews and counts. Private information must never surface in discovery results.
- Mobile-first and desktop layouts, accessibility, empty states, Light/Dark and PT-BR/EN.
- Success metrics: community discovery, joining, real participation, returning to channels, joining voice and starting one-to-one conversations — **not feed scroll time or video views**.

## Migration from the existing feed beta

The present beta includes implemented feed posts, post grids on profiles, short-video browsing, follower relationships and API contracts. These are **legacy features from the previous product direction**, not requirements for the future navigation.

1. Implement Discover, navigation, onboarding and relevant links without breaking Messages, Communities, invitations or ongoing voice calls.
2. Audit screens, old post deep links and notifications that currently rely on the feed; decide on backwards-compatible handling.
3. Retire global post creation/feed access and short-video mode only after dependent journeys have been migrated.
4. Review retention and potential export of existing posts; **do not automatically drop database tables, delete R2 files or erase user data**. Schema removal requires versioned migrations, privacy review and rollback planning.
5. Validate with pilot users and real desktop/Android/iOS PWA tests. Update historical documentation/changelog when the actual application changes.

**Implemented in code:** `DiscoverHome`, authenticated `GET /api/v1/communities/discover/activity`, community/channel navigation, updated onboarding, removal of public-profile post galleries and follow controls. **Still pending:** deployment verification, full migration of legacy post links/notifications, retention review and technical retirement of post endpoints/data.

## Technical cleanup (November 2, 2026)

Unused demonstration chat components (`DemoChatBubble`, `DemoChatMedia`, `DemoImageEditor`, `DemoMessageComposer`) and the unused former profile gallery (`PublicProfilePosts`) have been removed. The public landing page now describes **Discover** instead of Feed. Discover received mobile-width containment for cards and search.

**Production Neon database — read-only inventory:** `feed_posts` (5 rows), `feed_media` (4), `feed_comments` (2), `feed_likes` (8), `feed_follows` (2), plus 8 legacy post/follow notifications and no post reports. No user data was deleted. Legacy feed deep links still exist; decommissioning must coordinate API, R2 media, notifications, tests and schema. Export/backup retained content, then validate a migration on an isolated Neon branch before approving any production deletion.

**Former feed UI retirement:** `LiveFeed` and feed-only session caching have been removed from the frontend. Historical post notifications open the actor profile rather than the former posting UI. Legacy feed API endpoints and stored content remain temporarily available for a controlled export and safe migration; no automatic user-data deletion is performed.

## Legacy feed retirement — schema migration

The old global feed has already been removed from primary navigation. Branch `chore/retire-feed-database-2026-11-02` additionally removes legacy API and media paths, followers, likes, comments, and obsolete notification UI. Migration `0029_retire_global_feed.sql` removes the five feed-only tables, legacy activity events and three retired push preference columns, while preserving users, friendships, community and direct messages, message reports, active push subscriptions and voice data.

**Recovery:** Neon branch `backup/pre-retire-feed-2026-11-02` (`br-red-star-b6uqrqe4`) is the pre-migration database snapshot. R2 legacy feed files are intentionally left in object storage; SQL migration does not delete them. Audit and separately validate any R2 clean-up. Never overwrite newer production changes with an entire backup without a merge strategy.

## Final production status — November 2, 2026

Retirement is **complete** and supersedes the historical plans/inventory above: [PR #60](https://github.com/gabrielduclos/uorqui/pull/60) was merged into `main`; legacy feed routes were removed from Fastify and the Cloudflare Worker; versioned migration `0029_retire_global_feed.sql` was applied to production Neon and recorded in `drizzle.__drizzle_migrations` (ID 30). It removed `feed_posts`, `feed_media`, `feed_comments`, `feed_likes`, `feed_follows`, eight legacy activity events and three retired push preference columns. Post-migration checks confirmed 67 existing direct messages, five community messages, four users and two communities remain intact. The live production smoke test passed for Render, Cloudflare, Neon, authentication and HTTP 404 on retired feed routes.

**Retained recovery snapshots:** `backup/pre-retire-feed-2026-11-02` (`br-red-star-b6uqrqe4`) and `backup/pre-feed-drop-prod-2026-11-02` (`br-jolly-cell-b601kly8`). Four historical media objects remain in R2 bucket `uorqui-dm-attachments`, `feed/` prefix, pending separately verified backup before deletion. Real-device iOS and Android PWA acceptance tests are still outstanding.
