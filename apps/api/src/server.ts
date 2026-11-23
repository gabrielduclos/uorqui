import { createApp } from './app.js'
import { readConfig } from './config.js'

const config = readConfig()
const app = await createApp(config)
await app.listen({ host: '0.0.0.0', port: config.PORT })

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.close().catch(() => {
      process.exitCode = 1
    })
  })
}
