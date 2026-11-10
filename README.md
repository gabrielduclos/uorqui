# Uorqui

**Open-source communication platform for communities, private messages and collaborative spaces.**

[English](README.md) · [Português (Brasil)](README.pt-BR.md)

**Technical beta `0.1.0-beta.37`** · [Try the live beta](https://uorqui.app) · [Portfolio case study](docs/en/portfolio.md) · [Source code](https://github.com/gabrielduclos/uorqui)

> This is a working, actively developed **technical beta**, not a production-readiness or security certification. Device-level voice/video, installed PWA, notifications and email-provider scenarios are still being validated.

## What problem does Uorqui solve?

People often move between a messaging app, a community server, a meeting link and their inbox to stay in touch. Uorqui explores a **community-first communication workspace**: find a community, participate in its channels, talk privately to a person, and manage connected email in a single responsive interface.

The initial validation audience includes gaming communities, but the product is not limited to gaming. A global social-post feed was deliberately **retired** in favor of Discover, which focuses on communities and relevant participation.

## Explore the product

| Experience | Implemented in the beta |
| --- | --- |
| **1:1 messaging** | Persistent messages, optimistic UI, replies, reactions, pinned messages, file/media sharing, delivery/read state, SSE updates, push and media gallery |
| **Communities** | Public/private spaces, text and voice channels, roles, moderation, scoped access, optional channel passwords and protected invitation flows |
| **Meetings** | Audio/video WebRTC rooms (up to six participants), approval mode, reusable links for already authorized users, screen sharing and a **60-minute session countdown** |
| **Discover & notifications** | Community search/recommendations, activity from joined communities, personal notification inbox and unread indicators for messages/channels/email |
| **Connected email** | Multiple accounts, unified mailbox navigation, Gmail OAuth, optional Outlook OAuth and manual IMAP/SMTP; availability depends on provider and deployment configuration |

## Engineering overview

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Web / PWA | React, TypeScript, Vite, Tailwind CSS | Responsive application, offline-capable shell, client state and interaction |
| Edge | Cloudflare Worker and Static Assets | Host the SPA, same-origin API proxy and edge transport |
| API | Node.js 22, Fastify, Better Auth | Sessions, authorization, HTTP endpoints, SSE and business rules |
| Data | Neon PostgreSQL, Drizzle ORM | Persistent accounts, messages, memberships, notification state and migrations |
| Files and calls | Cloudflare R2, Web Push, WebRTC | Protected media, device notifications, peer-to-peer voice/video |
| Delivery | Render, Cloudflare Builds, GitHub Actions | Separate API and frontend deployments; automated checks |

**Notable decisions:** a modular-monolith API; server-enforced membership and permissions; PostgreSQL-backed event delivery with SSE for near-real-time UI; optimistic messaging with reconciliation; signed visitor-IP forwarding between the edge and API; reusable **meeting links separate from access-granting channel invitations**; and versioned database migrations.

See the [architecture](docs/en/architecture.md), [messaging](docs/en/messenger.md), [meetings](docs/en/video-meetings.md) and [portfolio engineering decisions](docs/en/portfolio.md).

## Portfolio: what this repository demonstrates

This repository is an **end-to-end product and engineering case study**, not just a UI template. It documents product scope decisions, frontend/backend integration, database migrations, authentication boundaries, realtime behavior, operational diagnosis of HTTP 429 errors, CI and deployment trade-offs.

The project uses **AI-assisted development tools** for parts of implementation, debugging and documentation. The portfolio focuses on explaining decisions, verification and limitations rather than claiming that every line of code was written unaided. Read the [case study, evidence and open issues](docs/en/portfolio.md).

## Current maturity

- **Implemented:** working PWA and API beta, direct messaging, communities, Discover, email integration paths, WebRTC rooms, notifications, automated tests and versioned migrations.
- **Validation still needed:** cross-network TURN and live device calls, installed iOS/Android PWA behavior, real-provider mail flows, push delivery and operating-cost/scale testing.
- **Rate limits:** the broad Cloudflare IP-based API rule introduced on November 10 was **disabled that same day** after shared-network concerns; backend authentication and other security controls remain. See the [operational note](docs/en/cloudflare-rate-limiting.md). The original HTTP 429 source remains unconfirmed.

**Do not interpret feature presence or CI pass status as full production validation.** Current releases are beta-only.

## Run locally

Requires Node.js **22+** and PostgreSQL (local or an isolated Neon development branch for authenticated features).

```bash
git clone https://github.com/gabrielduclos/uorqui.git
cd uorqui
npm install
npm run dev
npm run typecheck
npm run build
```

Frontend: `http://localhost:5173` · API: `http://127.0.0.1:3001`. Use [Getting started](docs/en/getting-started.md) for environment settings and migrations. **Never reuse production credentials for development.**

## Documentation

- **Start here:** [Portfolio / engineering case study](docs/en/portfolio.md) · [Architecture](docs/en/architecture.md) · [Product scope](docs/en/product.md) · [Roadmap](docs/en/roadmap.md)
- **Developer guide:** [Getting started](docs/en/getting-started.md) · [Cloudflare deployment](docs/en/cloudflare-workers.md) · [UI kit](docs/en/ui-kit.md)
- **Quality and history:** [Changelog](CHANGELOG.md) · [Version policy](docs/en/versions.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

MIT licensed. **Uorqui — converse, discover, belong.**
