import { allowedWebOrigins } from './web-origins.js';

/**
 * Public registration is opt-in. Never allow production signups unless both
 * outbound verification email and a server-validated anti-bot challenge exist.
 * Local/CI registration is isolated from the production Neon database.
 */
export function isDevelopmentSignupEnabled(): boolean {
  return (
    (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') &&
    process.env.ENABLE_DEV_SIGNUP === 'true'
  );
}

export function isPublicSignupEnabled(): boolean {
  return process.env.NODE_ENV === 'production'
    && process.env.ENABLE_PUBLIC_SIGNUP === 'true'
    && Boolean(process.env.RESEND_API_KEY?.trim())
    && Boolean(process.env.AUTH_EMAIL_FROM?.trim())
    && Boolean(process.env.TURNSTILE_SITE_KEY?.trim())
    && Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());
}

export function isRegistrationAvailable(): boolean {
  return isDevelopmentSignupEnabled() || isPublicSignupEnabled();
}

export async function verifyRegistrationChallenge(token: string, remoteIp?: string): Promise<boolean> {
  if (!isPublicSignupEnabled() || !token || token.length > 2048) return false;
  const body = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET_KEY!,
    response: token,
    ...(remoteIp ? { remoteip: remoteIp } : {}),
  });
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return false;
    const data = await response.json() as { success?: boolean; hostname?: string };
    // Hostnames are optional on Turnstile test keys; production must match our public frontend.
    const allowedHosts = new Set(allowedWebOrigins().map(origin => new URL(origin).hostname));
    return data.success === true && typeof data.hostname === 'string' && allowedHosts.has(data.hostname);
  } catch {
    return false;
  }
}
