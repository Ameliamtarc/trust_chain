import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keccak256, toBytes, type Address } from 'viem';
import { config } from '../config/env.js';
import { evidenceRegistry, type EvidenceItem, type EvidenceRole } from './registry.js';
import { RoleReader } from '../chain/role-reader.js';

const evidenceRoot = resolve(fileURLToPath(config.evidenceDirectory));
const syntheticFixture = Buffer.from([
  'SYNTHETIC DEMO FIXTURE — NOT A REAL NGO POLICY',
  '',
  'Program: child protection comprehensive support (fictional)',
  'Milestone: safeguarding readiness',
  'Attestation: designated safeguarding focal point and staff training process reviewed.',
  'Scope: organizational process only; no child, family, incident, referral, or case data.',
  '',
].join('\n'), 'utf8');

export class EvidenceService {
  constructor(private readonly roles: RoleReader) {}

  async initialize(): Promise<void> {
    await mkdir(evidenceRoot, { recursive: true, mode: 0o700 });
    const fixturePath = resolve(evidenceRoot, 'demo-safeguarding-policy.txt');
    try {
      await writeFile(fixturePath, syntheticFixture, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const current = await readFile(fixturePath);
    if (!current.equals(syntheticFixture)) {
      throw new Error('Synthetic demo evidence fixture was modified; refusing to serve it');
    }
  }

  find(evidenceId: string): EvidenceItem | undefined {
    return evidenceRegistry.get(evidenceId);
  }

  async authorize(wallet: Address, item: EvidenceItem): Promise<EvidenceRole | undefined> {
    const regularRole = await this.roles.hasAnyRole(wallet, item.allowedRoles);
    if (regularRole) return regularRole;
    // Arbitrator access is intentionally unavailable here until the live contract
    // exposes a trustworthy dispute-state read for this exact claim.
    return undefined;
  }

  async read(item: EvidenceItem): Promise<{ bytes: Buffer; hash: `0x${string}` }> {
    const filePath = resolve(evidenceRoot, item.relativePath);
    if (!filePath.startsWith(`${evidenceRoot}${sep}`)) throw new Error('Invalid evidence path');
    const [rootReal, fileReal] = await Promise.all([realpath(evidenceRoot), realpath(filePath)]);
    if (!fileReal.startsWith(`${rootReal}${sep}`)) throw new Error('Invalid evidence path');
    const bytes = await readFile(fileReal);
    if (!bytes.equals(syntheticFixture)) throw new Error('Evidence fixture failed integrity check');
    if (bytes.byteLength > 1_000_000) throw new Error('Evidence file exceeds the local demo limit');
    return { bytes, hash: keccak256(toBytes(bytes)) };
  }
}
