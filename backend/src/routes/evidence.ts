import { isAddress, isHex, verifyMessage, type Address } from 'viem';
import type { FastifyInstance } from 'fastify';
import { config } from '../config/env.js';
import { ChallengeStore } from '../auth/challenge-store.js';
import { EvidenceService } from '../evidence/service.js';

interface ChallengeBody { wallet: string; chainId: number }
interface AccessBody { challengeId: string; wallet: string; signature: string }

export function registerEvidenceRoutes(app: FastifyInstance, service: EvidenceService, challenges: ChallengeStore): void {
  app.post<{ Params: { evidenceId: string }; Body: ChallengeBody }>('/api/evidence/:evidenceId/challenge', async (request, reply) => {
    const item = service.find(request.params.evidenceId);
    if (!item) return reply.code(404).send({ error: 'Evidence not found' });
    const body = request.body as Partial<ChallengeBody> | undefined;
    const wallet = body?.wallet;
    const chainId = body?.chainId;
    if (typeof wallet !== 'string' || !isAddress(wallet) || chainId !== config.chainId) {
      return reply.code(400).send({ error: 'A valid wallet and configured chainId are required' });
    }
    try {
      await service.read(item);
    } catch {
      return reply.code(404).send({ error: 'Evidence not found' });
    }
    const challenge = challenges.issue({
      evidenceId: item.id,
      wallet: wallet.toLowerCase(),
      chainId,
    }, config.challengeTtlSeconds);
    return reply.send({
      challengeId: challenge.id,
      message: challenge.message,
      expiresAt: challenge.expiresAt,
    });
  });

  app.post<{ Params: { evidenceId: string }; Body: AccessBody }>('/api/evidence/:evidenceId/access', async (request, reply) => {
    const { evidenceId } = request.params;
    const body = request.body as Partial<AccessBody> | undefined;
    const challengeId = body?.challengeId;
    const wallet = body?.wallet;
    const signature = body?.signature;
    if (typeof wallet !== 'string' || !isAddress(wallet) || typeof challengeId !== 'string' ||
        typeof signature !== 'string' || !isHex(signature)) {
      return reply.code(400).send({ error: 'wallet, challengeId and signature are required' });
    }
    const challenge = challenges.consume(challengeId);
    if (!challenge || challenge.evidenceId !== evidenceId || challenge.wallet !== wallet.toLowerCase()) {
      return reply.code(401).send({ error: 'Challenge is invalid, expired, or already used' });
    }
    let validSignature = false;
    try {
      validSignature = await verifyMessage({
        address: wallet as Address,
        message: challenge.message,
        signature,
      });
    } catch {
      validSignature = false;
    }
    if (!validSignature) return reply.code(401).send({ error: 'Wallet signature is invalid' });

    const item = service.find(evidenceId);
    if (!item) return reply.code(404).send({ error: 'Evidence not found' });
    try {
      const role = await service.authorize(wallet as Address, item);
      if (!role) return reply.code(403).send({ error: 'Wallet is not authorized for this evidence' });
      const file = await service.read(item);
      reply.header('content-type', 'text/plain; charset=utf-8');
      reply.header('content-disposition', `attachment; filename="${item.id}.txt"`);
      reply.header('cache-control', 'no-store');
      reply.header('x-content-type-options', 'nosniff');
      reply.header('x-evidence-hash', file.hash);
      reply.header('x-evidence-role', role);
      return reply.send(file.bytes);
    } catch (error) {
      request.log.error({ err: error, evidenceId }, 'Evidence access failed');
      return reply.code(503).send({ error: 'Evidence service temporarily unavailable' });
    }
  });
}
