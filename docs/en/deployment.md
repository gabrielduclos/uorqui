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

Accounts are provisioned by a maintainer or created using a valid invite. The app generates email-bound, 48-hour links for owners to send manually. Automatic email delivery, mailbox verification, password recovery and administrative revocation are outside this beta. Teams and customers see new messages through periodic refresh.
