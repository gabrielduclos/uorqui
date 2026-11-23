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

Validate the migration in an isolated Neon development branch on database `uorqui`. The migration uses the `uorqui_workplace` and `uorqui_workplace_migrations` schemas. Run it as a pre-deploy command or a one-off operation before starting the service. The migration role needs to be able to create the schemas. Provision the first account via the CLI after the migration.

## Cloudflare Workers Builds

Create a Worker from the Workplace branch with root directory `apps/web`, build command `npm run build` and deploy command `npx wrangler deploy`. Set the Worker variable `API_ORIGIN` to the HTTPS Render service origin. The Worker serves the Vite build and forwards `/api/*` from the same origin as the UI, including authentication cookies.

Use a dedicated Workplace hostname. Changes to production DNS or to existing services are outside this branch’s deployment setup.

## Beta scope

Accounts can be created from the sign-in screen with a name, email and password of 8–128 characters. New accounts start with an empty team list and can create a team or accept an invitation. The app generates email-bound, 48-hour links for owners to send manually. Automatic email delivery, mailbox verification, password recovery and administrative revocation are outside this beta. Teams and customers see new messages through periodic refresh.


## Caching

The tab-local cache retains at most 100 entries for five minutes. Fresh teams and channel lists are reused for 60 seconds, messages for eight seconds and older history pages for five minutes. Concurrent identical reads share one request. Cancelling one view does not cancel another view's request. Authentication changes clear the cache, and tab events invalidate other tabs after writes. Private responses retain HTTP no-store.

Visible conversations refresh every ten seconds and channel lists every sixty seconds. Hidden views pause polling. Focus and visibility events refresh through the cache. A successful write invalidates the affected data immediately. These intervals can delay incoming messages by up to ten seconds during normal polling.

The API has a process-local message cache with a five-second lifetime and a maximum of 100 pages. Every request checks its session and channel permissions before using it. Successful message writes invalidate all pages for that channel on the serving instance. Other instances expire their entries within five seconds. Restarts discard the cache.

Hashed JavaScript and CSS assets use a one-year immutable browser cache. Entry HTML and private API data retain their separate policies.

The composer starts at one line and grows to 160 px. Sends appear immediately with pending or retry feedback. Pending and failed sends survive navigation in tab memory and are cleared at authentication changes. Authors can edit sent messages or confirm unsending. Unsent text is cleared and replaced by a translated placeholder, preserving thread replies. Retrying a send uses the same client ID to avoid duplicate messages. Apply migration 0001 before deploying this API version. Existing messages with no client ID remain compatible.
