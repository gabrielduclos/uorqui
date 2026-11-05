# Sprintrix visual reference — layout fidelity

Reference: the public [Sprintrix / My Issues](https://shadcn-nextjs-sprintrix-app-template.vercel.app/my-issues) preview, inspected on November 5, 2026 at 1440 × 900. The first Uorqui adaptation changed palette and navigation but not the layout geometry. This pass corrects the visual composition.

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
