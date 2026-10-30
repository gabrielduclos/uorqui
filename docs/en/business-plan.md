# Business plan — working hypothesis (v0.1)

[English](business-plan.md) · [Português](../pt-BR/plano-de-negocios.md)

**Updated:** 2026-10-30 · **Phase:** pre-MVP · **Evidence level:** assumptions, not proven traction.

## Executive summary

Uorqui is an MIT-licensed, open-source social platform designed around three integrated capabilities: **one-to-one messaging, a continuous mixed-media feed, and public/private communities with text channels and voice rooms**.

The initial validation group will be MMORPG and other cooperative gaming communities. The long-term product is general-purpose. The opportunity is not to replicate multiple established products feature-by-feature, but to test whether people value a shorter journey from discovering content to participating in community life and forming individual connections.

## Customer problem (to validate)

- Community organizers struggle to make their events and discussions discoverable.
- Small creators often get views without a direct path to sustained community participation.
- Users switch between separate feed, messaging, and live voice applications.
- Traditional group chats become difficult to organize around topics.

These statements are hypotheses, **not findings from interviews yet**.

## Starting customer segments

**Primary:** guild leaders, event/dungeon organizers, small gaming creators, and engaged players. **Secondary, after validation:** education, technology, hobbies, language learning and other interest-based communities.

## Value proposition

**Working positioning:** “Converse, discover, belong.”

A public post can lead to its creator, a relevant community, a topic channel or an eligible live room. A personal relationship can continue in direct messages. Unlike group messages, community discussion is organized in topic channels.

## Competitive landscape

Discord: community channels and voice. WhatsApp/Telegram: established direct communication networks. Instagram/TikTok/YouTube: established content distribution. Reddit: discussion discovery.

**Competitive risk:** all have massive existing networks; a combined feature list is not a defensible advantage. Uorqui must prove a superior workflow and real community value within a smaller segment.

## Go-to-market experiment

1. Interview **15–20 users/organizers** across at least **five communities**.
2. Identify the three most common problems and rank them by severity/frequency.
3. Recruit **5–10 communities** for a limited-access pilot, without requiring them to leave existing apps.
4. Enable clear invitations to a community and a post/contextual entry point.
5. Measure sign-up → first useful interaction → D7/D28 return; review feedback weekly.
6. Expand into new games and languages only if reliability, moderation, retention and costs support it.

**Potential loop:** public content → discovery → community visit → first text/voice participation → direct personal connection → return → invitation.

## Revenue model (not launched)

A potential **freemium** hosted offering: free individual accounts and small communities; paid community Pro for higher configured limits, better administration, moderation tools and customization. **BRL 49.90/community/month is an exploratory test price, not a confirmed offer.** Managed hosting may be monetized while the source remains MIT-licensed. Advertising is not required for the MVP.

The MIT license **allows third parties to commercialize forks, including closed-source adaptations**; the business must compete on trust, quality, community, service and distribution rather than exclusive code ownership.

## Costs and unit economics

Major costs: video processing and delivery, stored media, participant-minutes in voice, bandwidth, database and queues, observability, abuse prevention, support, moderation and payment fees.

Evaluate monthly:
- **Net recurring revenue:** paying communities × effective net subscription amount.
- **Variable contribution:** net revenue − delivery/voice/storage/transaction and proportional support costs.
- **Cost per active user:** variable and fixed operating costs divided by active users (reported separately).
- DAU/WAU, video minutes per user, participant-minutes of voice, GB stored and retransmitted, chargebacks and reports.

**Pilot capacity assumption (not forecast):** 100–300 accounts and 5–10 communities, with upload/voice limits and budget alerts.

## Metrics and evaluation

**Provisional North Star:** weekly users who have at least one meaningful interaction (genuine direct conversation, channel/voice participation, or relevant content interaction), monitored alongside abuse signals.

Track activation, weekly active communities, retention D1/D7/D28 by cohort, DAU/WAU, failed messages, voice participation, reports per 1,000 active users, cost per active user, willingness to pay and (later) subscription churn.

**Internal experimental thresholds, not industry benchmarks:** five weekly-active communities, 30% of sign-ups performing a meaningful action within seven days, and 25% of activated users returning in week four. Reassess after research.

## Risks and safeguards

- **Network effects and empty feed:** small niche, invited active communities, scheduled events.
- **Privacy, moderation and safety:** server-side authorization, blocks, reports, content removal, role enforcement and anti-spam.
- **Video/audio costs:** quotas, cost dashboards, usage alerts, tested provider quotes.
- **Legal/compliance:** Brazilian LGPD and applicable international laws, intellectual property claims, minors policy and brand clearance to be assessed before expansion.
- **Security:** no end-to-end encryption claim without a reviewed implementation.
- **Too much scope:** staged releases, modular implementation, explicit non-goals.

## Decision gates

**Discovery → build:** repeated user problem and credible pilot interest. **MVP → pilot:** reliable critical flows, moderation and budget controls. **Pilot → wider beta:** signs of recurring value and manageable costs. **Beta → monetization:** evidence of willingness to pay and compliance readiness.

This is an exploratory document, **not a revenue forecast, legal opinion, or independent market study**.
