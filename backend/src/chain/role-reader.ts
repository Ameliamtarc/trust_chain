import {
  createPublicClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { config } from '../config/env.js';
import type { EvidenceRole } from '../evidence/registry.js';

const roleRegistryAbi = [{
  type: 'function',
  name: 'hasRole',
  stateMutability: 'view',
  inputs: [{ name: 'role', type: 'bytes32' }, { name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'bool' }],
}] as const;

const chain = config.chainId === arbitrumSepolia.id
  ? arbitrumSepolia
  : { ...arbitrumSepolia, id: config.chainId };

export class RoleReader {
  private readonly client: PublicClient;
  private readonly roleIds: Record<EvidenceRole, Hex>;

  constructor() {
    this.client = createPublicClient({ chain, transport: http(config.rpcUrl) });
    this.roleIds = {
      organizer: config.roles.organizer,
      safeguardingVerifier: config.roles.safeguardingVerifier,
      auditor: config.roles.auditor,
      arbitrator: config.roles.arbitrator,
    };
  }

  async hasAnyRole(wallet: Address, roles: readonly EvidenceRole[]): Promise<EvidenceRole | undefined> {
    const results = await Promise.all(roles.map(async (role) => {
      const allowed = await this.client.readContract({
        address: config.registryAddress,
        abi: roleRegistryAbi,
        functionName: 'hasRole',
        args: [this.roleIds[role], wallet],
      });
      return allowed ? role : undefined;
    }));
    return results.find((role) => role !== undefined);
  }
}
