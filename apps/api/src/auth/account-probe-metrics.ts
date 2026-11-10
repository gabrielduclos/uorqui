import { createHmac } from 'node:crypto';

export type AccountProbeSummary = {
  periodSeconds: number;
  requests: number;
  accounts: number;
  anonymous: number;
  maximumPerAccount: number;
  averagePerAccount: number;
  busiestAccounts: Array<{ key: string; requests: number }>;
};

/**
 * Server-side, bounded-memory, per-process count of /api/v1/me reads.
 * Account IDs are HMAC-pseudonymized; no IP, email, cookie or session token
 * ever enters the counter or the logs. This measures real requests, not
 * frontend renders, and uses one aggregate log line per minute.
 */
export class AccountProbeMeter {
  private readonly counts = new Map<string, number>();
  private anonymous = 0;
  private startedAt: number;

  constructor(private readonly secret: string | undefined, now = Date.now()) {
    this.startedAt = now;
  }

  record(userId: string | null): void {
    if (!userId || !this.secret || this.secret.length < 32) {
      ++this.anonymous;
      return;
    }
    const key = createHmac('sha256', this.secret)
      .update('uorqui-account-probe-v1\n' + userId)
      .digest('hex')
      .slice(0, 12);
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }

  drain(now = Date.now()): AccountProbeSummary | null {
    const rows = [...this.counts.entries()]
      .map(([key, requests]) => ({ key, requests }))
      .sort((a, b) => b.requests - a.requests);
    const authenticatedRequests = rows.reduce((sum, row) => sum + row.requests, 0);
    const requests = authenticatedRequests + this.anonymous;
    const result: AccountProbeSummary | null = requests ? {
      periodSeconds: Math.max(1, Math.round((now - this.startedAt) / 1000)),
      requests,
      accounts: rows.length,
      anonymous: this.anonymous,
      maximumPerAccount: rows[0]?.requests ?? 0,
      averagePerAccount: rows.length
        ? Math.round((authenticatedRequests / rows.length) * 10) / 10 : 0,
      busiestAccounts: rows.slice(0, 5),
    } : null;
    this.counts.clear();
    this.anonymous = 0;
    this.startedAt = now;
    return result;
  }
}
