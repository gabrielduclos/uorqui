# Code and maintenance audit — November 3, 2026

**Scope:** static review of React/TypeScript modules under `apps/web/src`, Fastify services/routes under `apps/api/src`, entrypoints, component imports, and documentation. This is **not** a complete runtime/security certification. No production database, R2 bucket, user data or infrastructure was changed.

## Implemented cleanup

| Area | Evidence and action |
| --- | --- |
| Voice and meeting text | `LiveCommunities` now starts with the text panel **collapsed** for both voice and meeting channels. The expand/collapse action and WebRTC call remain available. |
| Retired feed sharing | `InternalShareDialog` is currently called only by the messenger with `kind: 'message'`. Its unreachable `post` source type, `/?post=` sharing path, and retired-feed-only controls were removed. |
| Historical post links in DMs | `DirectMessageBubble` still recognizes old post URLs for context, but no longer dispatches the unhandled `uorqui:open-feed-post` event or suggests that the retired screen is navigable. It shows an unavailable historical post notice instead. |
| Unreferenced UI modules | `components/ui/sheet.tsx` and `components/ui/tabs.tsx` had no imports among reviewed active modules and were removed. They can be regenerated from shadcn if needed in future. |
| Realtime meetings and approvals | `CommunityVoiceRoom`, `VoicePortalShell`, WebRTC screen sharing, voice activity and account-targeted approval SSE were confirmed as **active paths**, not dead code. |

## Intentionally retained

- **Drizzle migration history:** SQL files, snapshots and journal must remain intact, including feed-era migrations and retirement migration `0029`. Historic schema is not removable source-code debris.
- **Existing DM compatibility:** preserved legacy-link context is not permission to re-enable the retired feed or erase message history.
- **Development entrypoints:** `apps/api/src/auth/auth.cli.ts` is an auth CLI configuration entrypoint, even though the HTTP server does not import it.
- **Backups and media:** no Neon or R2 data deletion was performed; existing recovery copies remain subject to explicit retention decisions.

## Follow-up findings

1. **Historical translations:** `UorquiPreferences.tsx` retains older demo/feed strings. Check every key against all `t(...)` call sites before deleting translations.
2. **Legal text:** `LegalPages.tsx` still references a feed. Updating published terms/policies requires review of their content and acceptance versioning; it was not silently changed.
3. **Old product documentation:** the original feed release notes and historical migrations are legitimate records. Current product pages, roadmap and UI Kit should explicitly distinguish **retired** feed functionality from the active Discover experience.
4. **Real-device tests:** test a meeting with at least two people across devices/networks: camera, mic, speaker focus, screen sharing, fullscreen, and installed PWAs on iOS/Android. `getDisplayMedia` support differs by browser.

## Validation and limitations

- Run `npm run typecheck` and `npm run build` for API/Web.
- Review GitHub Actions **Web UI**, **API checks** and **API auth integration (temporary PostgreSQL)**.
- A green CI check does **not** imply a verified Cloudflare/Render deployment or real media-device coverage.
- Re-review imports and usage before any further removal. Do not infer that production PostgreSQL tables are safe to drop from UI references alone.

Related: [Meetings](video-meetings.md), [Discover](discover.md), and [Architecture](architecture.md).
