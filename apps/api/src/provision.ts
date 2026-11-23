import { text } from 'node:stream/consumers'
import { z } from 'zod'
import { connect } from './database.js'
import { readConfig } from './config.js'

const input = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  name: z.string().trim().min(1).max(80),
  handle: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/),
  password: z.string().min(8).max(128),
}).safeParse({ email: process.argv[2], name: process.argv[3], handle: process.argv[4], password: (await text(process.stdin)).replace(/\r?\n$/, '') })

if (!input.success) {
  console.error('Provide an email, display name and public handle as arguments and an 8–128 character password via stdin.')
  process.exit(1)
}

const { pool, auth } = connect(readConfig())
try {
  await auth.api.signUpEmail({ body: input.data })
  console.log('Account provisioned.')
} catch {
  console.error('Account provisioning failed. Check the database migration and whether the email already exists.')
  process.exitCode = 1
} finally {
  await pool.end()
}
