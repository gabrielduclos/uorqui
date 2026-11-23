import 'dotenv/config'
import { z } from 'zod'

const settings = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  WEB_ORIGIN: z.url().transform((value) => new URL(value).origin),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
})

export function readConfig() {
  const parsed = settings.safeParse(process.env)
  if (!parsed.success) {
    const invalid = parsed.error.issues.map((issue) => issue.path.join('.'))
    throw new Error(`Missing or invalid configuration: ${invalid.join(', ')}`)
  }
  return parsed.data
}

export type Config = ReturnType<typeof readConfig>
