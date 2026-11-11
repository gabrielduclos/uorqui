# Uorqui UI Kit · Design System v0.1.0-beta.11

> **Visual contract for the November 6, 2026 beta.** The UI kit is repository documentation, not a separate demo app or public route. The actual production components live in `apps/web/src`.

- **Inline date filtering and header search (beta.44):** channel-day dividers stay directly before their day's first message, scrolling naturally rather than sticking to the viewport. The date pill (Today / Yesterday / Last week etc.) is an interactive, keyboard-accessible dropdown with the existing period choices. A magnifier button in the channel header toggles a search bar immediately underneath; close it from the same button, from the bar, or with Escape. Never render the former permanent filter/search toolbar. Keep search and filters independent; show reset actions on empty results.
- **Channel history and ACL (beta.43):** period selection and search over local-calendar day groups; permission-gated search through PostgreSQL with paging beyond the newest 100; suspend auto-scroll and auto-read during filtering. Use the existing safe `MessageText` renderer for pinned description URLs. The @mention picker uses only current channel-authorized members, and unauthorized handles remain plain text.
- **Inline @mentions (beta.42):** show the compact member suggestions above the channel composer whenever a valid @handle is typed at the start or after whitespace/punctuation within a sentence. Keep keyboard up/down/Enter/Escape support, prevent mouse/pointer selection from dropping focus, and preserve caret and the surrounding message. The display layer hyperlinks case-insensitive handles.
- **Channel ordering (beta.41):** the Moderation → Channels tab has a compact list separated by text, voice and meeting type. Provide grab/drag affordance on desktop plus 32px up/down controls for touch and keyboard, and an explicit Save order action. Reuse the shared border, foreground and background tokens in both themes; changes are shared across members only after saving.
- **User names (beta.39):** outside actual profile screens, use `compactUserName` from `apps/web/src/userDisplayName.ts` to render the **first + last** part of a person's saved display name. Keep full names on profile pages/editors, and keep `@handle`, API payloads and searchable stored names unchanged. Apply this consistently to chats, channel messages/replies/mentions, contacts, notifications, menus, moderation, voice meetings and accessibility labels. Web Push sender/actor strings follow the equivalent formatting in `apps/api/src/push-routes.ts`. One-word names stay unchanged.
- **Meeting link and timer (beta.34):** the **Meeting link** control in `CommunityVoiceRoom` opens a dedicated share dialog with a reusable URL, distinct from the channel membership invitation. Navigation does not authorize access: membership, ACL, password and admission remain enforced. A single countdown appears in the header and floating view (`60:00` initially), highlights the last five minutes and disconnects at zero. The server deadline is not reset by minimization, PWA resuming or late joins.
- **Navigation and restricted rooms (beta.33):** the default desktop text channel anchors to the newest messages automatically. Restricted channel invitation actions are shown only to owners, admins, or moderators with access; one-use 24-hour links grant scoped access after explicit acceptance, can be revoked, and per-handle DM links are bound to the recipient account. Passwords and meeting approval stay independent.
- **API connection state (beta.31):** authentication separates temporary HTTP 429 from service unavailability and avoids indefinite startup loading. The client probes public status, readiness and session in sequence with bounded backoff. The Worker only caches short-lived public probe responses, never authenticated data.
- **Attachments and alerts (beta.30):** the bell uses `UIKitCount` with a unified unread count. Shared `LiveMessageComposer` optimizes Gallery/Camera/pasted photos through `imageCompression.ts` with progress and cancellation; **File**, PNG and GIF uploads keep the original bytes. Optimistic channel messages display the authenticated sender's avatar, name and handle before confirmation. Notification Email entries only appear while unread, and are reconciled with mailbox actions and recent provider scans.
- **Message timestamp rule (beta.29):** today: time only; previous local calendar days: short date plus time; a previous calendar year also includes the year. Use `formatMessageTimestamp` and `useLocalDayKey` (one midnight timer per chat list) across DM bubbles, conversation previews/read receipts and channel messages; update on local midnight or returning to an inactive PWA. Never compare UTC date fragments or force a date on messages from today.
- **Channel chat:** original-message replies, `@username` suggestions, GIFs and per-emoji reactor details, filtered by read permissions.
- **Mobile header/menu surface separation (beta.28):** follow the exact dark-mode layout: the mobile header (`[data-uorqui-main-header]`) uses `--kit-panel` (white in light, `#0a0a0a` in dark), whereas the opened hamburger drawer (`#uorqui-mobile-nav`) uses `--kit-sidebar` (gray `#ededed` in light). Beta.28 reverts the erroneous light-only header override introduced in beta.27; the desktop header and channel reading surfaces remain unchanged.
- **Unified light outer background (beta.26):** the complete signed-in light app background/canvas (`--background`), primary menu desktop/mobile (`--kit-sidebar`) and outer rail (`--workspace-rail`) all use `#ededed`. This extends the beta.25 menu contrast through the rest of the background, including desktop gutters and collapsed sidebar space. Reading panels and channel lists remain `--kit-panel: #ffffff`; dark values are unchanged. Do not alter the global `:root.light` fallback or public/auth screens.
- **Light main-menu contrast (beta.25):** desktop primary sidebar and mobile primary navigation drawer both use `--kit-sidebar` (`#ededed` in light mode, `#181818` in dark). This contrasts against the inset `--kit-panel` (`#ffffff` light). The beta.26 follow-up aligns the entire outer application canvas to the menu; the existing item states remain semantic.
- **Channel-list background (beta.23/24):** the left pane holding text/voice/meeting channel groups and New channel / Moderation uses the inset panel token `--kit-panel` (dark `#0a0a0a`, light `#ffffff`) across breakpoints and **both desktop sidebar states**. Beta.24 removed a higher-specificity `--background` declaration in `styles.css` that masked beta.23 when the sidebar was expanded. The separate primary navigation retains `--kit-sidebar`. The signed-in `sprintrix.css` selector `[data-uorqui-channel-nav]` is the sole color owner; no one-off palette in React/global CSS.
- **Channel history position (beta.22):** entering a text channel or expanding a voice/meeting text panel opens at the most recent message, even with cache-first rendering and later GIF/attachment resize. Automatic layout scroll events cannot disable the opening anchor. Real reader scroll or jumping to a reply permits browsing older messages without snap-back; returning to bottom resumes follow. Isolate positions per channel.
- **Privacy:** irreversible account deletion card in Profile with password and `EXCLUIR` confirmations, errors and delayed media-purge disclosure.
- **Invites:** explicit join confirmation only after authentication, never blocking signup. Modal copy, errors, controls and accessibility labels render in the active locale (browser language initially, then any stored app selection), never bilingual slash-separated lines.

- **Username editing (beta.39):** the @handle may change only once per rolling 15 days after a successful update; onboarding and unchanged resaves do not start or restart the clock. While locked, the profile editor disables only the @username input, displays the next eligible date in the selected locale and handles server rejection with `USERNAME_CHANGE_COOLDOWN` (HTTP 423). Existing full names remain editable.

- **Community/channel sidebar (beta.40):** do not render a separate “Unread messages” summary card above the channel list or in the community directory. Preserve individual channel and community unread badges and the unified notification center; these are the only visible unread entry points in that navigation.

## Principles

- **Channel reply references (beta.9):** a curved/right-turn arrow precedes **Sandra: looks good** in one compact line. Long quotes are ellipsized, with the original reachable by clicking the reference; the composer preview also stays on one line. Sender → original quote → reply content, with jump-to-original. Each channel message always shows avatar, sender details and timestamp, even in consecutive runs.
- **Unified replies (beta.10):** direct messages and channels share the same right-turn arrow, one-line **author: excerpt** reference and click-to-original link, plus one-line dismissible composer previews. Long excerpts ellipsize; legacy DM text-embedded quotes have no target to jump to and remain non-interactive.
- **Private bubble width (beta.10):** reserve 36px for the message `…` actions button plus 6px gap at all times, including while a message is optimistic/pending; prevent horizontal overflow or shifting when the options appear after delivery. Wrapping, media and replies honor the available width.
- **GIF cards (beta.11):** show the animated GIF inline in private messages without a second link-preview card or metadata request; keep rich previews for ordinary links.


- **Notification center:** compact scrollable **All, Messages, Mentions, Email, Invites, Contacts** tabs, category counts, relevant empty states and internal navigation. Browser push and in-app history are independent. OS notification clicks navigate an already-open React app directly; closed/background PWAs retain URL deep links. Email unread badges honor provider Inbox counts and ignore stale read-after-refresh races.
- **Single active instance (beta.18–21):** one desktop tab and one mobile/PWA window per account. A competing tab displays a centered, theme-aware blocking screen rather than mounting the workspace, with **Use this tab** for explicit takeover, **Try again** on network errors and **Sign out**. Status copy is localized; ownership changes do not revoke authentication or affect the other device category. During initial authenticated startup (and explicit takeover), checking stays behind the original loading splash; only conflicts and errors render the blocker. Browser/PWA identity persists per account/category across reload/reopen; Web Locks keep a second live document blocked. On reload, the startup splash masks a short, bounded retry while the old page releases its lock.


- **Desktop permission prompts:** offer the daily push opt-in only when browser permission is undecided (`default`), never when granted or denied regardless of subscription sync state. The optional PWA install reminder remains independent; never stack prompts or request native permission without a click. Preserve mobile-specific installation rules.


- Email configuration provides Gmail OAuth, Outlook OAuth and manual IMAP/SMTP in one scrollable modal. OAuth options reflect per-provider configuration; the Outlook action remains disabled until Microsoft Entra credentials are present in Render.

- Compact, communication-first interface influenced by workspace dashboards, without positioning Uorqui as exclusively enterprise software.
- Primary areas: **Discover · Messages · Communities · Email**; Contacts are reached **from Messages**, not from a separate main-menu entry.
- Community rail and desktop sidebar, responsive navigation and fixed mobile headers. **Discover** uses a compass icon rather than Search in the community rail. Channel headers show Invite and, for owners/admins, Edit; Edit opens Moderation → Channels at the current channel. Pinned channel rules expand using Read more / Show less and stay editable in Moderation. Scroll content, not the entire workspace.
- Dark/Light share the same structure; touch controls and dialogs must respect viewport, iOS safe areas, keyboards, Escape and accessibility.
- Brazilian Portuguese/English, Lucide iconography, consistent primitives and no page-specific theme palettes.

## Theme hierarchy — source of truth

1. `apps/web/src/styles.css`: **global** semantic fallback tokens, resets, motion and shared surfaces, with **one** `:root` / `:root.light` pair.
2. `apps/web/src/ui-kit/sprintrix.css`: intentional **signed-in workspace overrides** under `[data-uorqui-ui-kit="sprintrix-v1"]`. These are the effective colors in the logged-in app.
3. `apps/web/src/components/ui/` and `ui-kit/components.tsx`: shared buttons, fields, menus, skeletons, counters and layout.
4. Module components consume `bg-card`, `bg-background`, `text-foreground`, `border-border`, etc., rather than defining their own palettes.

**Dark** is the default for first-time visitors without a saved preference, per `UorquiPreferences.tsx`. Existing user preference at `uorqui:theme` is honored; changing theme requires no reload. The contextual onboarding guide measures its content, places itself above/below mobile navigation highlights and scrolls inside short viewports. **Contacts, Messages and Email** share `data-uorqui-workspace-surface`. An incoming email's HTML is isolated and may use its sender's own styling without changing the app theme.

### Actual signed-in workspace palette

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--background` | `#181818` | `#fafafa` | Canvas/navigation |
| `--foreground` | `#fafafa` | `#171717` | Primary text |
| `--card` | `#0a0a0a` | `#ffffff` | Content panels |
| `--popover` | `#111111` | `#ffffff` | Menus |
| `--primary` | `#e5e5e5` | `#171717` | Selection/primary action |
| `--secondary` | `#171717` | `#f5f5f5` | Secondary surface |
| `--muted` | `#171717` | `#f7f7f7` | Neutral surface |
| `--muted-foreground` | `#a3a3a3` | `#777777` | Metadata |
| `--accent` | `#242424` | `#f1f1f1` | Hover |
| `--border` | `rgba(255,255,255,.10)` | `#e5e5e5` | Dividers |
| `--input` | `rgba(255,255,255,.16)` | `#d4d4d4` | Inputs |
| `--ring` | `#b6b6b6` | `#7c7c7c` | Focus indicator |
| `--destructive` | `#fa646e` | `#d7384c` | Dangerous actions; global fallback |
| `--workspace-rail` | `#181818` | `#fafafa` | Community rail |

**Never hardcode the table's colors in module components.** Consume the semantic token. Channels and private conversations share `uorqui-reply-reference` and `uorqui-reply-draft` for compact replies and composer previews. The private-message width reserve is `uorqui-dm-message-content`. All use global semantic colors. Bubbles remain compact and gently rounded.

## Components and interaction contracts

| Component / area | Contract |
| --- | --- |
| `SocialShell`, `UIKitSectionHeading` | Responsive navigation and headings; single source of truth for active area |
| `LiveDirectChat`, `DirectMessageBubble` | Persisted 1:1 messages, SSE, delivery/read status and times, optimistic replies, pins, actions and viewport-safe menus |
| `LiveMessageComposer` | **+ attachments · Gallery photos/videos · growing input · emoji · mic/send**; optional wake lock during voice recording and local video compression, with progress/cancel/before-after sizes and 50 MB final cap; keep mobile keyboard stable |
| `ConversationAttachmentsPanel`, `ChatMediaViewer`, `ChatAudioPlayer` | Paginated history of images/videos/audio/files; zoom, download, responsive previews |
| `LiveCommunities`, `CommunityVoiceRoom` | Text, voice and meeting channels; realtime messages, membership, moderation, invitations and room text |
| `CommunityModerationPanel` | Visible delete confirmation in the channel card and outside the scrollable section |
| `EmailInbox` | Gmail OAuth and manual IMAP/SMTP, folders and actions; isolated HTML, external browser links, skeleton until layout/images are ready |
| `WorkspaceContentLoading` | Skeletons for incomplete content without flicker or layout shifts |

**Text** messages are optimistic without an individual bubble spinner; visible upload progress is reserved mainly for **media**. Attachments never create horizontal scrolling during load. Private in-memory media cache is reused on channel re-entry, invalidated on deletion/access revocation and cleared at logout. Incoming email HTML cannot run scripts or submit forms.

## Architecture and code organization

- Shared same-origin HTTP client: `apps/web/src/lib/apiClient.ts`, retaining existing direct/community error semantics.
- Feature-level state and realtime: `dmCache.ts`, `dmEventStream.ts`, `communityMessageCache.ts`, `chatMediaCache.ts`. Do not create duplicate SSE clients or caches.
- Node/Fastify API in `apps/api/src`, enforcing permissions server-side; Drizzle migrations own schema history. Exact-match write origin validation is centralized in `request-origin.ts`.
- This kit is not a second interface: production React components are the only implementation.

## Identity, languages and quality

The `UorquiWordmark` uses a 43 × 7 pixel **uorqui.** wordmark and mint `#69d2aa` dot; the PWA icons and favicon remain in the public assets. Do not add external brand fonts. PT/EN preferences come from `UorquiPreferences`; user-authored content is not translated and the document `lang` is maintained.

Before merging, check **mobile/desktop × Dark/Light × PT/EN**, keyboard focus, loading, long content, permission boundaries, media playback and installed-PWA behavior. Native app icon badges depend on platform support.

## Version and maintenance

This document captures **`v0.1.0-beta.9`**. From this baseline, **every PR, even CSS-only or documentation-only, must increase the version in all three npm manifests**, update both changelogs and pass the automatic `Version policy` workflow. Releases use immutable `v...` tags. See [release policy](versions.md), [changelog](../../CHANGELOG.md) and [contributing](../../CONTRIBUTING.md).
