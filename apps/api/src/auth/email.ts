/**
 * Resend transactional email: track only provider acceptance/failures.
 * Never log recipient, email body, verification URLs or API credentials.
 */
export type AuthEmailPurpose = 'verify_email' | 'reset_password';

export async function sendAccountEmail(
  to: string, subject: string, bodyText: string, purpose: AuthEmailPurpose,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  if (!apiKey || !from) {
    console.error(JSON.stringify({ event: 'auth_email_config_missing', purpose }));
    throw new Error('Transactional email is not configured');
  }

  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, text: bodyText }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    console.error(JSON.stringify({ event: 'auth_email_network_failure', purpose }));
    throw new Error('Transactional email delivery failed');
  }

  let payload: unknown;
  try { payload = await response.json(); } catch { payload = null; }

  if (!response.ok) {
    const raw = payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>).name : null;
    const category = typeof raw === 'string' && /^[a-zA-Z_]{1,60}$/.test(raw)
      ? raw : 'unspecified';
    console.error(JSON.stringify({
      event: 'auth_email_rejected', purpose, httpStatus: response.status, category,
    }));
    throw new Error('Transactional email delivery failed');
  }

  const rawId = payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>).id : null;
  const providerId = typeof rawId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(rawId)
    ? rawId : null;
  console.info(JSON.stringify({
    event: 'auth_email_accepted', purpose, providerId,
  }));
  // An HTTP 2xx means Resend accepted the request, not that it reached the inbox.
}
