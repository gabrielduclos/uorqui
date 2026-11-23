import type { Config } from './config.js'

export interface VerificationEmail { to: string; url: string }

export async function sendAccountEmail(config: Config, email: VerificationEmail) {
  if (!config.RESEND_API_KEY || !config.AUTH_EMAIL_FROM) throw new Error('Email is not configured')
  // Keep credentials, recipients and verification tokens out of logs.
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: config.AUTH_EMAIL_FROM, to: [email.to],
      subject: 'Uorqui — Confirme seu e-mail / Verify your email',
      text: `Confirme seu e-mail no Uorqui. O link vence em 1 hora.\nVerify your Uorqui email. This link expires in 1 hour.\n\n${email.url}\n\nSe você não solicitou, ignore este e-mail. / If you did not request this, ignore this email.` }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error('Email delivery failed')
}
