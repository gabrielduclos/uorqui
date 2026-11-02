# Uorqui frontend — standards and navigation direction

[English](frontend.md) · [Português](../pt-BR/frontend.md)

## Document status

The technical beta already includes **real direct messaging, real communities, a legacy hybrid post feed and voice rooms**. Early documentation about demo-only screens no longer reflects the current application. The direction approved **November 2, 2026**, detailed in [Discover](discover.md), **has an initial implementation in the frontend on `main`, pending production verification**.

## Goal

Build a mobile-first interface for **discovering communities, participating in text/voice rooms and having one-to-one conversations**. Familiar patterns can inform chat and channel organization, but Uorqui owns its design, implementation and language.

## Navigation implemented in code (new direction)

- **Discover (home):** real channel and voice-room activity from joined communities, search and recommended public communities. No post feed, endless scrolling, “For you/Following” filter or vertical short-video mode.
- **Messages:** private 1:1 chats, history, media, reactions, and delivery/read states.
- **Communities:** joined spaces, text channels, voice rooms, administration and moderation.
- **Profile, notifications and settings:** remain accessible without requiring dedicated primary tabs. Profile privacy remains independent from community membership.

Discover shortcuts navigate to the correct community/channel without joining a voice call automatically or prematurely marking messages read. New users without memberships see search, public recommendations and honest empty states. The API grounds all counts and enforces access controls.

## UI system

- Prefer reusable **shadcn/ui (New York/Radix)** components and semantic **Tailwind CSS v4** tokens in `apps/web/src/styles.css`.
- Use **Motion** for brief transitions; respect `prefers-reduced-motion`.
- Shared components are in `apps/web/src/components/ui/`; the [UI Kit](ui-kit.md) is **documentation only**.
- Fixed headers, keyboard-safe mobile navigation and iOS safe areas, accessible focus/tap controls, PT/EN localization and Light/Dark themes.
- Skeletons for initial loads and per-action spinners for backend work. Background refresh must preserve visible content.
- Do not simulate presence, counts, badges or recommended communities as real data.

## Migration of the existing frontend

1. Build Discover and update navigation, internal links and onboarding to **Discover · Messages · Communities**.
2. Reuse authenticated community/voice APIs and events for activity; design extra endpoints only when necessary and enforce server-side authorization.
3. Audit feed dependencies in profiles, notifications, routing, sharing and old post deep links.
4. Retire global post feed and immersive video access only after migration, **without deleting data** or breaking message/channel media sharing.
5. Verify desktop, iPhone Safari/PWA, Android/PWA, Light/Dark and PT/EN.

## Quality gates and isolation

`.github/workflows/web-ui.yml` verifies TypeScript, Vite and Wrangler configuration; Cloudflare Builds owns deployment. Green CI does not prove a deployed build or real-device acceptance. Do not modify legacy `uorqui-chat` Worker or its databases.
