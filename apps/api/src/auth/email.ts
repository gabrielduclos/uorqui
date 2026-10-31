/**
 * Server-side transactional email. Requires a verified sender at Resend.
 * Never expose RESEND_API_KEY or email verification URLs in logs.
 */
export async function sendAccountEmail(to: string, subject: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  if (!apiKey || !from) throw new Error('Transactional email is not configured');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
    signal: AbortSignal.timeout(10000),
  });
  // Do not log the provider response: it may contain recipient details.
  if (!response.ok) throw new Error('Transactional email delivery failed');
}
