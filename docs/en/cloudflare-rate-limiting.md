# Uorqui Cloudflare rate limiting

**Live in production since November 10, 2026** on `uorqui.app`, Cloudflare **Free** zone.

## Active rule

| Setting | Value |
| --- | --- |
| Name | Uorqui API — limite por IP |
| Phase | `http_ratelimit` |
| Action | `block` (default HTTP 429 response) |
| Threshold | 120 requests per IP per 10 seconds |
| Mitigation | 10 seconds |
| Characteristics | `cf.colo.id` and `ip.src` |
| Cloudflare Ruleset ID | `4140c7da5580456aa1d69c48c18b638d` |
| Rule ID | `5d2e82e42e424683949333278747eb8e` |
| Reference | `uorqui_api_per_ip_burst_limit_v1` |

Expression:

```text
(starts_with(http.request.uri.path, "/api/") and http.request.uri.path ne "/api/v1/status" and http.request.uri.path ne "/api/v1/dm/events" and http.request.uri.path ne "/api/v1/communities/events")
```

Matches `/api/*`, including authentication, email, and chat commands. The public status endpoint and both direct-message/community SSE transports are deliberately excluded. `/health` and `/health/*` do not match the `/api/*` prefix.

Rate counters are **per source IP and Cloudflare data center**, not an exact globally shared quota. Company networks sharing a public IP may hit the threshold more easily. Cloudflare Free supports one rate limiting rule with a 10-second counting period and a 10-second blocking period.

## Operations

1. Check or update the rule under **Cloudflare → uorqui.app → Security → Security rules → Rate limiting rules**.
2. On 429 responses, `x-uorqui-upstream-429: 1` means the Uorqui Worker **forwarded an upstream 429**. If absent, inspect Cloudflare security events before attributing the cause.
3. This limits abnormal API request bursts but **cannot fix Render-side quota exhaustion, provider throttling, or upstream failures**.
4. If legitimate users are blocked, adjust the threshold or disable **only this rule**, leaving the existing WAF, DDoS, and authentication protections untouched.
5. Monitor shared-NAT organizations, bulk media uploads, sign-in, messages, mail, and SSE behavior.

**Documentation version:** `0.1.0-beta.32`. This is a **remote Cloudflare configuration**; reverting Git commits does not remove or roll back the rule. See the [changelog](../../CHANGELOG.md).

Reference: [Cloudflare rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/).
