# Uorqui

**Open-source communication platform combining communities, one-to-one messaging, meetings and connected email.**

[English](README.md) · [Português (Brasil)](README.pt-BR.md)

**Technical beta `0.1.0-beta.50`** · [Open Uorqui](https://uorqui.app) · [Product documentation](docs/en/README.md) · [Engineering case study](docs/en/portfolio.md)

> **Beta, not a stable release.** Features listed below are implemented in the project; real-device, provider-integration and load validation are still in progress. Check the [roadmap](docs/en/roadmap.md) before depending on the service for critical work.

## About the product

Uorqui brings everyday communication into one place. People can find communities, participate in topic-based channels, exchange private messages, join small voice/video meetings and view connected mailboxes without switching between unrelated interfaces.

The initial testing audience includes gaming communities, but the design supports other kinds of groups and collaborative spaces. **Discover** replaced a retired global post feed: the focus is on participation, not infinite scrolling.

### What you can do

| Area | Capabilities in the current beta | Documentation |
| --- | --- | --- |
| **Direct messages** | Persistent 1:1 conversations, replies, reactions, media and documents, pinned messages, delivery/read states, realtime updates and push | [Messaging](docs/en/messenger.md) |
| **Communities** | Public/private communities, moderated text and voice channels, roles, scoped permissions, passwords and secure invitations | [Product](docs/en/product.md) · [Permissions](docs/en/channel-permissions.md) |
| **Voice and video** | Small WebRTC rooms with meeting approval, screen sharing, reusable meeting links for authorized participants and a 60-minute limit per meeting session | [Meetings](docs/en/video-meetings.md) |
| **Discover and notifications** | Community discovery, joined-community activity, notifications and unread counters for messages and mail | [Discover](docs/en/discover.md) · [Notifications](docs/en/notifications.md) |
| **Connected email** | Multi-account navigation and unified inbox, Gmail OAuth, optional Outlook OAuth and manual IMAP/SMTP connections | [Email](docs/en/email.md) |

**Access matters:** a meeting link does not grant community or channel membership. Joining a restricted channel uses a separate invitation and server-side authorization. Email providers and device capabilities depend on their configuration and availability.

### Typical workflow

1. **Discover** a community or accept an invitation, then open an authorized text or voice channel.
2. **Communicate** with a member through a private 1:1 conversation, including attachments and message replies.
3. **Collaborate** in a voice or meeting room, with permissions, admission rules and a visible countdown.
4. **Stay informed** through the notification inbox or review messages from connected email accounts.

## How it works

The codebase uses a **TypeScript monorepo** with a React PWA, a Node.js/Fastify API and PostgreSQL. The API is a modular monolith rather than a collection of microservices.

| Component | Stack | Responsibility |
| --- | --- | --- |
| Web and PWA | React, TypeScript, Vite, Tailwind CSS | Responsive UI, navigation and optimistic updates |
| Edge | Cloudflare Workers Static Assets | Serve the SPA and proxy API requests on the same origin |
| Backend | Node.js 22, Fastify, Better Auth | Authenticated endpoints, business rules and SSE |
| Persistence | Neon PostgreSQL, Drizzle | Accounts, conversations, memberships, permission checks and migrations |
| Media and live communication | Cloudflare R2, Web Push, WebRTC | Protected attachments, notifications and peer-to-peer calls |
| Delivery | Render, Cloudflare Builds, GitHub Actions | Separate deployments and automated verification |

More detail: [Architecture](docs/en/architecture.md) · [Worker and proxy](docs/en/cloudflare-workers.md) · [UI kit](docs/en/ui-kit.md).

## Get started locally

**Requirements:** Node.js 22+, npm and PostgreSQL for authentication and persistent features. A local PostgreSQL instance or an isolated Neon development branch is recommended.

```bash
git clone https://github.com/gabrielduclos/uorqui.git
cd uorqui
npm install
npm run dev
```

Web: `http://localhost:5173` · API: `http://127.0.0.1:3001`.

To enable authenticated features, configure `apps/api/.env` using the safe example, connect a **development-only** database and run the documented Drizzle migrations. The UI can start without a database; authenticated features cannot. Follow the [complete setup guide](docs/en/getting-started.md) before using `npm run db:migrate`. Do not use production secrets locally.

Validate code changes with:

```bash
npm run typecheck
npm run build
```

For the integration and UI test suites, see [quality and contribution docs](docs/en/README.md).

## Release and operational status

- **Available for controlled beta:** app shell, messaging, communities, Discover, meetings, notifications and configurable email integrations.
- **Still under validation:** installed iOS/Android PWA, cross-network WebRTC and TURN, end-to-end provider mail flows, push delivery, accessibility, realistic load and operating costs.
- **HTTP 429 investigation:** backend authentication limits remain in effect. The broad Cloudflare per-IP API rule was disabled on November 10, 2026; the first 429 origin has not been conclusively identified. See [operations](docs/en/cloudflare-rate-limiting.md).

Implemented features and passing CI **do not** establish production-scale reliability. Refer to the [roadmap](docs/en/roadmap.md) and [release notes](CHANGELOG.md) for known gaps and changes.

## Documentation by audience

| You want to… | Start here |
| --- | --- |
| **Understand or use the product** | [Product guide and feature map](docs/en/README.md) · [Product details](docs/en/product.md) |
| **Develop or contribute** | [Local setup](docs/en/getting-started.md) · [Architecture](docs/en/architecture.md) · [Contributing](CONTRIBUTING.md) |
| **Operate or troubleshoot** | [API hosting](docs/en/api-hosting.md) · [Cloudflare Workers](docs/en/cloudflare-workers.md) · [Security](SECURITY.md) |
| **Evaluate the engineering as a portfolio** | [Case study, decisions and evidence](docs/en/portfolio.md) · [Source tests](apps/api/test) |

The **README and product guides describe Uorqui itself**; the portfolio case study separately explains engineering choices, trade-offs, lessons and verification evidence.

## Open source

MIT license · [Contributing](CONTRIBUTING.md) · [Security policy](SECURITY.md) · [Changelog](CHANGELOG.md) · [Version policy](docs/en/versions.md).

**Uorqui — converse, discover, belong.**
