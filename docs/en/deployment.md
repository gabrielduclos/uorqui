# Deployment

[Português (Brasil)](../pt-BR/deployment.md) · [README](../../README.md)

## Render and Neon

Create a separate Render web service for Workplace. Watch the Workplace branch and keep the service root at the repository root. Use Node.js 22 or newer.

| Setting | Value |
| --- | --- |
| Build | `npm ci && npm run build -w @uorqui/workplace-api` |
| Migration | `npm run db:migrate -w @uorqui/workplace-api` |
| Start | `npm run start -w @uorqui/workplace-api` |
| Health check | `/health/ready` |

Use private Render environment variables for `DATABASE_URL` and `AUTH_SECRET`. Set `WEB_ORIGIN` to the exact HTTPS origin of the Workplace Worker.

Validate the migration in an isolated Neon development branch on database `workplace`. The migration uses the `uorqui_workplace` and `uorqui_workplace_migrations` schemas. Run it as a pre-deploy command or a one-off operation before starting the service. The migration role needs to be able to create the schemas. Provision the first account via the CLI after the migration.

## Cloudflare Workers Builds

Use the existing Worker `main` and its native preview for `feat/enterprise-channels`, with root directory `apps/web`, build command `npm run build` and preview command `npx wrangler preview`. Set `previews.vars.API_ORIGIN` to the HTTPS Render service origin. The Worker serves the Vite build and forwards `/api/*` from the same origin as the UI, including authentication cookies.

The preview is available at https://feat-enterprise-channels-main.uorqui1.workers.dev/. Preserve the production deployment. The Render service is `uorqui-workplace-api`, retaining its original `uorqui-workplace-preview-api.onrender.com` hostname.

## Beta scope

Accounts can be created from the sign-in screen with a name, unique @username, email and password of 8–128 characters. New accounts start with an empty community list and can create a community or accept an invitation. The app generates email-bound, 48-hour links for owners to send manually. Email verification and password changes are available in profile settings. Forgotten-password recovery and automatic invitation emails remain outside this beta. Open community and direct conversations receive SSE invalidations in real time.


## Caching

The tab-local cache retains at most 100 entries for five minutes. Fresh communities and channel lists are reused for 60 seconds, messages for eight seconds and older history pages for five minutes. Concurrent identical reads share one request. Cancelling one view does not cancel another view's request. Authentication changes clear the cache, and tab events invalidate other tabs after writes. Private responses retain HTTP no-store.

Open conversations use one authenticated SSE stream per channel, shared by its conversation and thread. Events invalidate cached message pages; reads still check permissions. Connected streams suppress message polling. A thirty-second polling fallback runs while SSE is disconnected. Hidden views close their streams and pause polling, then refresh on return. Channel and direct-conversation lists retain their sixty-second refresh. Successful writes invalidate affected data immediately.

The API has a process-local message cache with a five-second lifetime and a maximum of 100 pages. Every request checks its session and channel permissions before using it. Successful message writes invalidate all pages for that channel on the serving instance. Other instances expire their entries within five seconds. Restarts discard the cache.

Hashed JavaScript and CSS assets use a one-year immutable browser cache. Entry HTML and private API data retain their separate policies.

The composer starts at one line and grows to 160 px. Sends appear immediately with pending or retry feedback. Pending and failed sends survive navigation in tab memory and are cleared at authentication changes. Authors can edit sent messages or confirm unsending. Unsent text is cleared and replaced by a translated placeholder, preserving thread replies. Retrying a send uses the same client ID to avoid duplicate messages. Apply migration 0001 before deploying this API version. Existing messages with no client ID remain compatible.


## Communities, direct messages and profiles

Apply migration 0002 before starting this version. It adds `profile`, `direct_conversation`, nullable `channel.team_id` and `team.deleted_at`. Communities still own their normal channels; direct channels have no community and are unique per ordered participant pair.

Community owners can rename a community and remove members or private-channel guests. Removal also revokes their existing invitations for that community. Owners cannot remove themselves. Deletion requires the current community name, records a deletion timestamp and denies community/channel access and invitations. Stored community data is retained; this is logical deletion. Direct conversations remain independent of community membership.

The profile button edits name, unique handle and biography. Handles use 3–24 lowercase letters, digits or underscores; biographies allow 500 characters. Saving a handle publishes name, handle and biography at `/#profile=handle`, readable without signing in. Email is excluded. A signed-in visitor can start a direct conversation from a profile, a message author or the direct-message list. Direct messages reuse channel authorization and message semantics.


## Realtime and private attachments

Apply migration 0003 before starting this version. It adds unique `user.handle`, copies existing profile handles, adds structured message locations and the attachment metadata table. Signup now requires `handle`; authentication stores it with the new user. The provisioning CLI takes email, display name and handle as arguments. Existing accounts without a handle can choose one in their profile.

Set `REALTIME_DATABASE_URL` on Render to a direct, unpooled URL for the same Neon database and role. The listener uses one dedicated connection while SSE clients are connected and closes it when the last client leaves. Message writes publish PostgreSQL invalidations for other API instances. Streams send a heartbeat every twenty seconds, recheck channel permissions and session validity on updates and at least once per minute, and close on expiry or access loss. Reconnect refreshes all loaded message pages. During a database listener outage, local delivery and periodic catch-up remain available.

The preview binds `FILES` to the private R2 bucket `uorqui-workplace-files` in `previews.r2_buckets`. Set the same independently generated `FILES_SECRET` on Render and the existing Worker preview. Use `wrangler preview secret put FILES_SECRET --name feat/enterprise-channels` when configuring this manually. Preserve production bindings and deployment.

The (+) composer is ported from `main`, including image editing and local media compression. It supports up to ten gallery photos, camera capture, images, video, voice recording, PDF/text/ZIP/Office files, emoji and a structured current location. Each attachment is limited to 50 MB after optional compression; gallery videos up to 300 MB can be processed locally. Browser permissions and codec support apply. There is no GIF-provider gallery integration in this release; GIF files can be attached.

Uploads first reserve metadata through the API. The Worker authorizes the request, streams exact-length bytes into R2 and marks the upload ready through an authenticated internal endpoint. Only the author can upload a reserved file. Publishing the message binds its ready files in a transaction. Downloads require conversation access and a delivered, uncancelled message; they support byte ranges for media. Cancelling a message denies later downloads of its attachments. Files remain stored. Unpublished upload bytes are retained, with pending upload authorization limited to 24 hours; automatic orphan cleanup is outside this release. Media responses use private no-store, with safe download headers. The bucket has no public delivery URL.

File operations require the Worker and its R2 binding; the default Vite-to-API development proxy alone does not provide file storage. The end-to-end media check used a local Worker/R2 runtime and PostgreSQL 17, including notifications between two API instances, alongside the PGlite regression suite.

References: [Neon connection pooling](https://neon.com/docs/connect/connection-pooling), [Preview configuration](https://developers.cloudflare.com/workers/previews/configuration/) and [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).


## Account security and unread messages

Apply migration 0004 before this version. It adds a per-user/channel read cursor and a message channel/cursor index. `/health/ready` checks the table and reports `emailConfigured` without revealing credentials.

Set `RESEND_API_KEY` and `AUTH_EMAIL_FROM` in the API service environment. Use a sender/domain verified with Resend. Signup sends a one-hour verification link when configured; existing users can request another in profile settings. The server fixes the verification return origin and displays success or an expired/invalid link result. Delivery errors are shown without claiming success. Missing email configuration does not block existing accounts or password changes. An accepted Resend request does not guarantee inbox delivery. Verification currently records the verified state; it does not gate signing in.

Password changes require the current password and 8–128 characters for the new password. The server rotates the current session cookie, revokes all previous sessions and never returns the session token to application JavaScript. The form confirms the new password and clears password fields after success. Recovery without the current password is not implemented.

Unread counts include uncancelled messages from other authors, including thread replies, only in channels the user can currently access. Read cursors advance monotonically to the snapshot returned with a rendered message page. Viewing the latest messages acknowledges channel activity, including its threads. A conversation must be visible, focused and at the bottom to acknowledge that snapshot. Hidden mobile conversations and background tabs do not acknowledge messages. Explicit snapshot cursors prevent concurrent arrivals from being marked read accidentally.

A separate authenticated inbox SSE stream invalidates unread counts and direct-conversation lists for accessible channels, including closed conversations. It closes while hidden, catches up on reconnect, checks session validity on events and once per minute, and falls back to thirty-second polling while disconnected. Unread queries share the tab cache with an eight-second freshness window and the existing authentication isolation. Acknowledgements publish an invalidation for other devices. No message body or private channel identifiers are sent on the inbox stream.


## Reactions

Version 0.2.0-beta.13 requires migration 0005. Reactions are unique per message, user and emoji; the authenticated endpoint accepts the desired state for idempotent retries. Channel access is checked before reading or modifying reactions. Changes invalidate the cache and publish SSE. Cancelled messages neither display nor accept reactions.


## Photos and media

Version 0.2.0-beta.14 requires migration 0006. Profile and community settings offer change/remove photo. Images are center-cropped to 512 × 512 and re-encoded locally before upload (1 MB final limit). The Worker checks signatures and size. User photos follow public profile visibility; community photos require member or guest access. New URLs avoid stale caches. Replaced objects become inaccessible; physical cleanup is outside this beta. Decodable JPEG/PNG/WebP/HEIC photos above 300 KB use WebP up to 2048 px when at least 10% smaller; GIF animation is preserved. Videos above 8 MB use the existing local compressor, with original-file fallback when unsupported or not smaller. The final attachment limit is 50 MB.


## Gallery, media readiness and community permissions

Version 0.2.0-beta.15 requires migration 0007. Gallery reads use `/api/channels/:channelId/media`, with 48 items per page and a `(message ID, attachment ID)` cursor, newest first. Only completed attachments linked to non-cancelled messages are returned, including replies; every page checks current channel access. The partial gallery index avoids an unbounded scan of unrelated uploads. Existing private Worker downloads enforce authorization independently.

Media skeletons cover each image, video or audio until its element reports readiness. Cached elements are checked on visibility/page restoration without forcing a reload. Reaction chips wait for every media element in the message; text-only messages can react immediately. A desired-state overlay updates only the current user’s reaction optimistically and rolls back failures while preserving other users. Chip entry/count animations respect reduced motion.

The interface calls teams communities; persisted tables and API URLs retain their names. Owners can assign Member or Moderator, never demote/remove an owner. Moderators may create channels, update accessible community channels and send invitations, but cannot rename/delete communities, change community photos, remove users or assign levels. Direct conversation settings cannot be edited through community routes. Channel settings use General and Access tabs. Access changes include history: switching to private retains explicit channel invitees and grants access to the editor; switching to community access opens history to community members. The form explains this before saving.
