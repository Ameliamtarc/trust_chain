import { createPublicClient, http, type Address, type Hex } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { config } from '../config/env.js';

const abi = [{ type: 'function', name: 'hasRole', stateMutability: 'view', inputs: [{ name: 'role', type: 'bytes32' }, { name: 'account', type: 'address' }], outputs: [{ name: '', type: 'bool' }] }] as const;
const chain = config.chainId === arbitrumSepolia.id ? arbitrumSepolia : { ...arbitrumSepolia, id: config.chainId };
export type EvidenceRole = 'organizer' | 'safeguardingVerifier' | 'auditor' | 'arbitrator';

export class RoleReader {
  private readonly client = createPublicClient({ chain, transport: http(config.rpcUrl) });
  private readonly ids: Record<EvidenceRole, Hex> = {
    organizer: config.roles.organizer,
    safeguardingVerifier: config.roles.safeguardingVerifier,
    auditor: config.roles.auditor,
    arbitrator: config.roles.arbitrator,
  };

  async hasAnyRole(wallet: Address, roles: readonly EvidenceRole[]): Promise<EvidenceRole | undefined> {
    for (const role of roles) {
      if (await this.client.readContract({ address: config.registryAddress, abi, functionName: 'hasRole', args: [this.ids[role], wallet] })) return role;
    }
    return undefined;
  }
}
