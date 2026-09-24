import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/env.js';
import { EscrowReader } from './chain/escrow-reader.js';
import { RoleReader } from './chain/role-reader.js';
import { initializeProjectCatalog, findChainProjectId } from './projects/catalog.js';
import { registerProjectRoutes } from './routes/projects.js';

const app = Fastify({ logger: { level: process.env.NODE_ENV === 'production' ? 'warn' : 'info' }, bodyLimit: 16 * 1024, disableRequestLogging: true });
await app.register(rateLimit, { max: 30, timeWindow: '1 minute' });
await initializeProjectCatalog();
const escrow = new EscrowReader();
const roles = new RoleReader();
registerProjectRoutes(app, escrow, roles);
app.get('/health', async () => ({ status: 'ok', service: 'proof-of-aid-api' }));
app.get('/', async () => ({
  service: 'proof-of-aid-api',
  health: '/health',
  endpoints: ['/api/v1/projects', '/api/v1/projects/:slug', '/api/v1/chain/projects/:id'],
}));
app.get('/api/v1/projects/:projectId/chain-id', async (request, reply) => {
  const id = (request.params as { projectId: string }).projectId;
  const chainProjectId = findChainProjectId(id);
  if (!chainProjectId) return reply.code(404).send({ error: 'Project is not linked to an on-chain project' });
  return { chainProjectId: chainProjectId.toString(), chainId: config.chainId };
});
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
