# Uorqui

**An open-source social platform for conversations, discovery, and communities.**

[English](README.md) · [Português (Brasil)](README.pt-BR.md)

> **Status: development scaffold / pre-MVP.** Uorqui is a new project built from scratch. A local React/Fastify starter exists, but the social platform and database have not been implemented or deployed.

## What is Uorqui?

Uorqui combines three connected experiences:

1. **Direct messages:** private, one-to-one conversations. Traditional group chats are intentionally out of scope.
2. **Hybrid feed:** one continuous vertical feed for text, photos, carousels, and videos. A separate immersive **Videos** mode displays only videos, with access directly from the feed or by opening a video.
3. **Communities:** public or private spaces with organized text channels and live voice rooms, roles, permissions, and moderation.

The goal is a seamless journey from **discovering content → joining a community → building personal connections**, without copying any single existing social network.

Uorqui starts by validating use cases among gaming communities, particularly MMORPG players, but the product and brand are **general-purpose**.

## Confirmed core technology

**React + TypeScript + Tailwind CSS** (web/PWA), **Node.js + Fastify** (API), and **PostgreSQL on Neon + Drizzle ORM** (database access and migrations). The initial **Neon database and six-table Drizzle migration are deployed and verified**, but application data endpoints are not yet implemented. Realtime, voice, media and deployment integrations remain under evaluation.

## Documentation

| Topic | English | Português |
| --- | --- | --- |
| Run locally | [Getting started](docs/en/getting-started.md) | [Primeiros passos](docs/pt-BR/primeiros-passos.md) |
| Vision and principles | [Vision](docs/en/vision.md) | [Visão](docs/pt-BR/visao.md) |
| Product requirements | [Product](docs/en/product.md) | [Produto](docs/pt-BR/produto.md) |
| Proposed architecture | [Architecture](docs/en/architecture.md) | [Arquitetura](docs/pt-BR/arquitetura.md) |
| Milestones | [Roadmap](docs/en/roadmap.md) | [Roadmap](docs/pt-BR/roadmap.md) |
| Contributing | [Contributing](CONTRIBUTING.md) | [Contribuindo](CONTRIBUTING.pt-BR.md) |
| Security | [Security](SECURITY.md) | [Segurança](SECURITY.pt-BR.md) |
| Community standards | [Code of conduct](CODE_OF_CONDUCT.md) | [Código de conduta](CODE_OF_CONDUCT.pt-BR.md) |

## Current state

- **Done:** project creation, MIT license, initial bilingual product and technical documentation.
- **Not done:** authentication, application data endpoints, real-time messaging, video delivery, voice infrastructure, application deployment, and user validation.
- **Next:** decide authentication, implement secure API data access and incrementally build a usable MVP.

The architecture documents distinguish **confirmed core stack decisions** from **proposed integrations**; neither implies working code. See the roadmap for acceptance criteria. Internal business planning, pricing hypotheses and financial projections are managed separately from this public repository.

## Development

The initial npm workspaces contain a **React + Tailwind landing page**, a **Fastify health endpoint** and an **unapplied Drizzle schema**. With Node.js 22+:

```sh
npm install
npm run dev
```

Web: `http://localhost:5173` · API: `http://127.0.0.1:3001/health`. The database is not required to see this starter. See [Getting started](docs/en/getting-started.md) for secure Neon configuration.

## Open source

Licensed under the [MIT License](LICENSE). Read [CONTRIBUTING.md](CONTRIBUTING.md) before contributing, and [SECURITY.md](SECURITY.md) before reporting a vulnerability.

The existing business messenger is a **separate legacy product**; this repository must not be mistaken for its source code or live service. The registered **uorqui.app** domain is not proof this new application has launched.

---

**Uorqui — converse, discover, belong.** *(Working tagline.)*
