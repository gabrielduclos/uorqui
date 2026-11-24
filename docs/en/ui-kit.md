# UI kit

[Português (Brasil)](../pt-BR/ui-kit.md) · [README](../../README.md)

The shared UI kit uses black, white and neutral grays in light and dark themes. React components use Tailwind and shadcn/ui conventions with Radix dialogs. The global tokens in [styles.css](../../apps/web/src/styles.css) are the source of truth and can be imported into tweakcn.

| Token | Light | Dark |
| --- | --- | --- |
| Background / sidebar | `#f5f5f5` | `#0a0a0a` |
| Foreground | `#171717` | `#fafafa` |
| Card / popover | `#ffffff` | `#141414` |
| Primary | `#171717` | `#fafafa` |
| Primary foreground | `#ffffff` | `#0a0a0a` |
| Muted | `#ededed` | `#262626` |
| Muted foreground | `#5c5c5c` | `#a3a3a3` |
| Accent | `#e5e5e5` | `#303030` |
| Border / input | `#d9d9d9` | `#333333` |
| Ring | `#737373` | `#fafafa` |

Secondary, popover and sidebar tokens reference the shared semantic palette. Error feedback uses a labeled message, weight and neutral contrast. Readable text communicates the state.

## Components and layout

| Component | Rules |
| --- | --- |
| Buttons | Primary, outline and ghost variants. Disabled state reduces opacity and blocks input. |
| Dialogs | Radix focus management, visible title, close label and Escape support. |
| Forms | Persistent labels, 16 px input text, visible focus and translated validation. |
| Community navigation | 68 px vertical rail, 46 px initials buttons, community name on hover and accessible label. Active community uses inverse contrast and a side marker. Add-community action follows the list. |
| Channel navigation | Compact sidebar beside the community rail. Private channels show a lock. |
| Mobile | 58 px community rail, 42 × 44 px buttons. Channels and conversation occupy alternating views. |
| Messages | Author, time, body and thread action use shared tokens. Threads appear alongside the conversation where space allows. |

Use a 4 px spacing scale and the shared 10 px radius token. The rail scrolls independently for long community lists. Community navigation supports Tab, Shift+Tab and Enter or Space. Focus uses a visible 2 px ring. Reduced-motion preferences disable transitions.

Both themes and languages apply to dialogs, account forms, empty states and channel navigation. Enter sends a message and Shift+Enter adds a line.

Keep static interface structure visible while data loads. Skeletons reserve space for communities, channel names, messages and composer content. Background refresh retains existing data. Loading regions have accessible labels and reduced-motion support. Pending forms retain their submit labels.

Backend action buttons use the shared loading spinner with aria-busy and disabled interaction. Labels stay visible. Form submissions, message sending, pagination, retries and sign-out restore the ready state on success or error. Async click handlers automatically receive this feedback.

The message composer uses one line and grows with its contents. Pending messages display immediately. Own delivered messages expose edit and unsend actions with shared pending feedback. Edited text has an edited label. Unsent text is replaced by a placeholder and the thread remains available.

The community rail starts with direct messages. The community heading exposes owner settings. The top-bar avatar opens profile settings; author names open a profile. Profiles and management use shared dialogs, skeleton fields and pending action buttons in both themes and languages. Mobile direct messages alternate between list and conversation.

Signup reserves an @ prefix beside the username input and normalizes typed handles to lowercase. The main composer’s (+) popover provides gallery, camera, files and location, with voice recording beside the textarea and local previews. One-line composition still grows with text. The shared loading state spans metadata reservation, upload and message confirmation; pending media stays optimistic and retryable.

## Typography

Use the global system stack `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`, shared with Tailwind’s sans token. Body text and messages use `1rem` (16 px at the default root size). Navigation items use `0.875rem` (14 px), weight 400 normally and 500 when selected. Form controls retain a minimum of 16 px. Both themes share these tokens; browser zoom and user font preferences remain available.


Audio messages show the player without the stored filename. Stop recording uses inverse primary foreground/background tokens in both themes. Numeric unread badges use shared monochrome tokens and accessible count labels on communities, channels and direct messages. Profile security provides verification status/resend and current/new/confirm password fields, with individual show/hide controls and shared pending/error feedback.


## Settings

Open settings in a Radix dialog with topic tabs. Profile, Security and Appearance share the user dialog; General, Members and Advanced organize community settings. Theme and language live under Appearance. Tabs support arrow keys, Home and End, preserve forms and label their panels. The dialog manages focus, closes with Escape and scrolls internally on mobile and desktop.


## Attachments and reactions

The + button opens a centered Radix dialog bounded by the viewport, with internal scrolling. Reactions appear below each message with counts and selected-state styling; tapping again removes your reaction. The picker offers 👍 ❤️ 😂 😮 😢 🎉.


## Photos and media

Version 0.2.0-beta.14 requires migration 0006. Profile and community settings offer change/remove photo. Images are center-cropped to 512 × 512 and re-encoded locally before upload (1 MB final limit). The Worker checks signatures and size. User photos follow public profile visibility; community photos require member or guest access. New URLs avoid stale caches. Replaced objects become inaccessible; physical cleanup is outside this beta. Decodable JPEG/PNG/WebP/HEIC photos above 300 KB use WebP up to 2048 px when at least 10% smaller; GIF animation is preserved. Videos above 8 MB use the existing local compressor, with original-file fallback when unsupported or not smaller. The final attachment limit is 50 MB.


## Gallery, media readiness and community permissions

Version 0.2.0-beta.15 requires migration 0007. Gallery reads use `/api/channels/:channelId/media`, with 48 items per page and a `(message ID, attachment ID)` cursor, newest first. Only completed attachments linked to non-cancelled messages are returned, including replies; every page checks current channel access. The partial gallery index avoids an unbounded scan of unrelated uploads. Existing private Worker downloads enforce authorization independently.

Media skeletons cover each image, video or audio until its element reports readiness. Cached elements are checked on visibility/page restoration without forcing a reload. Reaction chips wait for every media element in the message; text-only messages can react immediately. A desired-state overlay updates only the current user’s reaction optimistically and rolls back failures while preserving other users. Chip entry/count animations respect reduced motion.

The interface calls teams communities; persisted tables and API URLs retain their names. Owners can assign Member or Moderator, never demote/remove an owner. Moderators may create channels, update accessible community channels and send invitations, but cannot rename/delete communities, change community photos, remove users or assign levels. Direct conversation settings cannot be edited through community routes. Channel settings use General and Access tabs. Access changes include history: switching to private retains explicit channel invitees and grants access to the editor; switching to community access opens history to community members. The form explains this before saving.
