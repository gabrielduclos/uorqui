# Uorqui documentation

[English](README.md) · [Português](../pt-BR/README.md) · [Main README](../../README.md)

This is the **documentation hub for the Uorqui product and its codebase**. It is useful for users evaluating the beta, contributors working on a module, and people responsible for deployment and support. The separate [engineering portfolio case study](portfolio.md) focuses on decisions, evidence and lessons learned.

> **Current release:** `0.1.0-beta.38` (technical beta). Feature guides may include implementation details, historical design decisions and open validation work. Check the [changelog](../../CHANGELOG.md) and [roadmap](roadmap.md) for the latest release state. A passing CI run is not a mobile-device or production-scale certification.

## Product and features

| Topic | What you'll find |
| --- | --- |
| [Product requirements](product.md) | Feature scope, detailed behaviors and historical decisions clearly distinguished from current functionality |
| [Vision and principles](vision.md) | Why the product is community-first and what it intentionally does not include |
| [Discover](discover.md) | How discovery replaces the former global social feed |
| [1:1 messenger](messenger.md) | Conversations, replies, attachments and realtime behavior |
| [Profiles](profiles.md) | Profile visibility, identity and access |
| [Communities and permissions](channel-permissions.md) | Roles, closed channels, moderation and access checks |
| [Restricted-channel invitations](restricted-channel-invitations.md) | Single-use invites and permission-granting boundaries |
| [Voice and video meetings](video-meetings.md) | Small rooms, screen sharing, meeting admission, reusable meeting links and time limits |
| [Notifications](notifications.md) | Unread counts, Web Push and notification preferences |
| [Connected email](email.md) | Mail providers, multiple accounts, folders, messages and integration constraints |
| [Roadmap](roadmap.md) | Delivered work, product direction and tasks still requiring validation |

## Architecture and development

| Topic | What you'll find |
| --- | --- |
| [Getting started](getting-started.md) | Requirements, local run, development database and environment variables |
| [Architecture](architecture.md) | Components, data flows, permissions and technical trade-offs |
| [Frontend](frontend.md) | React/PWA implementation and UI boundaries |
| [Cloudflare Worker](cloudflare-workers.md) | Static assets, same-origin API proxy and deployment |
| [API hosting](api-hosting.md) | Render hosting, API configuration and readiness |
| [UI kit](ui-kit.md) | Design conventions and shared UI patterns |
| [Contributing](../../CONTRIBUTING.md) | Pull requests, development standards and collaboration |

## Operations, security and releases

| Topic | What you'll find |
| --- | --- |
| [Release notes](../../CHANGELOG.md) | Current and previous versions, bug fixes and migrations |
| [Version policy](versions.md) | Manifest synchronization, release gates and required version bumps |
| [Cloudflare rate-limit incident](cloudflare-rate-limiting.md) | Historical rule, current disabled state and HTTP 429 investigation |
| [Maintenance audit](maintenance-audit.md) | Cleanup and technical debt decisions |
| [Security policy](../../SECURITY.md) | Private vulnerability reporting and protection guidelines |

## Engineering portfolio

If you're evaluating the project as engineering work, use the [portfolio case study](portfolio.md) alongside the **actual code**, [API integration tests](../../apps/api/test), [web tests](../../apps/web/test), [database migrations](../../apps/api/drizzle) and [CI workflows](../../.github/workflows). The case study explains architectural choices and limitations; it does **not** replace the product documentation above.

## Suggested reading paths

- **New user / product evaluator:** [Product](product.md) → [Discover](discover.md) → [Communities](channel-permissions.md) → [Meetings](video-meetings.md)
- **New contributor:** [Getting started](getting-started.md) → [Architecture](architecture.md) → [UI kit](ui-kit.md) → [Contributing](../../CONTRIBUTING.md)
- **Operations:** [API hosting](api-hosting.md) → [Cloudflare Worker](cloudflare-workers.md) → [Security](../../SECURITY.md) → [Release notes](../../CHANGELOG.md)
- **Recruiter / technical reviewer:** [Main README](../../README.md) → [Portfolio](portfolio.md) → [Tests](../../apps/api/test)

Do not add real user credentials, private customer data or production secrets to issues, examples or screenshots.
