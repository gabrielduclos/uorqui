# Cloudflare API rate-limit incident note — Uorqui

[English](cloudflare-rate-limiting.md) · [Português](../pt-BR/cloudflare-rate-limiting.md)

**Current state (checked November 10, 2026): DISABLED.** No active custom `http_ratelimit` rule remains in the `uorqui.app` zone. This is an infrastructure setting managed in the Cloudflare dashboard/API, **not** a toggle deployed from Git.

## Historical rule (preserved, not executing)

| Setting | Value |
| --- | --- |
| Rule name | Uorqui API — limite por IP |
| Phase | `http_ratelimit` |
| **Enabled** | **False (disabled November 10, 2026)** |
| Former action | Block with HTTP 429 |
| Former threshold | 120 requests / 10 seconds per public IP and Cloudflare colo |
| Former block period | 10 seconds |
| Ruleset ID | `4140c7da5580456aa1d69c48c18b638d` |
| Rule ID | `5d2e82e42e424683949333278747eb8e` |

Historical match expression:

```text
(starts_with(http.request.uri.path, "/api/") and http.request.uri.path ne "/api/v1/status" and http.request.uri.path ne "/api/v1/dm/events" and http.request.uri.path ne "/api/v1/communities/events")
```

The rule was **created after the initial 429 reports** and therefore cannot explain the earliest failures. Its IP-based counters could nevertheless block legitimate users sharing one Wi-Fi/public NAT address. It was disabled as a controlled diagnostic step, **not** because Uorqui no longer requires abuse protection.

## What remains protected

- Cloudflare's DDoS and existing managed security protections are unchanged.
- Fastify/Better Auth authentication safeguards and application-level controls still apply. Those can independently return 429.
- Render may apply its own inbound service limits; an HTTP 429 is **not necessarily from Cloudflare**.

## Diagnose a new HTTP 429

1. Use browser `window.__uorquiRateLimitDiagnostics()` and `window.__uorquiAuthDiagnostics()` (available in beta.36) to inspect sanitized, current-tab evidence.
2. `x-uorqui-upstream-429: 1` indicates a response forwarded from the API origin by the Worker; its absence alone does **not** prove a Cloudflare block.
3. Check Cloudflare Security Events, Render logs, `x-uorqui-rate-limit-scope` where present, and Better Auth behavior. Correlate time and request route; don't assume a shared IP is one user.
4. If the API genuinely needs a new edge rule, scope it to sensitive routes and test with several users on one public IP rather than re-enabling the former blanket rule by default.

**Operational reminder:** reverting a Git commit does not change this remote Cloudflare setting. Verify the dashboard before claiming the rule is enabled/disabled. See [changelog](../../CHANGELOG.md) and [portfolio case study](portfolio.md).

[Cloudflare rate limiting documentation](https://developers.cloudflare.com/waf/rate-limiting-rules/).
