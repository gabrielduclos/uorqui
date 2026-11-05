# Sprintrix-inspired workspace navigation

This UI adapts general workspace-dashboard patterns visible in the [Sprintrix public preview](https://shadcn-nextjs-sprintrix-app-template.vercel.app/my-issues). The Sprintrix template is commercially licensed, so no proprietary template source code, images, assets or purchased components have been copied.

## Scope
- Existing signed-in shell uses a more compact, neutral shadcn palette and a 240px workspace sidebar.
- "Main" contains real modules with unread counters; "Your communities" lists actual authorized memberships, opens the existing channel system, and keeps the current community highlighted.
- Expanded desktop sidebar replaces the duplicate community icon rail; collapsed sidebar keeps that rail for switching communities. Mobile retains its previous navigation and channel rail.
- Search palette opens with Ctrl/Cmd+K or the header/sidebar search buttons. It navigates to modules and your joined communities only, not to unimplemented server-wide search.
- Account settings and moderation remain functional and conditionally authorized.
- Channel switching, existing cache-first history, SSE, messages, optimistic sends, WebRTC and all authenticated backend routes are unchanged.

## Check
1. Validate workspace shortcuts with zero, one and multiple joined communities; add/remove membership and confirm list refresh.
2. Test command palette with keyboard, mouse, Portuguese and English, including reduced-motion users.
3. Verify collapsed/expanded desktop rail logic, deep-link invitations, unread badges and profile/navigation behavior.
4. Verify mobile PWA navigation, keyboard, voice continuity and safe-area heights.
5. Run frontend typecheck/build and API integration tests before production deployment.
