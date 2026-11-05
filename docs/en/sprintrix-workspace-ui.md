# Sprintrix visual reference — layout fidelity

This UI adapts general workspace-dashboard patterns visible in the [Sprintrix public inbox preview](https://shadcn-nextjs-sprintrix-app-template.vercel.app/inbox). The Sprintrix template is commercially licensed, so no proprietary template source code, images, assets or purchased components have been copied.

## Scope
- Existing signed-in shell uses a more compact, neutral shadcn palette and a 256px workspace sidebar.
- "Main" contains real modules with unread counters; "Your communities" lists actual authorized memberships, opens the existing channel system, and keeps the current community highlighted.
- Main navigation contains Messages, Communities and Email; notifications and profile remain available. Discover is removed from navigation and onboarding. Old Discover preferences fall back to Messages.
- Expanded desktop sidebar replaces the duplicate icon rail; collapsed sidebar keeps it. Mobile bottom navigation shares neutral surfaces, separators and selection states. Conversations, channels and emails open in panels with a return to the list.
- Messages and Email use quiet filters, search, a sidebar list and a reading pane. The Public filter in Communities finds communities through the existing join/approval flow.
- [OAuth email](email.md): Gmail and Outlook, inbox/sent, filters, plain-text reading and sending. Private Fastify configuration is required before connecting real accounts.
- Search palette opens with Ctrl/Cmd+K or the header/sidebar search buttons. It navigates to modules and your joined communities only, not to unimplemented server-wide search.
- Account settings and moderation remain functional and conditionally authorized.
- Channel switching, existing cache-first history, SSE, messages, optimistic sends, WebRTC and all authenticated backend routes are unchanged.

## Implemented visual system

- Light gray app canvas, continuous 256 px sidebar and no decorative cards in navigation.
- White inset workspace with an 8 px top/right gutter, subtle border and 16 px corners.
- 52 px header with breadcrumb, dark selected menu items and compact list rows.
- Primary/workspace navigation and expandable joined-community trees containing real channels and unread badges.
- Channel history in the main work surface; its secondary management list is opened explicitly, not permanent when the desktop sidebar is expanded.
- Denser, divider-oriented private conversation list and smaller filters/search.
- Light mode is the default for new installations; previously stored light/dark preferences are retained.
- Native mobile Uorqui/PWA navigation, back controls and keyboard behavior are preserved.

## Preserved application logic

Existing React/Vite, Fastify/Render, Neon, memory-only channel cache, SSE, optimistic sends, notifications, server authorization and WebRTC meetings are unchanged. This is **not a copy of the Sprintrix project-management application** or a replacement of communication with issue tracking.

## Rights

Sprintrix is commercial. Only general visual patterns observable in its public demo are adapted. No proprietary source, assets, fonts or purchased components were copied.

## Validation

Compare desktop at 1440×900, test sidebar and nested channel interactions, management/create flows, permissions, unread counters, command palette, theme switching, mobile PWA/voice and reduced-motion behavior. CI cannot replace visual regression testing on real devices.
