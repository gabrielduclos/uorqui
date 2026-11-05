# Shadboard-inspired UI and Stoat-inspired channel UX

This Uorqui interface refactor adapts design and interaction ideas without copying the Shadboard Next.js runtime or the Stoat application. [Shadboard](https://github.com/Qualiora/shadboard) is distributed under the MIT license.

## Scope

- Compact dashboard shell, collapsible sidebar, section grouping, contextual breadcrumb, neutral light/dark palette and tighter lists on desktop.
- Area transitions are directional (190 ms on mobile and 160 ms on desktop); channel history transitions last 175/145 ms. Reduced-motion preferences disable these animations.
- Existing React/Vite/Cloudflare frontend, Render Fastify API, Neon/Drizzle database, server-side authorization and shared SSE remain unchanged.
- Switching a previously visited channel immediately renders the last in-memory message snapshot and silently revalidates via the existing authorized endpoint.
- Community SSE events refresh only the selected channel; overlapping requests coalesce, quick duplicate refreshes are throttled, and matching server messages retain object identity.
- Channel history is grouped by author within five minutes, remembers scroll position per channel, and shows a new-message jump action when the reader is away from the bottom.
- The cache is account-scoped, memory-only, bounded to 24 channels, purged on logout and revoked-access responses. It deliberately does **not** persist sensitive channel messages in IndexedDB.
- Direct-message optimistic sends, SSE delivery/read receipts, media cache, WebRTC calls and persistent mounted communities remain intact.

## Trade-offs and follow-up

- The authorized channel endpoint still returns its latest 100 messages per refresh. This change coalesces requests and reduces rerender churn, but does not add an incremental server cursor or virtualize long histories.
- Navigation does not switch to Next.js or introduce an additional state management framework.
- No new enterprise/workspace/tenant authorization model was introduced by this UI change.

## Regression checklist

1. Sign in, switch between communities and channels, and verify the current server permission is respected.
2. Scroll up in a channel, switch away and back, verify position is restored and a new-message action appears for incoming messages.
3. Check outgoing optimistic messages, media, reactions, editing, and failed-send retry.
4. Keep a voice room open while navigating between modules; verify its connection remains active.
5. Check mobile back navigation, fixed headers, the PWA keyboard, safe-area insets, and both themes.
6. Test unread badges and the last-opened module; invitations and deep links must still override the remembered module.
7. Test reduced-motion settings and a revoked/locked channel.
8. Run `npm run typecheck` and `npm run build` and review GitHub Actions status.
