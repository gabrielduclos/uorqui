# Architecture — proposal, not final implementation

[English](architecture.md) · [Português](../pt-BR/arquitetura.md)

> No application scaffold or production architecture is deployed in this repository yet.

## Design approach

Start with a **modular monolith**: one API deployment with clear bounded modules. Split high-cost media and live voice responsibilities into dedicated components or managed services only where justified.

## Candidate stack (decision pending)

| Layer | Candidate | Reason to evaluate |
| --- | --- | --- |
| Web/PWA | React, TypeScript | Accessible, responsive client and developer ecosystem |
| API | Node.js, Fastify | Typed schemas and controlled authorization |
| Persistence | PostgreSQL with Drizzle | Relational permissions and migrations |
| Realtime | WebSocket | Conversation and channel event delivery |
| Presence/ephemeral state | Redis (only if needed) | Reconnection, fan-out and transient state |
| Voice | WebRTC + LiveKit or equivalent | Audio rooms and per-participant controls |
| Video/media | Object storage, transcoding, CDN | Controlled delivery of images and video |

These are **candidates**, not installation instructions or chosen providers.

## Modules and boundaries

**Identity & profiles:** accounts, authentication, settings and relationships. **Direct messaging:** strictly two-person conversations and receipts. **Communities:** membership, roles, channels and invitations. **Feed:** posts, follows, ranking and content permissions. **Media:** uploads, processing, quotas and signed access. **Voice:** rooms, participants and moderation. **Trust & safety:** reports, blocking, rate limits and audit trails. **Notifications:** delivery state and privacy-aware payloads.

## Core entities (draft)

user, profile, follow, direct_conversation, direct_message, community, member, role, channel, channel_message, voice_room, presence, post, media_asset, comment, reaction, notification, report, moderation_action.

## Non-negotiable security requirements

- All content and membership authorization is enforced **server-side**, not just hidden in UI.
- Never expose a private community through feed recommendations, thumbnails, copied media URLs, search, or push notifications.
- Apply rate limits, file type/size validation, content scanning strategy, secure credentials, and audit events.
- Use short-lived media access when appropriate; secrets and production data do not belong in Git.
- Define data retention, deletion/export requests, backups, restoration tests and migration policies.
- Avoid saying messages are end-to-end encrypted until a reviewed design is implemented.
- Build abuse reporting and moderator controls before public rollout.

## Reliability and resource economics

Define delivery/receipt semantics, pagination, idempotent sends, replay on reconnect, push cancellation rules, and offline behavior before coding. Monitor media storage/egress and voice participant-minutes from the beginning. PWA background voice behavior differs across mobile operating systems; test on real devices instead of promising universal support.

## Delivery and developer experience

Versioned schema migrations; automated linting, unit/integration/E2E tests; CI on pull requests; local development setup (once scaffold exists); release notes and rollback playbooks. English and Brazilian Portuguese documentation must be updated together when modifying product decisions.

## Isolation from the old product

The earlier Uorqui messenger runs separately. Do **not** point this new project to its production databases, messaging keys, deployed Workers or domain until a future migration plan is explicitly approved.
