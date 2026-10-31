# Uorqui frontend — implementation standard and initial release

## Goal

Simple, functional frontend with **Stoat-like community/channel organization** and **WeChat-like straightforward 1:1 messaging**. These are interaction references, not cloned branding or code.

## UI system

- Prefer **official shadcn/ui (New York / Radix)** components for every reusable primitive; create project-specific components only when the catalog has no matching ready-made element.
- Use **Tailwind CSS v4** and existing semantic indigo theme tokens in `src/styles.css`. Keep theme compatible with future tweakcn adjustments.
- Use **Motion** for short transitions, with reduced-motion support.
- Components: `apps/web/src/components/ui/`; shadcn registry configuration: `apps/web/components.json`.
- Sticky headers, mobile bottom navigation, iOS safe areas, accessible focus, minimum 16px input text, localized skeletons and per-action backend spinners.

## Implemented views

- Anonymous: signup-first welcome, login, verification/resend, password recovery and onboarding (existing Better Auth backend).
- Signed in: responsive app navigation — Feed, Conversations, Communities and Profile.
- Conversations: searchable **demo** DM list, WeChat-like individual bubbles and local-only message composer.
- Communities: example server rail, Stoat-like text/voice channel navigation, example message threads. Communities are not group DMs.
- Feed: truthful empty state until posts backend is ready.
- Profile: real session data and authenticated logout.

## Important limitations

There are no real social APIs for direct messages, channels, posts or voice yet. All example chat data, communities and channels are explicitly labeled **preview/demo only** and are not persisted. Do not treat demo content as real user data. Only account auth, onboarding, profile and logout are connected to the backend.

## Next milestones

1. Backend contracts for secure and persistent 1:1 messages.
2. Real communities, membership, roles, text/voice channels and server-side privacy/moderation.
3. Hybrid feed plus separate immersive video mode.
4. Real visual and interaction QA on mobile browsers/PWA and desktop.

## Quality gates

`.github/workflows/web-ui.yml` runs TypeScript, Vite build and Wrangler dry-run. Cloudflare Builds publishes Worker `main`; validate the deployed SHA and real devices separately. Never modify the legacy `uorqui.app` or `uorqui-chat` Worker.
