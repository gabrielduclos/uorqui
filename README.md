# Uorqui Workplace

[Português (Brasil)](README.pt-BR.md) · 0.2.0-beta.3

A compact workspace for teams to talk in internal channels and collaborate with customers in private channels. Team owners create channels and generate links tied to a recipient’s email. Anyone with access to a channel can send messages and keep follow-up conversations in threads.

The interface supports English, Brazilian Portuguese, light mode and dark mode. The React frontend and Fastify API run separately. Better Auth manages sessions and Drizzle stores messages in PostgreSQL.

## Run locally

Requirements are Node.js 22 or newer, npm and a development PostgreSQL database. Run from the repository root.

```sh
npm ci
cp apps/api/.env.example apps/api/.env
```

Set `DATABASE_URL` and generate a distinct `AUTH_SECRET` with `openssl rand -hex 32`. Keep `WEB_ORIGIN=http://localhost:5173` for the default development setup.

```sh
npm run db:migrate -w @uorqui/workplace-api
read -rs password
printf '%s\n' "$password" | npm run account:provision -w @uorqui/workplace-api -- you@example.com "Your Name"
unset password
npm run dev
```

Accounts can also be created directly from the sign-in screen. Enter the first account’s password after the `read` command. Open [localhost:5173](http://localhost:5173/), sign in and create a team. Create a private channel to invite a customer. The app generates a link for you to send to the recipient.

Use `npm run typecheck`, `npm run build` and `npm test` to verify the project. The integration test runs against a temporary PostgreSQL engine through PGlite.

See [deployment](docs/en/deployment.md), the [UI kit](docs/en/ui-kit.md) and [release notes](CHANGELOG.md).
