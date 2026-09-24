export const escrowAbi = [
  { type: 'function', name: 'donate', stateMutability: 'nonpayable', inputs: [{ name: 'projectId', type: 'uint256' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'openDonorDispute', stateMutability: 'nonpayable', inputs: [{ name: 'projectId', type: 'uint256' }, { name: 'reasonCode', type: 'bytes32' }], outputs: [] },
  { type: 'function', name: 'claimableRefund', stateMutability: 'view', inputs: [{ name: 'projectId', type: 'uint256' }, { name: 'donor', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'claimRefund', stateMutability: 'nonpayable', inputs: [{ name: 'projectId', type: 'uint256' }], outputs: [{ name: 'amount', type: 'uint256' }] },
  { type: 'function', name: 'submitMilestoneEvidence', stateMutability: 'nonpayable', inputs: [{ name: 'projectId', type: 'uint256' }, { name: 'milestoneId', type: 'uint8' }, { name: 'evidenceHash', type: 'bytes32' }], outputs: [] },
  { type: 'function', name: 'confirmMilestone', stateMutability: 'nonpayable', inputs: [{ name: 'projectId', type: 'uint256' }, { name: 'milestoneId', type: 'uint8' }, { name: 'role', type: 'bytes32' }], outputs: [] },
  { type: 'function', name: 'submitSupportCostProof', stateMutability: 'nonpayable', inputs: [
    { name: 'projectId', type: 'uint256' }, { name: 'milestoneId', type: 'uint8' }, { name: 'commitment', type: 'bytes32' },
    { name: 'proof', type: 'tuple', components: [
      { name: 'a', type: 'uint256[2]' }, { name: 'b', type: 'uint256[2][2]' }, { name: 'c', type: 'uint256[2]' },
    ] },
    { name: 'auditor', type: 'address' }, { name: 'auditorSignature', type: 'bytes' },
  ], outputs: [] },
  {
    type: 'function', name: 'createProject', stateMutability: 'nonpayable',
    inputs: [{
      name: 'params', type: 'tuple', components: [
        { name: 'arbitrator', type: 'address' },
        { name: 'budgets', type: 'uint256[]' },
        { name: 'requiredRoles', type: 'bytes32[][]' },
        { name: 'requiredCounts', type: 'uint8[][]' },
        { name: 'maxSupportCostBps', type: 'uint16[]' },
        { name: 'evidencePeriod', type: 'uint64' },
        { name: 'refundDelay', type: 'uint64' },
      ],
    }],
    outputs: [{ name: 'projectId', type: 'uint256' }],
  },
  {
    type: 'event', name: 'ProjectCreated', anonymous: false,
    inputs: [
      { name: 'projectId', type: 'uint256', indexed: true },
      { name: 'organizer', type: 'address', indexed: true },
      { name: 'arbitrator', type: 'address', indexed: true },
      { name: 'target', type: 'uint256', indexed: false },
      { name: 'milestoneCount', type: 'uint8', indexed: false },
    ],
  },
] as const;
