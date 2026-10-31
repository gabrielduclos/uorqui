# Uorqui

**An open-source social platform for conversations, discovery, and communities.**

[English](README.md) · [Português (Brasil)](README.pt-BR.md)

> **Status: pre-MVP development.** The React/Fastify app now includes authentication screens and server endpoints. The social product is not launched, and both initial database migrations are applied to Neon main.

## What is Uorqui?

Uorqui combines three connected experiences:

1. **Direct messages:** private, one-to-one conversations. Traditional group chats are intentionally out of scope.
2. **Hybrid feed:** one continuous vertical feed for text, photos, carousels, and videos. A separate immersive **Videos** mode displays only videos, with access directly from the feed or by opening a video.
3. **Communities:** public or private spaces with organized text channels and live voice rooms, roles, permissions, and moderation.

The goal is a seamless journey from **discovering content → joining a community → building personal connections**, without copying any single existing social network.

Uorqui starts by validating use cases among gaming communities, particularly MMORPG players, but the product and brand are **general-purpose**.

## Confirmed core technology

**React + TypeScript + Tailwind CSS on Cloudflare Workers Static Assets** (web/PWA), **Node.js + Fastify** (separately hosted API), and **PostgreSQL on Neon + Drizzle ORM** (database access and migrations). The **Neon database and both Drizzle migrations (10 application tables) are applied and verified**. Authentication and profile API endpoints exist, but they have not been tested with the production Neon connection. Realtime, voice, media and deployment integrations remain under evaluation.

## Documentation

| Topic | English | Português |
| --- | --- | --- |
| Run locally | [Getting started](docs/en/getting-started.md) | [Primeiros passos](docs/pt-BR/primeiros-passos.md) |
| Cloudflare Workers web hosting | [Workers guide](docs/en/cloudflare-workers.md) | [Guia Workers](docs/pt-BR/cloudflare-workers.md) |
| Node.js API hosting | [API hosting](docs/en/api-hosting.md) | [Guia da API](docs/pt-BR/hospedagem-api.md) |
| Vision and principles | [Vision](docs/en/vision.md) | [Visão](docs/pt-BR/visao.md) |
| Product requirements | [Product](docs/en/product.md) | [Produto](docs/pt-BR/produto.md) |
| Proposed architecture | [Architecture](docs/en/architecture.md) | [Arquitetura](docs/pt-BR/arquitetura.md) |
| Milestones | [Roadmap](docs/en/roadmap.md) | [Roadmap](docs/pt-BR/roadmap.md) |
| Contributing | [Contributing](CONTRIBUTING.md) | [Contribuindo](CONTRIBUTING.pt-BR.md) |
| Security | [Security](SECURITY.md) | [Segurança](SECURITY.pt-BR.md) |
| Community standards | [Code of conduct](CODE_OF_CONDUCT.md) | [Código de conduta](CODE_OF_CONDUCT.pt-BR.md) |

## Current state

- **Done:** project creation, MIT license, initial bilingual product and technical documentation.
- **Validated in temporary PostgreSQL CI:** Real Cloudflare Worker proxy, Fastify API, Better Auth email/password, cookie sessions, protected profile endpoints, onboarding and logout. Not yet connected end-to-end to Neon main; requires private settings and real Neon connectivity testing.
- **Not done:** production-ready email verification, password recovery, social messaging, feed, video, voice, production deployment and user validation.
- **Next:** connect a Node.js API host (optional Render Blueprint in `render.yaml`), set private secrets, validate sessions with Neon and add email verification/abuse protection before opening registration.

The architecture documents distinguish **confirmed core stack decisions** from **proposed integrations**; neither implies working code. See the roadmap for acceptance criteria. Internal business planning, pricing hypotheses and financial projections are managed separately from this public repository.

## Development

The npm workspaces contain a **React + Tailwind starter**, **Fastify API and authentication endpoints**, and a **Drizzle schema applied to Neon**. With Node.js 22+:

```sh
npm install
npm run dev
```

Web: `http://localhost:5173` · API: `http://127.0.0.1:3001/health`. The database is not required to see this starter. See [Getting started](docs/en/getting-started.md) for secure Neon configuration.

## Cloudflare Workers web hosting

The React SPA uses **Cloudflare Workers Static Assets** via `apps/web/wrangler.jsonc`. Cloudflare Worker **`main`** is connected to GitHub, and **Cloudflare Builds** runs the frontend build/deploy after commits to `main`. Without `API_ORIGIN`, proxied API requests return HTTP 503. See the [Workers setup](docs/en/cloudflare-workers.md).

## Open source

Licensed under the [MIT License](LICENSE). Read [CONTRIBUTING.md](CONTRIBUTING.md) before contributing, and [SECURITY.md](SECURITY.md) before reporting a vulnerability.

The existing business messenger is a **separate legacy product**; this repository must not be mistaken for its source code or live service. The registered **uorqui.app** domain is not proof this new application has launched.

---

**Uorqui — converse, discover, belong.** *(Working tagline.)*
