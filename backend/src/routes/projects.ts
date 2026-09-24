import { isHex, verifyMessage, type Hex } from 'viem';
import type { FastifyInstance } from 'fastify';
import { findPublicProject, listPublicProjects } from '../projects/catalog.js';
import { listPublicEvidence } from '../evidence/registry.js';
import { EscrowReader } from '../chain/escrow-reader.js';
import { config } from '../config/env.js';
import { registerProject } from '../projects/catalog.js';
import { RoleReader } from '../chain/role-reader.js';
import { projectRegistrationMessage } from '../projects/registration-message.js';

export function registerProjectRoutes(app: FastifyInstance, escrow: EscrowReader, roles: RoleReader): void {
  app.route<{ Body: {
    id: string; name: string; organization: string; summary: string;
    focusAreas: string[]; milestones: Array<{ id: string; title: string; description: string }>;
    transactionHash: string; signature: string;
  } }>({
    method: 'POST',
    url: '/api/v1/projects',
    schema: {
      body: {
        type: 'object', additionalProperties: false,
        required: ['id', 'name', 'organization', 'summary', 'focusAreas', 'milestones', 'transactionHash', 'signature'],
        properties: {
          id: { type: 'string', pattern: '^[a-z0-9-]{1,80}$' },
          name: { type: 'string', minLength: 3, maxLength: 120 },
          organization: { type: 'string', minLength: 2, maxLength: 120 },
          summary: { type: 'string', minLength: 10, maxLength: 600 },
          focusAreas: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string', minLength: 2, maxLength: 120 } },
          milestones: {
            type: 'array', minItems: 1, maxItems: 8,
            items: {
              type: 'object', additionalProperties: false, required: ['id', 'title', 'description'],
              properties: {
                id: { type: 'string', pattern: '^[a-z0-9-]{1,40}$' },
                title: { type: 'string', minLength: 2, maxLength: 100 },
                description: { type: 'string', minLength: 5, maxLength: 300 },
              },
            },
          },
          transactionHash: { type: 'string', pattern: '^0x[a-fA-F0-9]{64}$' },
          signature: { type: 'string', pattern: '^0x([a-fA-F0-9]{2})+$', maxLength: 200 },
        },
      },
    },
    handler: async (request, reply) => {
      const body = request.body;
      if (!isHex(body.transactionHash, { strict: true }) || body.transactionHash.length !== 66) return reply.code(400).send({ error: 'Invalid transaction hash' });
      if (new Set(body.milestones.map((milestone) => milestone.id)).size !== body.milestones.length) {
        return reply.code(400).send({ error: 'Milestone IDs must be unique' });
      }
      try {
        const created = await escrow.verifyProjectCreation(body.transactionHash as Hex, body.milestones.length);
        if (!created) return reply.code(422).send({ error: 'Transaction does not create a matching project in the configured escrow' });
        const metadata = {
          id: body.id,
          name: body.name,
          organization: body.organization,
          summary: body.summary,
          focusAreas: body.focusAreas,
          milestones: body.milestones,
        };
        const message = projectRegistrationMessage(metadata, created.projectId, body.transactionHash as Hex);
        let signatureValid = false;
        try {
          signatureValid = await verifyMessage({ address: created.organizer, message, signature: body.signature as Hex });
        } catch {
          signatureValid = false;
        }
        if (!signatureValid) return reply.code(401).send({ error: 'Organizer signature does not match the project metadata' });
        const organizerRole = await roles.hasAnyRole(created.organizer, ['organizer']);
        if (organizerRole !== 'organizer') return reply.code(403).send({ error: 'Project creator is not an authorized organizer' });
        const project = await registerProject(metadata, created.projectId);
        return reply.code(201).send({ project, chainId: config.chainId });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Project registration failed';
        if (message.includes('already exists') || message.includes('already linked')) {
          return reply.code(409).send({ error: message });
        }
        request.log.error({ err: error }, 'Project registration failed');
        return reply.code(503).send({ error: 'Project registration temporarily unavailable' });
      }
    },
  });

  app.route<{ Params: { projectId: string } }>({
    method: 'GET',
    url: '/api/v1/chain/projects/:projectId',
    schema: { params: { type: 'object', additionalProperties: false, required: ['projectId'], properties: { projectId: { type: 'string', pattern: '^[1-9][0-9]{0,77}$' } } } },
    handler: async (request, reply) => {
      try {
        const project = await escrow.readProject(BigInt(request.params.projectId));
        if (!project) return reply.code(404).send({ error: 'On-chain project not found' });
        reply.header('cache-control', 'public, max-age=15');
        return { project, chainId: config.chainId };
      } catch (error) {
        request.log.error({ err: error, projectId: request.params.projectId }, 'On-chain project read failed');
        return reply.code(503).send({ error: 'Blockchain data temporarily unavailable' });
      }
    },
  });

  app.get('/api/v1/projects', async (_request, reply) => {
    reply.header('cache-control', 'public, max-age=60');
    return { projects: listPublicProjects() };
  });

  app.route<{ Params: { projectId: string } }>({
    method: 'GET',
    url: '/api/v1/projects/:projectId',
    schema: { params: { type: 'object', additionalProperties: false, required: ['projectId'], properties: { projectId: { type: 'string', pattern: '^[a-z0-9-]{1,80}$' } } } },
    handler: async (request, reply) => {
    const project = findPublicProject(request.params.projectId);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    reply.header('cache-control', 'public, max-age=60');
    return { project };
    },
  });
  app.route<{ Params: { projectId: string } }>({
    method: 'GET',
    url: '/api/v1/projects/:projectId/evidence',
    schema: { params: { type: 'object', additionalProperties: false, required: ['projectId'], properties: { projectId: { type: 'string', pattern: '^[a-z0-9-]{1,80}$' } } } },
    handler: async (request, reply) => {
      const project = findPublicProject(request.params.projectId);
      if (!project) return reply.code(404).send({ error: 'Project not found' });
      reply.header('cache-control', 'public, max-age=60');
      return { evidence: listPublicEvidence(project.id) };
    },
  });

}
