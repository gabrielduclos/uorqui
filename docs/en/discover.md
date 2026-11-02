# Product decision — Discover replaces the feed

[English](discover.md) · [Português](../pt-BR/descobrir.md)

**Decision date:** November 2, 2026. **Status:** approved product direction for future implementation; the current UI and API **have not** been migrated by this documentation change.

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

**Out of scope for this documentation update:** implementing the UI or deleting code/data.
