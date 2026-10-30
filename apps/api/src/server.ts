import Fastify from 'fastify';
import cors from '@fastify/cors';

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
});

app.get('/health', async () => ({
  ok: true,
  service: 'uorqui-api',
  // This endpoint intentionally does not claim database connectivity.
  database: 'not_checked',
}));

app.get('/api/v1/status', async () => ({
  project: 'uorqui',
  stage: 'scaffold',
  featuresEnabled: [],
}));

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error('Invalid PORT');
}

try {
  await app.listen({ port, host: '127.0.0.1' });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
