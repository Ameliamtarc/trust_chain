export type EvidenceRole = 'organizer' | 'safeguardingVerifier' | 'auditor' | 'arbitrator';
export interface EvidenceItem {
  id: string; projectId: string; milestoneId: string; claimId: string;
  category: 'safeguarding-policy-summary'; relativePath: string;
  allowedRoles: readonly EvidenceRole[]; disputeOnlyRoles: readonly EvidenceRole[];
}
export const evidenceRegistry: ReadonlyMap<string, EvidenceItem> = new Map([
  ['demo-safeguarding-policy', {
    id: 'demo-safeguarding-policy', projectId: 'demo-child-protection-program', milestoneId: 'milestone-1',
    claimId: 'claim-safeguarding-readiness', category: 'safeguarding-policy-summary',
    relativePath: 'demo-safeguarding-policy.txt', allowedRoles: ['organizer', 'safeguardingVerifier'], disputeOnlyRoles: ['arbitrator'],
  }],
]);
export function listPublicEvidence(projectId: string) {
  return [...evidenceRegistry.values()].filter((item) => item.projectId === projectId).map(({ id, projectId: project, milestoneId, claimId, category }) => ({ id, projectId: project, milestoneId, claimId, category }));
}
