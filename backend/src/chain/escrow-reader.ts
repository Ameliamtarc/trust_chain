import {
  createPublicClient,
  decodeEventLog,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { config } from '../config/env.js';

const escrowAbi = [
  {
    type: 'function', name: 'nextProjectId', stateMutability: 'view', inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'getProject', stateMutability: 'view',
    inputs: [{ name: 'projectId', type: 'uint256' }],
    outputs: [
      { name: 'organizer', type: 'address' }, { name: 'arbitrator', type: 'address' },
      { name: 'target', type: 'uint256' }, { name: 'totalDonated', type: 'uint256' },
      { name: 'totalReleased', type: 'uint256' }, { name: 'totalRefunded', type: 'uint256' },
      { name: 'milestoneCount', type: 'uint8' }, { name: 'currentMilestone', type: 'uint8' },
      { name: 'status', type: 'uint8' },
    ],
  },
  {
    type: 'function', name: 'getMilestone', stateMutability: 'view',
    inputs: [{ name: 'projectId', type: 'uint256' }, { name: 'milestoneId', type: 'uint8' }],
    outputs: [
      { name: 'budget', type: 'uint256' }, { name: 'fundingStart', type: 'uint256' },
      { name: 'evidenceDeadline', type: 'uint64' }, { name: 'status', type: 'uint8' },
      { name: 'evidenceHash', type: 'bytes32' },
    ],
  },
  {
    type: 'function', name: 'getRequiredRoles', stateMutability: 'view',
    inputs: [{ name: 'projectId', type: 'uint256' }, { name: 'milestoneId', type: 'uint8' }],
    outputs: [{ name: '', type: 'bytes32[]' }],
  },
] as const;

const projectCreatedAbi = [{
  type: 'event', name: 'ProjectCreated', anonymous: false,
  inputs: [
    { name: 'projectId', type: 'uint256', indexed: true },
    { name: 'organizer', type: 'address', indexed: true },
    { name: 'arbitrator', type: 'address', indexed: true },
    { name: 'target', type: 'uint256', indexed: false },
    { name: 'milestoneCount', type: 'uint8', indexed: false },
  ],
}] as const;

const projectStatuses = ['funding', 'active', 'disputed', 'overdue', 'failed', 'completed'] as const;
const milestoneStatuses = ['locked', 'released', 'evidence_submitted', 'verified', 'disputed', 'overdue'] as const;
const chain = config.chainId === arbitrumSepolia.id
  ? arbitrumSepolia
  : { ...arbitrumSepolia, id: config.chainId };

export interface MilestoneAccessState {
  projectStatus: number;
  milestoneStatus: number;
  evidenceHash: Hex;
  requiredRoles: readonly Hex[];
}

export class EscrowReader {
  private readonly client: PublicClient;

  constructor() {
    this.client = createPublicClient({ chain, transport: http(config.rpcUrl) });
  }

  async milestoneAccess(projectId: bigint, milestoneIndex: number): Promise<MilestoneAccessState> {
    const [project, milestone, requiredRoles] = await Promise.all([
      this.client.readContract({ address: config.escrowAddress, abi: escrowAbi, functionName: 'getProject', args: [projectId] }),
      this.client.readContract({ address: config.escrowAddress, abi: escrowAbi, functionName: 'getMilestone', args: [projectId, milestoneIndex] }),
      this.client.readContract({ address: config.escrowAddress, abi: escrowAbi, functionName: 'getRequiredRoles', args: [projectId, milestoneIndex] }),
    ]);
    return {
      projectStatus: Number(project[8]),
      milestoneStatus: Number(milestone[3]),
      evidenceHash: milestone[4],
      requiredRoles,
    };
  }

  async verifyProjectCreation(transactionHash: Hex, expectedMilestoneCount: number): Promise<{
    projectId: bigint;
    organizer: Address;
  } | undefined> {
    const [receipt, transaction] = await Promise.all([
      this.client.waitForTransactionReceipt({ hash: transactionHash }),
      this.client.getTransaction({ hash: transactionHash }),
    ]);
    if (receipt.status !== 'success' || transaction.to?.toLowerCase() !== config.escrowAddress.toLowerCase()) return undefined;

    const log = receipt.logs.find((candidate) => {
      if (candidate.address.toLowerCase() !== config.escrowAddress.toLowerCase()) return false;
      try {
        const decoded = decodeEventLog({ abi: projectCreatedAbi, data: candidate.data, topics: candidate.topics });
        return decoded.eventName === 'ProjectCreated';
      } catch {
        return false;
      }
    });
    if (!log) return undefined;
    const decoded = decodeEventLog({ abi: projectCreatedAbi, data: log.data, topics: log.topics });
    const { projectId, organizer, milestoneCount } = decoded.args;
    if (organizer.toLowerCase() !== transaction.from.toLowerCase() || Number(milestoneCount) !== expectedMilestoneCount) return undefined;
    const onChainProject = await this.readProject(projectId);
    if (!onChainProject || onChainProject.organizer.toLowerCase() !== transaction.from.toLowerCase()) return undefined;
    return { projectId, organizer: transaction.from };
  }

  async readProject(projectId: bigint): Promise<{
    id: string;
    organizer: Address;
    arbitrator: Address;
    target: string;
    totalDonated: string;
    totalReleased: string;
    totalRefunded: string;
    currentMilestone: number;
    status: string;
    milestones: Array<{
      id: number;
      budget: string;
      fundingStart: string;
      evidenceDeadline: string;
      status: string;
      evidenceHash: Hex;
      requiredRoles: readonly Hex[];
    }>;
  } | undefined> {
    if (projectId < 1n) return undefined;
    const nextProjectId = await this.client.readContract({
      address: config.escrowAddress,
      abi: escrowAbi,
      functionName: 'nextProjectId',
    });
    if (projectId >= nextProjectId) return undefined;

    const project = await this.client.readContract({
      address: config.escrowAddress,
      abi: escrowAbi,
      functionName: 'getProject',
      args: [projectId],
    });
    const milestoneCount = Number(project[6]);
    const milestones = await Promise.all(Array.from({ length: milestoneCount }, async (_, id) => {
      const [milestone, requiredRoles] = await Promise.all([
        this.client.readContract({ address: config.escrowAddress, abi: escrowAbi, functionName: 'getMilestone', args: [projectId, id] }),
        this.client.readContract({ address: config.escrowAddress, abi: escrowAbi, functionName: 'getRequiredRoles', args: [projectId, id] }),
      ]);
      return {
        id,
        budget: milestone[0].toString(),
        fundingStart: milestone[1].toString(),
        evidenceDeadline: milestone[2].toString(),
        status: milestoneStatuses[Number(milestone[3])] ?? 'unknown',
        evidenceHash: milestone[4],
        requiredRoles,
      };
    }));

    return {
      id: projectId.toString(),
      organizer: project[0],
      arbitrator: project[1],
      target: project[2].toString(),
      totalDonated: project[3].toString(),
      totalReleased: project[4].toString(),
      totalRefunded: project[5].toString(),
      currentMilestone: Number(project[7]),
      status: projectStatuses[Number(project[8])] ?? 'unknown',
      milestones,
    };
  }
}
