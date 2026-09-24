import { keccak256, toBytes, type Hex } from 'viem';
import { config } from '../config/env.js';
import type { NewProjectMetadata } from './catalog.js';

export function projectRegistrationMessage(
  metadata: NewProjectMetadata,
  projectId: bigint,
  transactionHash: Hex,
): string {
  const canonicalMetadata = JSON.stringify({
    id: metadata.id,
    name: metadata.name,
    organization: metadata.organization,
    summary: metadata.summary,
    focusAreas: metadata.focusAreas,
    milestones: metadata.milestones.map(({ id, title, description }) => ({ id, title, description })),
  });
  return [
    'Proof of Aid project metadata registration',
    `Chain ID: ${config.chainId}`,
    `Escrow: ${config.escrowAddress.toLowerCase()}`,
    `Project ID: ${projectId}`,
    `Transaction: ${transactionHash.toLowerCase()}`,
    `Metadata hash: ${keccak256(toBytes(canonicalMetadata))}`,
  ].join('\n');
}
