# Uorqui

**Open-source social platform for direct messages, a hybrid feed, and communities.**

[English](README.md) · [Português (Brasil)](README.pt-BR.md)

> **Version: `0.1.0-beta.1` — initial technical beta (November 2026).** Deployed for controlled testing, **not** a stable/general-availability release. End-to-end checks on real phones, push and email verification/recovery still need completion. The custom domain has been transferred to the new Worker.

**Official beta:** [uorqui.app](https://uorqui.app) · **Technical preview:** [main.uorqui1.workers.dev](https://main.uorqui1.workers.dev) · **Source:** [GitHub](https://github.com/gabrielduclos/uorqui)

## Product

Uorqui brings together three connected experiences:

- **Direct messages:** private 1:1 text conversations, replies, reactions, media attachments, message status, background push and SSE-driven updates. No conventional private group chats.
- **Hybrid feed:** continuous mixed text/photo/video posts, fixed "For you" / "Following" filters, a + button on the left that opens the new-post modal, and dedicated immersive video browsing.
- **Communities:** public/private membership, invitations, text channels, moderation and live WebRTC voice rooms, including a floating call control when navigating.

The initial audience includes gaming communities, but Uorqui is designed for general-purpose use.

## Beta status

| Area | Current technical state |
| --- | --- |
| Login and profiles | Better Auth sessions, email verification/recovery flow, profile visibility and blocking implemented; real signup + email delivery need final validation |
| Direct messages | Persisted 1:1 messages, media, reactions, read/delivery state, SSE updates and Web Push implementation |
| Feed | Hybrid posts and media backed by the API/database, persistent filters and a modal post composer |
| Communities | Membership, invitations, roles, text channels, voice presence and WebRTC |
| Deployment | React PWA on Cloudflare Worker `main`, Fastify on Render and PostgreSQL on Neon |
| Public launch | **Not yet approved:** real-device tests, push, TURN/network coverage, operational monitoring and installed-PWA checks after the custom-domain change |

The project has automated CI for the API, UI and integration flows. Passing CI does **not** mean the iOS/Android installed-PWA experience has been fully certified.

**Domain status (verified November 1, 2026):** Cloudflare associates `uorqui.app` with the new Worker `main`. Successful login with an account from the new Uorqui has been reported. Installed-PWA updates and device-level verification remain outstanding. The legacy business messenger has its **own** Worker and databases; its accounts and messages are not automatically imported.

## Architecture

- **Frontend:** React, TypeScript, Tailwind CSS, Cloudflare Workers Static Assets, PWA and service worker.
- **Backend:** Node.js 22, Fastify, Better Auth and SSE events.
- **Database:** Neon PostgreSQL with Drizzle ORM and versioned migrations.
- **Media:** Cloudflare R2 with authorization checks.
- **Voice:** WebRTC peer-to-peer; TURN is optional and connectivity must be tested across networks.
- **Deployment:** Cloudflare Builds and Render, with GitHub Actions verification.

This beta version is defined in the npm workspace manifests and shown beside the Uorqui header wordmark. See [release notes](CHANGELOG.md) for the exact scope and known risks.

## Documentation

| Topic | English | Português |
| --- | --- | --- |
| Beta release notes | [Changelog](CHANGELOG.md) | [Notas da versão](CHANGELOG.pt-BR.md) |
| Local setup | [Getting started](docs/en/getting-started.md) | [Primeiros passos](docs/pt-BR/primeiros-passos.md) |
| API & deployment | [API hosting](docs/en/api-hosting.md) | [Hospedagem da API](docs/pt-BR/hospedagem-api.md) |
| Cloudflare Worker | [Workers](docs/en/cloudflare-workers.md) | [Workers](docs/pt-BR/cloudflare-workers.md) |
| Architecture | [Architecture](docs/en/architecture.md) | [Arquitetura](docs/pt-BR/arquitetura.md) |
| Features and goals | [Product](docs/en/product.md) | [Produto](docs/pt-BR/produto.md) |
| Roadmap | [Roadmap](docs/en/roadmap.md) | [Roadmap](docs/pt-BR/roadmap.md) |
| UI design system | [UI kit](docs/en/ui-kit.md) | [UI kit](docs/pt-BR/ui-kit.md) |
| Domain migration | [Portuguese runbook](docs/pt-BR/migracao-dominio-uorqui-app.md) | [Plano de migração](docs/pt-BR/migracao-dominio-uorqui-app.md) |
| Contributing | [Contributing](CONTRIBUTING.md) | [Contribuindo](CONTRIBUTING.pt-BR.md) |
| Security | [Security policy](SECURITY.md) | [Política de segurança](SECURITY.pt-BR.md) |

## Development

Node.js 22+ and PostgreSQL are required for complete authenticated testing:

```sh
npm install
npm run dev
npm run typecheck
npm run build
```

Web: `http://localhost:5173`; API: `http://127.0.0.1:3001`. The interface can start without a connected database, but authentication and live features will not work. Follow [Getting started](docs/en/getting-started.md) to use a private test database and local secrets.

## Open source

Licensed under [MIT](LICENSE). See [contribution guidelines](CONTRIBUTING.md) and [responsible security reporting](SECURITY.md). Do not submit credentials, customer data or sensitive vulnerability details in public issues.

**Uorqui — converse, discover, belong.**
