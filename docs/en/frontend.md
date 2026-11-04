# Uorqui frontend — standards and navigation direction

[English](frontend.md) · [Português](../pt-BR/frontend.md)

## Document status

The technical beta now includes **real 1:1 messaging, Discover, communities, voice rooms and video meetings**. The global post feed was retired November 2, 2026. The active direction is detailed in [Discover](discover.md); a code [maintenance audit](maintenance-audit.md) was completed November 3. Deployment and device-level testing require separate verification.

## Goal

Build a mobile-first interface for **discovering communities, participating in text/voice rooms and having one-to-one conversations**. Familiar patterns can inform chat and channel organization, but Uorqui owns its design, implementation and language.

## Navigation implemented in code (new direction)

- **Discover (home):** real channel and voice-room activity from joined communities, search and recommended public communities. No post feed, endless scrolling, “For you/Following” filter or vertical short-video mode.
- **Messages:** private 1:1 chats, history, media, reactions, and delivery/read states.
- **Communities:** joined spaces, text channels, voice rooms, video meetings, per-channel passwords and moderation. Voice/meeting text starts collapsed, with an accessible expand control.
- **Profile, notifications and settings:** remain accessible without requiring dedicated primary tabs. Profile privacy remains independent from community membership.

Discover shortcuts navigate to the correct community/channel without joining a voice call automatically or prematurely marking messages read. New users without memberships see search, public recommendations and honest empty states. The API grounds all counts and enforces access controls.

## Resume the last visited module

- Once authenticated, reopen the last main module visited by the same account **on this browser/device**: Communities, Messages, Discover, Notifications, Profile, or Moderation (only when authorized).
- The preference uses account-ID-scoped `localStorage`; on a new device or when storage is unavailable, Communities remains the default. No database migration or cross-device syncing is needed.
- Explicit deep links to messages, notifications and communities, invitation links and push destinations **override** the stored selection. Unauthorized moderation falls back to Communities.
- Automatic onboarding steps do not overwrite the last selected module; the initial tour may still finish on Communities.

## UI system

- Prefer reusable **shadcn/ui (New York/Radix)** components and semantic **Tailwind CSS v4** tokens in `apps/web/src/styles.css`.
- Use **Motion** for brief transitions; respect `prefers-reduced-motion`.
- Shared components are in `apps/web/src/components/ui/`; the [UI Kit](ui-kit.md) is **documentation only**.
- Fixed headers, keyboard-safe mobile navigation and iOS safe areas, accessible focus/tap controls, PT/EN localization and Light/Dark themes.
- Skeletons for initial loads and per-action spinners for backend work. Background refresh must preserve visible content.
- Do not simulate presence, counts, badges or recommended communities as real data.

## Migration status and next validation

1. **Completed:** replace the global feed with Discover and update navigation, internal links and onboarding.
2. **Completed:** reuse authorized community activity, SSE notifications and account-targeted approval events. Always enforce authorization on the server.
3. **Completed in the November 3 audit:** remove unreachable feed-sharing controls and replace broken legacy post navigation with a historical-content notice.
4. **Retained:** historical Drizzle migrations and recovery media; do not delete production data based on unused UI code.
5. **Pending:** verify desktop, iPhone Safari/PWA, Android/PWA, Light/Dark and PT/EN, including WebRTC screen capture and fullscreen meeting layout.

## Quality gates and isolation

`.github/workflows/web-ui.yml` verifies TypeScript, Vite and Wrangler configuration; Cloudflare Builds owns deployment. Green CI does not prove a deployed build or real-device acceptance. Do not modify legacy `uorqui-chat` Worker or its databases.
