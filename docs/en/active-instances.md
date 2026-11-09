# Active app instances (beta.18)

The signed-in Uorqui workspace supports **one active desktop tab/window** and **one active mobile browser/PWA window** per account at a time. Both categories can remain active simultaneously. This reduces duplicate SSE connections, presence loops, polling, and media connections without revoking the Better Auth session. Multiple tabs in a browser are separate instances even if they share cookies or cloned sessionStorage.

## What users see

- **Startup (beta.19):** the authenticated lease check runs behind the original `StartupSplash` after session restoration. Keep the same splash mounted until an ownership result is known; do not show an intermediate `Checking active instance…` screen. The check does not mount the workspace while ownership is unknown.
- On a second tab in a category already occupied, the workspace is not mounted. A localized screen explains the conflict and offers **Use this tab**.
- **Use this tab** explicitly takes over the category. The previous workspace is paused, stops its subscriptions on unmount and displays the blocked screen, but the user remains signed in. A separate **Sign out** option is offered.
- Network failure shows **Try again**, not a false busy error. Repeated heartbeat failures suspend the workspace until verified. A mobile window does not displace a desktop window and vice versa.
- Opening another tab does *not* automatically evict the earlier one. A 60-second lease enables recovery if a window crashes or is closed. Reopening after a crash or browser restart claims a free/expired slot automatically.

## Implementation and deployment

- An additive PostgreSQL migration `apps/api/drizzle/0043_app_instance_leases.sql` creates `app_instance_leases`, keyed by `(user_id,kind)`. Apply this migration **before expecting enforcement on the deployed API**. The API intentionally returns `active:true,managed:false` only if the table is missing during staggered rollout, avoiding a global lockout; this fallback does not provide a limit until migration is installed.
- Authenticated, same-origin `POST /api/v1/instances/claim` with `{kind,instanceId,takeover?}` acquires/renews atomically or returns HTTP 409 `INSTANCE_IN_USE`. An existing owner renews every 15 seconds; only explicit takeover or an expired lease permits another instance. `POST /api/v1/instances/release` removes ownership only for the matching ID on sign-out. Owner IDs are freshly generated UUIDs per document; they are not auth credentials.
- A same-origin `BroadcastChannel` signals instant takeover to sibling tabs. Cross-browser handover sends a `instance-lease` event using the existing authenticated SSE stream. Heartbeat also detects changes when push/SSE is unavailable. Blocked windows do not mount `SocialShell` or subscribe to messages.
- Category is based on mobile user-agent, with iPadOS desktop-mode detection, rather than viewport width. It is a UX/concurrency mechanism, **not a substitute for API authorization or a hard security limit against spoofed clients**. Existing sign-in cookies, server sessions, email permissions and push subscriptions are unchanged.

## Regression tests

Run the temporary-PostgreSQL integration `apps/api/test/app-instances.integration.test.mjs`, web typecheck/build and all CI checks. On real devices, test two desktop browser tabs (including Duplicate Tab), two mobile/PWA windows, one desktop plus one phone, different browsers, an explicit takeover during a voice call, inactive tab restart, browser sleep, and reconnection after connectivity loss. Production migration application and Cloudflare/Render deployment must be confirmed separately.
