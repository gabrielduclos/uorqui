# Sprintrix-inspired workspace navigation

This UI adapts general workspace-dashboard patterns visible in the [Sprintrix public inbox preview](https://shadcn-nextjs-sprintrix-app-template.vercel.app/inbox). The Sprintrix template is commercially licensed, so no proprietary template source code, images, assets or purchased components have been copied.

## Scope
- Existing signed-in shell uses a more compact, neutral shadcn palette and a 240px workspace sidebar.
- "Main" contains real modules with unread counters; "Your communities" lists actual authorized memberships, opens the existing channel system, and keeps the current community highlighted.
- Main navigation contains Messages, Communities and Email; notifications and profile remain available. Discover is removed from navigation and onboarding. Old Discover preferences fall back to Messages.
- Expanded desktop sidebar replaces the duplicate icon rail; collapsed sidebar keeps it. Mobile bottom navigation shares neutral surfaces, separators and selection states. Conversations, channels and emails open in panels with a return to the list.
- Messages and Email use quiet filters, search, a sidebar list and a reading pane. The Public filter in Communities finds communities through the existing join/approval flow.
- [OAuth email](email.md): Gmail and Outlook, inbox/sent, filters, plain-text reading and sending. Private Fastify configuration is required before connecting real accounts.
- Search palette opens with Ctrl/Cmd+K or the header/sidebar search buttons. It navigates to modules and your joined communities only, not to unimplemented server-wide search.
- Account settings and moderation remain functional and conditionally authorized.
- Channel switching, existing cache-first history, SSE, messages, optimistic sends, WebRTC and all authenticated backend routes are unchanged.

## Check
1. Validate workspace shortcuts with zero, one and multiple joined communities; add/remove membership and confirm list refresh.
2. Test command palette with keyboard, mouse, Portuguese and English, including reduced-motion users.
3. Verify collapsed/expanded desktop rail logic, deep-link invitations, unread badges and profile/navigation behavior.
4. Verify mobile PWA navigation, keyboard, voice continuity and safe-area heights.
5. Run frontend typecheck/build and API integration tests before production deployment.
