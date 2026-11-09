# Sprintrix visual reference — layout fidelity

This UI adapts general workspace-dashboard patterns visible in the [Sprintrix public inbox preview](https://shadcn-nextjs-sprintrix-app-template.vercel.app/inbox). The Sprintrix template is commercially licensed, so no proprietary template source code, images, assets or purchased components have been copied.

## Scope
- Existing signed-in shell uses a more compact, neutral shadcn palette and a 256px workspace sidebar.
- Main and mobile navigation contain Messages, Email and notifications; profile remains available. Communities are accessed through a separate Stoat-style column of server icons, with unread badges, creation and public browsing controls. Discover remains removed.
- Selecting a server opens its channel list independently of the general menu. The icon column stays reachable from other modules and hides on mobile while reading a conversation, channel or email; back controls restore it.
- Messages and Email use quiet filters, search, a sidebar list and a reading pane. The Public filter in Communities finds communities through the existing join/approval flow.
- [OAuth email](email.md): Gmail and Outlook, inbox/sent, filters, plain-text reading and sending. Private Fastify configuration is required before connecting real accounts.
- Search palette opens with Ctrl/Cmd+K or the header/sidebar search buttons. It navigates to modules and your joined communities only, not to unimplemented server-wide search.
- Account settings and moderation remain functional and conditionally authorized.
- Channel switching, existing cache-first history, SSE, messages, optimistic sends, WebRTC and all authenticated backend routes are unchanged.

## Implemented visual system

- Light gray app canvas, continuous 256 px sidebar and no decorative cards in navigation.
- White inset workspace with an 8 px top/right gutter, subtle border and 16 px corners.
- 52 px header with breadcrumb, dark selected menu items and compact list rows.
- Primary/workspace navigation stays separate from the Stoat-style server column and existing text, voice and meeting channels.
- Channel history sits beside the channel list. Collapsing the general menu hides it completely and expands the content, matching the reference; switching modules preserves that choice and the server column remains independent.
- **Beta.25 light-menu contrast:** the primary desktop and mobile menu background uses the shared `--kit-sidebar` token (`#ededed` in light mode); the content panel and channel list remain white, and dark mode colors are unchanged.
- **Beta.23 surface alignment:** channel groups and their management actions share the inset content panel background (`--kit-panel`) instead of the outer workspace canvas (`--background`); the primary app menu retains its separate sidebar surface in dark and light modes.
- Notifications live in Administration for every account; Moderation remains permission-gated.
- Neutral base palette: gray canvas, white work surface, black selection and a slightly darker server column in light mode; neutral dark surfaces with light selection in dark mode, including mobile.
- Denser, divider-oriented private conversation list and smaller filters/search.
- Light mode is the default for new installations; previously stored light/dark preferences are retained.
- Native mobile Uorqui/PWA navigation, back controls and keyboard behavior are preserved.

## Preserved application logic

Existing React/Vite, Fastify/Render, Neon, memory-only channel cache, SSE, optimistic sends, notifications, server authorization and WebRTC meetings are unchanged. This is **not a copy of the Sprintrix project-management application** or a replacement of communication with issue tracking.

## Rights

Sprintrix is commercial. Only general visual patterns observable in its public demo are adapted. No proprietary source, assets, fonts or purchased components were copied.

## Validation

Compare desktop at 1440×900, test sidebar and nested channel interactions, management/create flows, permissions, unread counters, command palette, theme switching, mobile PWA/voice and reduced-motion behavior. CI cannot replace visual regression testing on real devices.
