# Uorqui UI Kit · Design System v0.1

> Documentation only. The UI kit is **not** a public route or a page inside the application.

## Purpose

The shared visual foundation for Uorqui's **Discover, direct messaging and communities**. It supports desktop and mobile, semantic theming, accessible interactions, and Brazilian Portuguese / English localization.

## UX direction — Discover

- No global post feed on the home screen. Sections: **Happening now** (authorized channel/voice activity from joined communities), **Recommended communities**, and **Search**.
- Community cards show verified names, images, descriptions/categories, counts and actions to join or request access.
- Activity shortcuts open the exact channel/room, without auto-connecting the microphone or acknowledging unread messages.
- Helpful empty states for new users; no invented membership, activity or messages.
- Primary navigation: **Discover · Messages · Communities**; Profile, notifications and settings remain accessible.
- Discover is implemented and the global beta feed has been retired. Cross-device visual acceptance is still pending. See the [decision](discover.md).

## Theme design

**Dark mode is the initial default.** A sun/moon switch in the app header toggles Light/Dark immediately. Persist the explicit choice in localStorage key uorqui:theme.

| Token | Dark | Light | Usage |
| --- | --- | --- | --- |
| --background | #080e1b | #f7f8fc | App background |
| --foreground | #f1f5ff | #111827 | Text |
| --card | #101a2b | #ffffff | Cards/panels |
| --popover | #121d30 | #ffffff | Overlays |
| --primary | #6366f1 | #4f46e5 | Primary actions |
| --secondary | #1d2b43 | #e9edf6 | Secondary actions |
| --muted | #172338 | #eef1f7 | Muted surfaces |
| --accent | #243653 | #e4eaf8 | Hover/selected |
| --border | #27344c | #d8deea | Borders |
| --input | #35445d | #cbd5e1 | Input outlines |
| --ring | #818cf8 | #6366f1 | Focus indicators |
| --destructive | #ef4444 | #dc2626 | Destructive actions |

Use semantic Tailwind classes instead of hardcoded dark-only colors. Component styles must remain readable in both themes.

## Typography, dimensions and shapes

- Inter/system sans-serif, body generally 14–16px, headings 18–30px, display headings up to 48px, metadata 11–12px.
- Spacing follows Tailwind's 4px steps; touch controls are approximately 40–44px.
- Cards can be softly rounded; **chat message bubbles have gently rounded corners**.
- Messages and channels use the available desktop width instead of a narrow centered container.
- Overlays and context menus must remain within the viewport; support mobile keyboards and Escape.

## Shared components

| Component | Purpose |
| --- | --- |
| Button, Input, Label | Accessible actions and forms |
| Card, Badge, Separator, ScrollArea | Surfaces and structure |
| Avatar | Identity and fallback initials |
| PreferencesControls | Theme and language header switchers |
| LiveMessageComposer | Expandable input, attachments, emoji and voice notes |
| DirectMessageBubble | Sent/received states, reply, reactions and a viewport-safe action menu |
| ChatAudioPlayer, ChatMediaViewer | Voice playback and image/video viewer |
| ChatImageEditor | Drawing/markup before sending a photo |
| LiveCommunities, CommunityVoiceRoom | Responsive channels, voice/meeting controls, collapsible text, screen sharing |

The one-to-one messenger and community text channels **use persisted API/Neon data**. Meeting audio/video uses WebRTC; never simulate remote participants or persist a preview as a real message.

## Languages

- The header displays **🇧🇷 PT** or **🇺🇸 EN**. Clicking switches the entire UI language without reload.
- Preference key: uorqui:language; browser Portuguese defaults to PT-BR, otherwise EN.
- Translate headers, buttons, dialogs, placeholders, accessible labels, and user-facing errors. Do **not** automatically translate user-generated messages or technical identifiers.
- The shared implementation is UorquiPreferences.tsx, with the useUorquiPreferences hook and t helper.
- Update the document's lang attribute on locale change.

## Source of truth

- apps/web/src/styles.css — CSS semantic tokens
- apps/web/src/UorquiPreferences.tsx — theme and language state
- apps/web/src/PreferencesControls.tsx — header controls
- apps/web/src/components/ui/ — reusable primitives
- apps/web/src/LiveDirectChat.tsx, DirectMessageBubble.tsx, LiveMessageComposer.tsx — actual messenger
- apps/web/src/LiveCommunities.tsx, CommunityVoiceRoom.tsx — communities and meetings

When changing UI, review dark/light × Portuguese/English × desktop/mobile, update this document and ensure keyboard and assistive technology support.

## Required contract for the live messenger

- `LiveDirectChat` handles inbox, fixed conversation header, scroll, messages, and realtime updates. The message surface fills available desktop width and only the message panel scrolls.
- `DirectMessageBubble` uses **gently rounded corners** as the current Uorqui chat identity, semantic palette, swipe-to-reply and a viewport-safe context menu.
- `LiveMessageComposer` preserves **+ attachments | expanding text | emoji | shared mic/send** with a horizontal attachment menu and right-side emoji picker.
- Text messages persist through the API and appear instantly with an in-bubble spinner, retrying with the same client ID on failure while leaving the composer available. Each bubble retains its inline message timestamp. Sending/Sent/Received/Read appears once in a neutral centered system-style line after each consecutive block of outgoing messages, with the status update time; a block only reads Read or Received once every non-deleted message reaches that state. The optimistic spinner and retry control remain inside individual bubbles. The composer has distinct semantic border/background contrast in Light/Dark. No “Live” badge appears, while realtime sync remains enabled. Audio and attachments use authenticated API/Worker media endpoints; structured replies reference the original message via an authenticated API and show a preview, including deleted source placeholders; unsupported actions remain visibly disabled, not simulated locally. Editing, deleting for both participants, forwarding and reactions have authenticated, persistent endpoints. Reactions update optimistically and roll back on error; a focused, visible inbox acknowledges Received without marking Read.
- Browsing the inbox **must never mark a conversation read**; only an opened, visible conversation with a focused browser window may acknowledge messages.
- Start at the latest message, preserve position while reading older ones, and show a down arrow and incoming-message notice instead of forcing scroll.
- Validate desktop/mobile, Dark/Light, and Portuguese/English before merging. Backend migrations must reuse these UI components rather than introducing generic replacements.

## Live messenger updates — cancellation, reactions and unread count

- Actual chat bubbles retain their **gently rounded** identity.
- Reply previews are clickable, navigate to and temporarily highlight the source, fetching `?around=id` when outside the latest window.
- **Cancel message** replaces delete: available only for own unread messages, permanently removes the message without a placeholder; the API atomically rejects cancellation after read (HTTP 409).
- Reactions remain attached to the original message as compact optimistic chips; they never create separate timeline bubbles. Recent reactions appear in the inbox preview for **both participants**. The reactor sees **“You reacted ❤️ to a message”** without an unread count; the message author sees **“Alex reacted ❤️ to your message”** with an unread notification until the conversation is read.
- The mobile/desktop conversation icon shows the **sum of unread messages and reactions**, kept current via SSE with polling fallback. Once an unread **message** is counted, the client acknowledges **Received** independently of the open chat panel, without marking it Read; reaction notifications do not independently change message delivery status.
- **Homogeneous receipt blocks:** consecutive outgoing messages with different receipt states never share one system-style status line (in particular Read is never mixed with Sent or Received). Edits isolate a fresh receipt block and restart the revised text at **Sent**, requiring new delivery and read acknowledgements, while retaining the original read record to keep cancellation prohibited.


## Messenger attachments

- The **+** menu retains semantic Light/Dark and PT/EN styling. Gallery, Camera, Video and File launch native pickers; Location asks permission only on user action, with preview and confirmation before sending.
- Messages may contain text or **one private attachment** (up to 50 MB). Square bubbles show an expandable image, inline video or download card, with unchanged time and delivery receipts.
- Pending attachments use local previews and retry without duplicate client IDs. R2 and PostgreSQL enforce conversation authorization; no public URLs or tokens embedded in links.


### Parity with the original demo (PR #31)

- Attachments are **staged for preview and explicit send**, showing name/size and Remove; typed text becomes an attachment caption. Paste a clipboard image to stage it.
- Camera picker offers native **Take photo** and **Record video**, alongside gallery and files.
- Voice recorder supports stop, pause/resume, discard and **play before sending**. Audio player with seek/duration and **1×, 1.5×, 2×** playback speeds, using browser-supported WebM/MP4/OGG/MP3/WAV/AAC formats.
- Image annotation editor **before send** provides freehand pen, rectangle, ellipse, arrows, colors, undo and clear; saving creates a new PNG without modifying the original.
- Photo/video carousel navigates conversation media with prev/next controls, ← → Esc, and download; videos have native controls.
- The restored **50 MB** cap requires migration `0008_dm_attachment_50mb` changing only `dm_attachment_consistency`; apply Neon production migration before publishing API/Worker. No existing files are removed.
- Location requires user-triggered browser permission and staged confirmation; one normal DM carries a Google Maps link, with no background tracking.


### Chat media UI rules

- Four top-level attachment options: Gallery / Camera / File / Location; capture video inside Camera, without a duplicate Video button.
- Show localized human-readable media labels rather than technical filenames, while preserving original download metadata.
- Audio controls use semantic high-contrast card foreground, primary Play/Pause, secondary speed and primary seek progress for both themes.
- Chat images and opened media share bounded private tab-memory object URLs; location cards open Google Maps including previously sent OpenStreetMap links.


## Workspace v1 visual migration (2026-11-05)

The UI kit now includes an original, reusable Sprintrix-inspired implementation, without importing commercial template code or the Next.js mock application:

- `apps/web/src/ui-kit/sprintrix.css` — theme tokens scoped to the signed-in app; light canvas/sidebar `#fafafa`, dark canvas/sidebar `#181818`, white / `#0a0a0a` inset panel, subtle borders and contrast-aware selection.
- `apps/web/src/ui-kit/components.tsx` — `UIKitSectionHeading`, `UIKitCount` and `UIKitChip`.
- `apps/web/src/SocialShell.tsx` — compact single-sidebar navigation, instant full collapse, pixel wordmark without a circular icon, 53 px header, 7 px panel inset and 17 px corner radius on desktop.
- **Communities** stays in the primary sidebar, but individual communities are no longer listed there. Opening the Communities module reveals a **separate compact icon rail** with authorized communities, unread counts, and create/browse actions. On mobile, the rail hides while a channel is open. Communities also stays in the mobile bottom navigation.
- The desktop header no longer shows the search magnifier or profile avatar; Ctrl/Cmd + K, sidebar search, and the settings/profile link remain. Mobile header controls are unchanged.

This is a **visual migration only**: React/Vite, Fastify/Render, Better Auth, Neon, SSE, uploads and WebRTC remain in place. `LiveCommunities` stays mounted during module changes to preserve voice sessions. Mock preview data is never used in production.

**Verify:** `npm run build -w @uorqui/web`, `npm run check:worker -w @uorqui/web`, authenticated navigation, both themes, full sidebar collapse and voice continuity.

## Community rail and desktop notification placement (2026-11-05)

- The community icon rail now sits **inside the inset content panel**, below its header, not alongside the main sidebar. It appears only within Communities and is hidden on mobile when a channel is open; its background and divider follow the content panel.
- **Notifications** moved from the desktop sidebar to a **header bell button** with an unread count and navigation to the existing notification screen. Mobile notifications stay in the bottom navigation.
- The main sidebar has no community list or notification item. The Communities module is still accessible, as are search and profile via existing controls.
- The API, persistence, SSE and WebRTC are untouched; `LiveCommunities` stays mounted across navigation.

## Icon rail constraints and media caching policy (2026-11-05)

- The Communities content now has **one icon rail only**. The legacy internal `LiveCommunities` rail is visually hidden without unmounting the voice component. Avatars are fixed at 40 × 40 px, cropped with `object-fit: cover`, badges are constrained inside icons, and rail width is 56 px on mobile / 64 px on desktop.
- **Profile photos, covers and community avatars** share a bounded, versioned-URL **account-scoped IndexedDB and memory cache**, with at most 96 objects / 48 MiB on disk and 24-hour TTL. Profile images have a 3 MiB per-item limit, community avatars 10 MiB. Logout/account switches purge saved images and revoke Blob URLs.
- **Direct messages and channel attachments** use **tab-memory only** with reusable object URLs for images, audio, videos, PDFs, ZIPs and common documents. Memory limit is 32–96 MiB depending on reported RAM (default 64 MiB), up to 42 items, 24 MiB each and 90 minutes. Oversized downloads are stopped while streaming and remain available through the authorized endpoint.
- **Public PWA static assets** are cached by the Service Worker: hashed JS/CSS/images/fonts/static audio/video (up to 8 MiB) and branding/manifest resources, with a 100-item limit. Stable public file names use stale-while-revalidate.
- **Never place** sessions, API data, auth, `/media/*`, chat attachments or cross-origin content in shared Service Worker/Cache Storage. Private attachments have no persistent disk cache and are fetched with the Worker's permission checks. No unread/read status changes occur during media preloading.

Verify avatar reuse across screens, logout/account switch purging, real chat media playback and attachment downloads, both themes, mobile/desktop, and frontend/Worker builds.


## Private chat cache — browser security (2026-11-05)

- Direct-message and private channel attachments remain in **tab memory only**, using temporary Blob URLs. They are never written to IndexedDB, Cache Storage, localStorage, or the Service Worker; the Worker retains `Cache-Control: private, no-store` and checks access on each HTTP request.
- The in-memory cache is now **bound to the authenticated account**. Logging out or switching accounts aborts in-flight downloads and revokes object URLs. Revoked messages and deleted conversations also clear cached media.
- Nearby audio notes preload with bounded concurrency; the player avoids eager metadata downloads, reuses RAM blobs, and still invokes `play()` synchronously within the user gesture for Safari iOS.
- Expanded private images await the existing cached blob rather than launching parallel image fetches. Videos and downloads reuse any available in-tab entry.
- Limits remain 32–96 MiB depending on device memory, 42 entries, 24 MiB per item and 90 minutes. Oversized files use the authorized endpoint.
- **Caveat:** media visible during an authenticated session can still be inspected by anyone controlling that browser/profile. Private attachments do not persist after a tab is closed. Persisted **avatar** storage is separate and follows a different policy.

Manually test iOS Safari and desktop audio/video playback, image viewers, PDFs, account switches and logout, and confirm `/media/dm/*` never reaches Cache Storage/IndexedDB.

## Anchor to the latest message on chat open (2026-11-05)

- **Private DMs:** open at the latest message and use `ResizeObserver` to track media-driven layout growth only while at/near the bottom. Reading older messages does not force a jump, and existing new-message indicators remain intact.
- **Text channels and voice-room text chats:** opening/reopening always lands on the latest message rather than restoring an old scroll position. Media growth and first mobile layout frames are handled without disrupting manual history reading.
- No changes to read-receipt eligibility, SSE, caching, API authorization, or WebRTC.

Check long histories, delayed image loads, inbound messages while scrolled up, repeated open/close and iOS Safari.


## Content-only page transitions and loading (2026-11-05)

- The **main sidebar, community icon rail and workspace header remain static**. Switching among Messages, Communities, Email, Notifications, Profile and Moderation animates **only the central content surface**, using the same 180 ms fade-and-14 px slide with `cubic-bezier(.22,1,.36,1)`.
- Communities remains mounted (even when inactive) to keep its live microphone and WebRTC state; returning to the module animates its content without remounting it.
- Opening direct conversations, channels, email details and notification settings uses the same content-only entry animation; chat headers remain steady.
- Shared `WorkspaceContentLoading` skeletons are used for real data loading within conversations, messages, communities, channels, email, notifications and moderation. Navigation is never covered by a global loading overlay or blocked by artificial delays.
- Motion is disabled for `prefers-reduced-motion`; SSE, read receipts, caching, scroll anchoring and active calls are unaffected.

Check module navigation, long history, channel switching, email details, mobile/PWA, reduced motion and ongoing voice rooms.

## Channel moderation and permission-aware notifications (2026-11-05)

- The **Moderation → Channels** tab now edits a channel's **name**, **open/restricted access** and **password** (set/replace/remove) and retains confirmed deletion. Each action uses existing server-side endpoints requiring **owner or admin** role; member grants for restricted channels remain in Moderation → Members. Password access and restricted member grants are independent.
- The **notification center** shows persisted social activity, pending community invitations and unread channel locations from `/api/v1/communities/unread`. The server filters by membership, password unlock and restricted grants. Private invitations show only the recipient's invited community name, never internal channels.
- The header bell and mobile badge count one alert per unread channel, one per pending invitation and persisted activity. Opening a channel doesn't bypass existing read-receipt visibility checks. **Mark all as read** continues to apply only to persisted activity records.
- Existing community message push respects `community_message` preference, current membership, password access, restricted grants, bans, and mutual blocks. Invitation push respects `community_request`. Community message notifications deep-link to the permitted channel.
- The Service Worker **revalidates queued channel and invitation pushes at display time** with authenticated, no-store API endpoints before showing names. If permissions are revoked, a user signs out or the server is unavailable, the push is suppressed. Private attachments are not added to Service Worker caches.
- Page transitions and content-only loading remain scoped to the content area, preserving the shell and ongoing voice sessions.

Test with multiple accounts and revoked memberships: open/restricted channels, password rotation, invitation acceptance/decline, unread badges and delayed push delivery.

## Mobile header and notification return navigation (2026-11-05)

- The mobile header shows the pixel-art **Uorqui** wordmark instead of the active module name. The logo still opens Messages; the other header controls remain available.
- Tapping the desktop notification bell or the mobile Notifications tab opens Notifications and remembers the previous module. Tapping it again while Notifications is open returns to that module, including when a deep link opened Notifications. The Communities component stays mounted to preserve voice sessions.
- This behavior does not clear notifications, change read receipts or alter content-only loading/page animations.

## Contacts inside Messages

**Contacts** is accessed from the **Contacts** button at the top of the **Messages** conversation list, rather than as an independent desktop or mobile sidebar item. A back button returns to Messages. The last-module preference treats Contacts as a subpage of Messages, including existing saved selections.

The Contacts view follows the shared messenger styling: compact fixed header, semantic `bg-card` surfaces and `border-border` dividers, consistent tabs, inputs and action buttons, compact contact rows, independently scrollable content on mobile, and a matching blocked-accounts section. Empty and loading states use shared UI elements.

## Shared workspace surface and readable replies

Messages, Email and Contacts use `data-uorqui-workspace-surface`, which inherits its background and text colors from the **global** `--card` and `--card-foreground` tokens in `styles.css` instead of per-page colors. Embedded reply quotes and composer reply previews use globally themed `uorqui-reply-quote` and `uorqui-reply-draft` styles, mixing semantic `--primary`, `--primary-foreground`, `--foreground`, `--secondary` and `--ring` tokens to strengthen contrast in dark and light themes alike.
