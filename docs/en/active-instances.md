# Active app instances (beta.21)

The signed-in workspace permits **one desktop tab** and **one mobile browser/PWA instance** per account, simultaneously. It does not revoke Better Auth sessions, alter push permissions or grant extra API authorization.

## Startup and reopening

- Ownership is checked behind the normal `StartupSplash`, before the workspace or message/voice streams are mounted.
- **Reload handover (beta.21):** the successor page waits up to two seconds for the old page's Web Lock to release, underneath `StartupSplash`. A different live tab still blocks; waiting does not silently take over.
- **Same browser or installed PWA:** the app saves a random browser instance UUID in `localStorage` per account and device category. Reopening or reloading reuses that ID and renews its existing PostgreSQL lease immediately, rather than generating a new ID and conflicting with its own 60-second lease.
- **Second live tab:** a Web Lock exclusive to this origin/account/category prevents two documents in the same browser from using the shared ID at once. A second document displays **Uorqui is already open**. **Use this tab** explicitly steals the local lock and takes over; the displaced document unmounts the workspace but remains logged in.
- **Other browser/device:** the PostgreSQL lease still enforces one browser identity in each category. A desktop slot does not displace a mobile slot. Server conflicts require explicit takeover or the 60-second timeout.
- **Failures:** network errors display **Try again** and keep the workspace suspended. Browsers without Web Locks use a best-effort BroadcastChannel peer probe. With all local storage disabled, browser identity cannot persist across restarts.

## Lifecycle and technical notes

- `apps/api/drizzle/0043_app_instance_leases.sql` holds one lease per `(user_id,kind)`. `POST /api/v1/instances/claim` renews or transfers ownership atomically; `/release` on sign-out is called only by an actively owning document.
- The app keeps two IDs: a stable random **browser instance ID** and a fresh **document/page ID**. The latter distinguishes cloned/duplicated tabs in BroadcastChannel notifications, even though they share cookies, `sessionStorage` and the browser ID.
- A Web Lock automatically releases when a page closes. `pagehide` drops local ownership and suspends the workspace but deliberately does **not** release the server lease: an old release arriving after a new claim would invalidate the newly reopened page. `pageshow` checks ownership again. Focus/heartbeat do not overlap an ongoing initial request.
- Same-origin BroadcastChannel gives immediate local takeover notifications. Existing authenticated SSE `instance-lease` events notify cross-browser owners, with a 15-second polling fallback. Blocked tabs never mount the workspace.
- Mobile classification uses user agent (including iPadOS); window width is not decisive. This is a UX/concurrency limit, **not a substitute for server-side authorization**.
- The first upgrade from beta.19 may encounter a leftover random-ID lease from that build for up to 60 seconds. If so, **Use this tab** once. The stable ID prevents that false conflict from recurring.

## Verification

Run `npm run test:instance -w @uorqui/web` in the GitHub Web UI workflow (full workspaces, including `tsx`), then the PostgreSQL integration suite, TypeScript/build, and all four CI workflows. The production `npm run build` intentionally does not execute Node tests, because Cloudflare Builds can install only the web workspace and lacks `tsx`. Manual acceptance: reload same desktop tab, close/reopen browser, close/reopen installed iOS/Android PWA, duplicate tab, open a different browser, transfer with **Use this tab**, desktop and mobile simultaneously, offline/BFCache recovery and voice-call cleanup. No new database migration is required in beta.20. Confirm real Cloudflare/Render deployment separately.
