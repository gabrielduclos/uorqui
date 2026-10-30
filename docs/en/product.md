# Product requirements — initial draft

[English](product.md) · [Português](../pt-BR/produto.md)

**Status:** planning. This is a requirements document, not a feature list of working software.

## Navigation

The main destinations are **Feed**, **Messages**, **Communities**, and **Profile**. Search, notifications, and settings are global. Desktop and mobile share the same domain concepts, with layouts adapted to each device.

## 1. One-to-one messaging

- Only two participants per direct conversation; **no traditional group conversations**.
- Initial capabilities: text, attachments within configured limits, replies, reactions, delivery/read states, notifications, and message history.
- Safety: block, report, contact/message requests, per-user limits, and server-side authorization.
- Distinguish sent, delivered, read, and failed states; do not promise end-to-end encryption until implemented and reviewed.

## 2. Hybrid feed

- A **continuous vertical scroll** of variable-height posts: text, photos, carousels, portrait and landscape videos.
- Public posts may lead to relevant public communities; restricted community posts must stay restricted.
- Videos may autoplay **muted** when visible, with only one active at a time. Use conservative preloading and explicit data-saving controls.
- Preserve the feed's scroll position when opening a post, profile, or immersive video and returning.
- Initial discovery: **For you** and **Following** filters; ranking starts with understandable/simple rules, not assumed AI.

## 3. Immersive Videos mode

- Accessible **directly** through a feed shortcut/filter and **from any eligible video post**.
- Opening from a post begins with that **specific video**.
- Full-screen, video-only sequence. Vertical swipes move between videos, and the user stays in this mode until intentionally leaving it.
- Offer share, comment, react, profile and eligible community entry actions.
- Return to the previous feed position when entered from the mixed feed; direct entry has its own coherent back behavior.
- **Videos is a working label. Do not call the feature “Reels.”**

## 4. Communities

- Public/open, public/requires approval, or private/invite-only.
- Multiple topic-based **text channels** and **voice rooms**, member roles, channel permissions, invitations, moderation, and reporting.
- Voice may persist while navigating the app, subject to OS/browser constraints. Other media should start muted during a voice session.
- Members must never gain visibility into private channels, media, notifications, or search results without authorization.

## 5. Cross-pillar experience

A user can find a relevant public post, inspect its author/community, join an eligible channel or voice room, and later start a private conversation. Content may be shared into direct conversations or authorized community channels.

## Quality and safety acceptance criteria

No unauthorized private content exposure; no silent message loss; clear upload limits; reconnect behavior tested on mobile; user blocking and reporting; accessible controls; video and voice spending monitored.

## Out of scope for the first MVP

Traditional group chats, large-scale livestreaming, creator payouts, marketplace, AI-first personalization, full federation, 1:1 video calls, and unlimited free media/voice.
