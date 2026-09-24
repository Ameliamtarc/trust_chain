import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/env.js';
import { ChallengeStore } from './auth/challenge-store.js';
import { RoleReader } from './chain/role-reader.js';
import { EvidenceService } from './evidence/service.js';
import { registerEvidenceRoutes } from './routes/evidence.js';

const app = Fastify({
  logger: { level: process.env.NODE_ENV === 'production' ? 'warn' : 'info' },
  bodyLimit: 16 * 1024,
  disableRequestLogging: true,
});

await app.register(rateLimit, { max: 30, timeWindow: '1 minute' });
app.get('/health', async () => ({ status: 'ok', service: 'proof-of-aid-local-evidence-api' }));

const evidence = new EvidenceService(new RoleReader());
await evidence.initialize();
registerEvidenceRoutes(app, evidence, new ChallengeStore());

app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error, route: request.routeOptions.url }, 'Request failed');
  return reply.code(500).send({ error: 'Internal server error' });
});

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
