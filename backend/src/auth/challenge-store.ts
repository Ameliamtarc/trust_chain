import { randomBytes } from 'node:crypto';

export interface Challenge {
  id: string;
  evidenceId: string;
  wallet: string;
  chainId: number;
  message: string;
  expiresAt: number;
}

export class ChallengeStore {
  private readonly entries = new Map<string, Challenge>();

  issue(input: Omit<Challenge, 'id' | 'message'>, ttlSeconds: number): Challenge {
    this.prune();
    const id = randomBytes(32).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const message = [
      'Proof of Aid local evidence access',
      `Action: access evidence ${input.evidenceId}`,
      `Wallet: ${input.wallet}`,
      `Chain ID: ${input.chainId}`,
      `Nonce: ${id}`,
      `Issued At: ${new Date().toISOString()}`,
      `Expiration Time: ${new Date(expiresAt * 1000).toISOString()}`,
      'This signature grants access only to this evidence item and cannot authorize a blockchain transaction.',
    ].join('\n');
    const challenge = { ...input, id, message, expiresAt };
    this.entries.set(id, challenge);
    return challenge;
  }

  consume(id: string): Challenge | undefined {
    const challenge = this.entries.get(id);
    this.entries.delete(id);
    if (!challenge || challenge.expiresAt <= Math.floor(Date.now() / 1000)) return undefined;
    return challenge;
  }

  private prune(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [id, item] of this.entries) if (item.expiresAt <= now) this.entries.delete(id);
  }
}
