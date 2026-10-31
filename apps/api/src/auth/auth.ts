import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { authPolicy } from './auth-policy.js';
import { createDatabase } from '../db/client.js';
import * as authSchema from '../db/auth-schema.js';
import { isDevelopmentSignupEnabled } from './registration.js';

function buildAuth() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('AUTH_SECRET must be at least 32 bytes');
  }

  const baseURL = process.env.AUTH_BASE_URL ?? 'http://localhost:3001';
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && (new URL(baseURL).protocol !== 'https:' || new URL(webOrigin).protocol !== 'https:')) {
    throw new Error('HTTPS auth origins are required for production');
  }

  return betterAuth({
    ...authPolicy,
    database: drizzleAdapter(createDatabase(), {
      provider: 'pg',
      schema: authSchema,
    }),
    secret,
    baseURL,
    trustedOrigins: [webOrigin],
    emailAndPassword: {
      ...authPolicy.emailAndPassword,
      // No email-verification/reset provider has been configured yet.
      // Disable public registrations until that work is finished.
      disableSignUp: !isDevelopmentSignupEnabled(),
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      enabled: true,
      storage: 'memory',
      window: 60,
      max: 60,
    },
  });
}

let instance: ReturnType<typeof buildAuth> | undefined;

export function getAuth() {
  if (!instance) instance = buildAuth();
  return instance;
}
