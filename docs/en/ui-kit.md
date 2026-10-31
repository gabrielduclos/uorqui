# Uorqui UI Kit · Design System v0.1

> Documentation only. The UI kit is **not** a public route or a page inside the application.

## Purpose

The shared visual foundation for Uorqui's direct messaging, social feed, and communities. It supports desktop and mobile, semantic theming, accessible interactions, and Brazilian Portuguese / English localization.

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
- Cards can be softly rounded; **chat message bubbles are square-cornered**.
- Messages and channels use the available desktop width instead of a narrow centered container.
- Overlays and context menus must remain within the viewport; support mobile keyboards and Escape.

## Shared components

| Component | Purpose |
| --- | --- |
| Button, Input, Label | Accessible actions and forms |
| Card, Badge, Separator, ScrollArea | Surfaces and structure |
| Avatar | Identity and fallback initials |
| PreferencesControls | Theme and language header switchers |
| DemoMessageComposer | Expandable input, horizontal + attachments, right-side emoji, shared mic/send button |
| DemoChatBubble | Rectangular message, reply, reactions, clipped-safe context menu over blurred conversation |
| DemoAudioPlayer, DemoMediaViewer | Audio and shared image/video viewer |
| DemoImageEditor | Draw and mark up images before sending and in the viewer |

The one-to-one messenger **is connected** to the API and Neon. Community channels still use local previews. The live chat must retain this UI Kit; unimplemented backend actions must never simulate persistence.

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
- apps/web/src/Demo*.tsx — messaging examples

When changing UI, review dark/light × Portuguese/English × desktop/mobile, update this document and ensure keyboard and assistive technology support.

## Required contract for the live messenger

- `LiveDirectChat` handles inbox, fixed conversation header, scroll, messages, and realtime updates. The message surface fills available desktop width and only the message panel scrolls.
- `DirectMessageBubble` has **square corners** (`rounded-none`), semantic palette, swipe-to-reply and a viewport-safe context menu with blur restricted to the conversation.
- `LiveMessageComposer` preserves **+ attachments | expanding text | emoji | shared mic/send** with a horizontal attachment menu and right-side emoji picker.
- Text messages persist through the API and appear instantly with an in-bubble spinner, retrying with the same client ID on failure while leaving the composer available. Timestamp and textual Sending/Sent/Received/Read statuses flow inline after the message. The composer has distinct semantic border/background contrast in Light/Dark. No “Live” badge appears, while realtime sync remains enabled. Audio, attachments and structured reply references still need dedicated endpoints; unsupported actions remain visibly disabled, not simulated locally. Editing, deleting for both participants, forwarding and reactions have authenticated, persistent endpoints.
- Browsing the inbox **must never mark a conversation read**; only an opened, visible conversation with a focused browser window may acknowledge messages.
- Start at the latest message, preserve position while reading older ones, and show a down arrow and incoming-message notice instead of forcing scroll.
- Validate desktop/mobile, Dark/Light, and Portuguese/English before merging. Backend migrations must reuse these UI components rather than introducing generic replacements.
