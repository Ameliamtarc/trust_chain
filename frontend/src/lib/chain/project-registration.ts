import { keccak256, toBytes, type Hex } from 'viem';
import { chain, escrowAddress } from './config';

export interface ProjectMetadata {
  id: string;
  name: string;
  organization: string;
  summary: string;
  focusAreas: string[];
  milestones: Array<{ id: string; title: string; description: string }>;
}

export function registrationMessage(metadata: ProjectMetadata, projectId: bigint, transactionHash: Hex): string {
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
    `Chain ID: ${chain.id}`,
    `Escrow: ${escrowAddress.toLowerCase()}`,
    `Project ID: ${projectId}`,
    `Transaction: ${transactionHash.toLowerCase()}`,
    `Metadata hash: ${keccak256(toBytes(canonicalMetadata))}`,
  ].join('\n');
}
