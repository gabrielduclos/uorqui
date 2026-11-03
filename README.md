# Uorqui

**Open-source social platform centered on communities, discovery, and one-to-one messaging.**

[English](README.md) · [Português (Brasil)](README.pt-BR.md)

> **Version: `0.1.0-beta.1` — initial technical beta (November 2026).** Deployed for controlled testing, **not** a stable/general-availability release. End-to-end checks on real phones, push and email verification/recovery still need completion. The custom domain has been transferred to the new Worker.

**Official beta:** [uorqui.app](https://uorqui.app) · **Technical preview:** [main.uorqui1.workers.dev](https://main.uorqui1.workers.dev) · **Source:** [GitHub](https://github.com/gabrielduclos/uorqui)

## Product

Uorqui brings together three connected experiences:

- **Direct messages:** private 1:1 text conversations, replies, reactions, media attachments, message status, background push and SSE-driven updates. No conventional private group chats.
- **Discover:** a home screen without global posts, featuring recommended public communities, search and activity from communities a user has joined. Obsolete global feed UI, API, and PostgreSQL tables were retired November 2, 2026.
- **Communities:** public/private membership, invitations, text channels, moderation, WebRTC voice rooms and **audio/video meetings** (up to six), with invite links or Uorqui DMs, admission approval, request notifications and optional password-protected channels. Channels may be open or closed with member-specific permissions assigned in moderation. Voice/meeting text chat starts collapsed; meetings support screen sharing, active-speaker highlighting and fullscreen camera/PiP view.

The initial audience includes gaming communities, but Uorqui is designed for general-purpose use.

> **Global feed retired November 2, 2026:** the new Discover experience replaces public posts. The API and Worker deployment passed live smoke checks, and the legacy feed tables were removed from production Neon after verified snapshot backups. Four older feed media files are retained in R2 for recovery; do not delete them without a verified copy. Read the [Discover decision](docs/en/discover.md).

Community approvals refresh the applicant's community list through account-targeted SSE without reloading. Community owners/admins edit channel names and passwords from the channel header; deletion remains under moderation. See [Meetings](docs/en/video-meetings.md).

## Beta status

| Area | Current technical state |
| --- | --- |
| Login and profiles | Better Auth sessions, email verification/recovery flow, profile visibility and blocking implemented; real signup + email delivery need final validation |
| Direct messages | Persisted 1:1 messages, media, reactions, read/delivery state, SSE updates and Web Push implementation |
| Legacy feed | Retired from app, API and PostgreSQL; Neon recovery snapshots and four legacy R2 files retained |
| Discover | Public community recommendations, search and authorized joined-community activity; live API smoke checks passed, device testing pending |
| Communities | Text, voice and video meeting channels; per-room admission, invitations, channel passwords and community-request alerts; live API smoke passed, real-device media tests pending |
| Deployment | React PWA on Cloudflare Worker `main`, Fastify on Render and PostgreSQL on Neon |
| Public launch | **Not yet approved:** real-device camera/microphone tests, push delivery, TURN/network coverage, operational monitoring and installed-PWA checks after the custom-domain change |

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
| Discovery decision | [Discover](docs/en/discover.md) | [Descobrir](docs/pt-BR/descobrir.md) |
| Roadmap | [Roadmap](docs/en/roadmap.md) | [Roadmap](docs/pt-BR/roadmap.md) |
| Channel permissions | [Open and closed channels](docs/en/channel-permissions.md) | [Canais por permissão](docs/pt-BR/permissoes-canais.md) |
| Code audit & cleanup | [November 3 audit](docs/en/maintenance-audit.md) | [Auditoria de 03/11](docs/pt-BR/auditoria-manutencao.md) |
| Voice and meetings | [Meetings](docs/en/video-meetings.md) | [Reuniões](docs/pt-BR/reunioes-video.md) |
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
