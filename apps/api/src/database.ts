import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import type { Config } from './config.js'
import { accounts, sessions, users, verifications } from './schema.js'
import { sendAccountEmail, type VerificationEmail } from './email.js'

export function connect(config: Config, deliverEmail?: (email: VerificationEmail) => Promise<void>) {
  const pool = new Pool({ connectionString: config.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000 })
  const realtimePool = new Pool({ connectionString: config.REALTIME_DATABASE_URL ?? config.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 })
  realtimePool.on('error', () => console.error('The realtime PostgreSQL connection closed unexpectedly.'))
  pool.on('error', () => console.error('An idle PostgreSQL connection closed unexpectedly.'))
  const db = drizzle(pool)
  const auth = betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg', schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    baseURL: config.WEB_ORIGIN,
    secret: config.AUTH_SECRET,
    user: { additionalFields: { handle: { type: 'string', required: false, input: true } } },
    emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128 },
    emailVerification: {
      expiresIn: 3600,
      sendOnSignUp: Boolean(deliverEmail || (config.RESEND_API_KEY && config.AUTH_EMAIL_FROM)),
      sendVerificationEmail: async ({ user, url }) => {
        const email = { to: user.email, url }
        if (deliverEmail) await deliverEmail(email)
        else await sendAccountEmail(config, email)
      },
    },
    advanced: {
      cookiePrefix: 'uorqui-workplace',
      ipAddress: { ipAddressHeaders: ['uorqui-client-ip'] },
    },
    rateLimit: { enabled: true },
  })
  return { pool, realtimePool, db, auth, emailAvailable: Boolean(deliverEmail || (config.RESEND_API_KEY && config.AUTH_EMAIL_FROM)) }
}

export type Services = ReturnType<typeof connect>
