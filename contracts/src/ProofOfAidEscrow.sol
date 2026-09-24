// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IProofOfAidRoleRegistry {
    function hasRole(bytes32 role, address account) external view returns (bool);
    function organizationOf(address wallet) external view returns (bytes32);
}

/// @notice Hackathon prototype for ordered ERC-20 funding and milestone tranches.
/// @dev One evidence hash and a configured set of distinct organization attestations per milestone.
///      This is not the production expense-claim/ZK design and has not been audited.
contract ProofOfAidEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ORGANIZER_ROLE = keccak256("ORGANIZER_ROLE");
    bytes32 public constant SAFEGUARDING_VERIFIER_ROLE = keccak256("SAFEGUARDING_VERIFIER_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    bytes32 public constant ARBITRATOR_ROLE = keccak256("ARBITRATOR_ROLE");

    enum ProjectStatus { Funding, Active, Disputed, Overdue, Failed, Completed }
    enum MilestoneStatus { Locked, Released, EvidenceSubmitted, Verified, Disputed, Overdue }

    struct Project {
        address organizer;
        address arbitrator;
        uint256 target;
        uint256 totalDonated;
        uint256 totalReleased;
        uint256 totalRefunded;
        uint64 evidencePeriod;
        uint64 refundDelay;
        uint8 milestoneCount;
        uint8 currentMilestone;
        ProjectStatus status;
    }

    struct Milestone {
        uint256 budget;
        uint256 fundingStart;
        uint64 evidenceDeadline;
        MilestoneStatus status;
        bytes32 evidenceHash;
        bytes32[] requiredRoles;
        mapping(bytes32 => uint8) requiredCount;
        mapping(bytes32 => uint8) confirmedCount;
        mapping(bytes32 => bool) confirmerOrganization;
    }

    struct FundingRange {
        uint256 start;
        uint256 end;
    }

    struct CreateProjectParams {
        address arbitrator;
        uint256[] budgets;
        bytes32[][] requiredRoles;
        uint8[][] requiredCounts;
        uint64 evidencePeriod;
        uint64 refundDelay;
    }

    IERC20 public immutable paymentToken;
    IProofOfAidRoleRegistry public immutable roleRegistry;
    uint256 public nextProjectId = 1;
    uint256 private nextDonationId = 1;

    mapping(uint256 projectId => Project) private projects;
    mapping(uint256 projectId => mapping(uint8 milestoneId => Milestone)) private milestones;
    mapping(uint256 projectId => mapping(address donor => FundingRange[])) private donorRanges;
    mapping(uint256 projectId => mapping(address donor => bool)) public refundClaimed;

    event ProjectCreated(uint256 indexed projectId, address indexed organizer, address indexed arbitrator, uint256 target, uint8 milestoneCount);
    event DonationCreated(uint256 indexed projectId, uint256 indexed donationId, address indexed donor, uint256 amount, uint256 fundingStart);
    event MilestoneReleased(uint256 indexed projectId, uint8 indexed milestoneId, address indexed recipient, uint256 amount, uint64 evidenceDeadline);
    event EvidenceSubmitted(uint256 indexed projectId, uint8 indexed milestoneId, bytes32 evidenceHash, uint64 evidenceDeadline);
    event MilestoneConfirmed(uint256 indexed projectId, uint8 indexed milestoneId, bytes32 indexed role, address verifier, bytes32 organizationId);
    event MilestoneVerified(uint256 indexed projectId, uint8 indexed milestoneId);
    event MilestoneRejected(uint256 indexed projectId, uint8 indexed milestoneId, bytes32 indexed role, address verifier, bytes32 reasonCode);
    event DisputeOpened(uint256 indexed projectId, uint8 indexed milestoneId, address indexed openedBy, bytes32 reasonCode);
    event DisputeResolved(uint256 indexed projectId, uint8 indexed milestoneId, bool valid, address indexed arbitrator);
    event MilestoneOverdue(uint256 indexed projectId, uint8 indexed milestoneId, uint64 evidenceDeadline);
    event RefundClaimed(uint256 indexed projectId, address indexed donor, uint256 amount);

    error ZeroAddress();
    error InvalidProject();
    error InvalidMilestone();
    error InvalidPolicy();
    error InvalidState();
    error Unauthorized();
    error InvalidAmount();
    error InvalidEvidence();
    error DuplicateOrganization();
    error NothingToRefund();
    error RefundAlreadyClaimed();
    error TransferAmountMismatch();

    constructor(IERC20 token, IProofOfAidRoleRegistry registry) {
        if (address(token) == address(0) || address(registry) == address(0)) revert ZeroAddress();
        if (address(token).code.length == 0 || address(registry).code.length == 0) revert InvalidProject();
        paymentToken = token;
        roleRegistry = registry;
    }

    function createProject(CreateProjectParams calldata params) external returns (uint256 projectId) {
        if (!roleRegistry.hasRole(ORGANIZER_ROLE, msg.sender)) revert Unauthorized();
        if (params.arbitrator == address(0) || !roleRegistry.hasRole(ARBITRATOR_ROLE, params.arbitrator)) revert Unauthorized();
        uint256 count = params.budgets.length;
        if (count == 0 || count > 8 || params.requiredRoles.length != count ||
            params.requiredCounts.length != count || params.evidencePeriod == 0) revert InvalidPolicy();

        projectId = nextProjectId++;
        Project storage project = projects[projectId];
        project.organizer = msg.sender;
        project.arbitrator = params.arbitrator;
        project.evidencePeriod = params.evidencePeriod;
        project.refundDelay = params.refundDelay;
        project.milestoneCount = uint8(count);
        project.status = ProjectStatus.Funding;
        project.target = _configureMilestones(projectId, params);
        emit ProjectCreated(projectId, msg.sender, params.arbitrator, project.target, uint8(count));
    }

    function _configureMilestones(uint256 projectId, CreateProjectParams calldata params)
        private returns (uint256 target)
    {
        uint256 fundingStart;
        for (uint8 i; i < params.budgets.length; ++i) {
            uint256 budget = params.budgets[i];
            bytes32[] calldata roles = params.requiredRoles[i];
            uint8[] calldata counts = params.requiredCounts[i];
            if (budget == 0 || roles.length == 0 || roles.length != counts.length || roles.length > 4) revert InvalidPolicy();
            Milestone storage milestone = milestones[projectId][i];
            milestone.budget = budget;
            milestone.fundingStart = fundingStart;
            milestone.status = MilestoneStatus.Locked;
            for (uint256 j; j < roles.length; ++j) {
                bytes32 role = roles[j];
                if (!_knownRole(role) || counts[j] == 0 || _roleAppearsBefore(roles, j, role)) revert InvalidPolicy();
                milestone.requiredRoles.push(role);
                milestone.requiredCount[role] = counts[j];
            }
            target += budget;
            fundingStart += budget;
        }
    }

    function _roleAppearsBefore(bytes32[] calldata roles, uint256 end, bytes32 role) private pure returns (bool) {
        for (uint256 i; i < end; ++i) if (roles[i] == role) return true;
        return false;
    }

    function donate(uint256 projectId, uint256 amount) external nonReentrant {
        Project storage project = _project(projectId);
        if (project.status != ProjectStatus.Funding || amount == 0 || project.totalDonated + amount > project.target) revert InvalidAmount();
        uint256 beforeBalance = paymentToken.balanceOf(address(this));
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);
        if (paymentToken.balanceOf(address(this)) - beforeBalance != amount) revert TransferAmountMismatch();

        uint256 start = project.totalDonated;
        project.totalDonated += amount;
        donorRanges[projectId][msg.sender].push(FundingRange(start, start + amount));
        emit DonationCreated(projectId, nextDonationId++, msg.sender, amount, start);

        if (project.totalDonated == project.target) {
            project.status = ProjectStatus.Active;
            project.currentMilestone = 0;
            _release(projectId, 0);
        }
    }

    function submitMilestoneEvidence(uint256 projectId, uint8 milestoneId, bytes32 evidenceHash) external {
        Project storage project = _project(projectId);
        Milestone storage milestone = _currentMilestone(project, projectId, milestoneId);
        if (msg.sender != project.organizer || project.status != ProjectStatus.Active || milestone.status != MilestoneStatus.Released) revert Unauthorized();
        if (evidenceHash == bytes32(0)) revert InvalidEvidence();
        milestone.evidenceHash = evidenceHash;
        milestone.status = MilestoneStatus.EvidenceSubmitted;
        milestone.evidenceDeadline = uint64(block.timestamp) + project.evidencePeriod;
        emit EvidenceSubmitted(projectId, milestoneId, evidenceHash, milestone.evidenceDeadline);
    }

    function confirmMilestone(uint256 projectId, uint8 milestoneId, bytes32 role) external {
        Project storage project = _project(projectId);
        Milestone storage milestone = _currentMilestone(project, projectId, milestoneId);
        if (project.status != ProjectStatus.Active || milestone.status != MilestoneStatus.EvidenceSubmitted) revert InvalidState();
        if (milestone.requiredCount[role] == 0 || !roleRegistry.hasRole(role, msg.sender)) revert Unauthorized();
        bytes32 organizationId = roleRegistry.organizationOf(msg.sender);
        if (organizationId == bytes32(0) || milestone.confirmerOrganization[organizationId]) revert DuplicateOrganization();
        milestone.confirmerOrganization[organizationId] = true;
        milestone.confirmedCount[role]++;
        emit MilestoneConfirmed(projectId, milestoneId, role, msg.sender, organizationId);

        if (_policySatisfied(milestone)) {
            milestone.status = MilestoneStatus.Verified;
            emit MilestoneVerified(projectId, milestoneId);
            if (milestoneId + 1 == project.milestoneCount) {
                project.status = ProjectStatus.Completed;
            } else {
                project.currentMilestone = milestoneId + 1;
                _release(projectId, milestoneId + 1);
            }
        }
    }

    function rejectMilestone(uint256 projectId, uint8 milestoneId, bytes32 role, bytes32 reasonCode) external {
        Project storage project = _project(projectId);
        Milestone storage milestone = _currentMilestone(project, projectId, milestoneId);
        if (project.status != ProjectStatus.Active || milestone.status != MilestoneStatus.EvidenceSubmitted) revert InvalidState();
        if (milestone.requiredCount[role] == 0 || !roleRegistry.hasRole(role, msg.sender)) revert Unauthorized();
        _openDispute(projectId, milestoneId, msg.sender, reasonCode);
        emit MilestoneRejected(projectId, milestoneId, role, msg.sender, reasonCode);
    }

    function openDonorDispute(uint256 projectId, bytes32 reasonCode) external {
        Project storage project = _project(projectId);
        if (donorRanges[projectId][msg.sender].length == 0) revert Unauthorized();
        _openDispute(projectId, project.currentMilestone, msg.sender, reasonCode);
    }

    function resolveDispute(uint256 projectId, bool valid) external {
        Project storage project = _project(projectId);
        if (msg.sender != project.arbitrator || project.status != ProjectStatus.Disputed) revert Unauthorized();
        uint8 milestoneId = project.currentMilestone;
        Milestone storage milestone = milestones[projectId][milestoneId];
        emit DisputeResolved(projectId, milestoneId, valid, msg.sender);
        if (valid) {
            project.status = ProjectStatus.Active;
            milestone.status = milestone.evidenceHash == bytes32(0) ? MilestoneStatus.Released : MilestoneStatus.EvidenceSubmitted;
            milestone.evidenceDeadline = uint64(block.timestamp) + project.evidencePeriod;
        } else {
            project.status = ProjectStatus.Failed;
        }
    }

    function markOverdue(uint256 projectId) external {
        Project storage project = _project(projectId);
        Milestone storage milestone = milestones[projectId][project.currentMilestone];
        if (project.status != ProjectStatus.Active || milestone.status == MilestoneStatus.Locked || milestone.evidenceDeadline == 0 || block.timestamp <= milestone.evidenceDeadline) revert InvalidState();
        milestone.status = MilestoneStatus.Overdue;
        project.status = ProjectStatus.Overdue;
        emit MilestoneOverdue(projectId, project.currentMilestone, milestone.evidenceDeadline);
    }

    function claimRefund(uint256 projectId) external nonReentrant returns (uint256 amount) {
        Project storage project = _project(projectId);
        if (refundClaimed[projectId][msg.sender]) revert RefundAlreadyClaimed();
        if (project.status == ProjectStatus.Overdue) {
            Milestone storage current = milestones[projectId][project.currentMilestone];
            if (block.timestamp < uint256(current.evidenceDeadline) + project.refundDelay) revert InvalidState();
            project.status = ProjectStatus.Failed;
        } else if (project.status != ProjectStatus.Failed) {
            revert InvalidState();
        }

        amount = _lockedAllocation(projectId, msg.sender, project.milestoneCount);
        if (amount == 0) revert NothingToRefund();
        refundClaimed[projectId][msg.sender] = true;
        project.totalRefunded += amount;
        paymentToken.safeTransfer(msg.sender, amount);
        emit RefundClaimed(projectId, msg.sender, amount);
    }

    function claimableRefund(uint256 projectId, address donor) external view returns (uint256) {
        Project storage project = _project(projectId);
        if (refundClaimed[projectId][donor]) return 0;
        if (project.status != ProjectStatus.Failed && project.status != ProjectStatus.Overdue) return 0;
        if (project.status == ProjectStatus.Overdue) {
            Milestone storage current = milestones[projectId][project.currentMilestone];
            if (block.timestamp < uint256(current.evidenceDeadline) + project.refundDelay) return 0;
        }
        return _lockedAllocation(projectId, donor, project.milestoneCount);
    }

    function getProject(uint256 projectId) external view returns (
        address organizer, address arbitrator, uint256 target, uint256 totalDonated,
        uint256 totalReleased, uint256 totalRefunded, uint8 milestoneCount,
        uint8 currentMilestone, ProjectStatus status
    ) {
        Project storage project = _project(projectId);
        return (project.organizer, project.arbitrator, project.target, project.totalDonated,
            project.totalReleased, project.totalRefunded, project.milestoneCount,
            project.currentMilestone, project.status);
    }

    function getMilestone(uint256 projectId, uint8 milestoneId) external view returns (
        uint256 budget, uint256 fundingStart, uint64 evidenceDeadline,
        MilestoneStatus status, bytes32 evidenceHash
    ) {
        _project(projectId);
        if (milestoneId >= projects[projectId].milestoneCount) revert InvalidMilestone();
        Milestone storage milestone = milestones[projectId][milestoneId];
        return (milestone.budget, milestone.fundingStart, milestone.evidenceDeadline, milestone.status, milestone.evidenceHash);
    }

    function getRequiredRoles(uint256 projectId, uint8 milestoneId) external view returns (bytes32[] memory) {
        _project(projectId);
        if (milestoneId >= projects[projectId].milestoneCount) revert InvalidMilestone();
        return milestones[projectId][milestoneId].requiredRoles;
    }

    function contributionRanges(uint256 projectId, address donor) external view returns (FundingRange[] memory) {
        _project(projectId);
        return donorRanges[projectId][donor];
    }

    function fundInvariant(uint256 projectId) external view returns (
        uint256 donated,
        uint256 releasedUnverified,
        uint256 releasedVerified,
        uint256 locked,
        uint256 frozen,
        uint256 refunded,
        bool holds
    ) {
        Project storage project = _project(projectId);
        donated = project.totalDonated;
        refunded = project.totalRefunded;
        for (uint8 i; i < project.milestoneCount; ++i) {
            Milestone storage milestone = milestones[projectId][i];
            if (milestone.status == MilestoneStatus.Verified) releasedVerified += milestone.budget;
            else if (milestone.status == MilestoneStatus.Released ||
                milestone.status == MilestoneStatus.EvidenceSubmitted ||
                milestone.status == MilestoneStatus.Disputed ||
                milestone.status == MilestoneStatus.Overdue) releasedUnverified += milestone.budget;
            else if (milestone.status == MilestoneStatus.Locked && project.status == ProjectStatus.Disputed) frozen += milestone.budget;
        }
        locked = donated - releasedUnverified - releasedVerified - frozen - refunded;
        holds = donated == locked + releasedUnverified + releasedVerified + frozen + refunded;
    }

    function _release(uint256 projectId, uint8 milestoneId) private {
        Project storage project = projects[projectId];
        Milestone storage milestone = milestones[projectId][milestoneId];
        if (milestone.status != MilestoneStatus.Locked) revert InvalidState();
        milestone.status = MilestoneStatus.Released;
        milestone.evidenceDeadline = uint64(block.timestamp) + project.evidencePeriod;
        project.totalReleased += milestone.budget;
        paymentToken.safeTransfer(project.organizer, milestone.budget);
        emit MilestoneReleased(projectId, milestoneId, project.organizer, milestone.budget, milestone.evidenceDeadline);
    }

    function _openDispute(uint256 projectId, uint8 milestoneId, address openedBy, bytes32 reasonCode) private {
        Project storage project = projects[projectId];
        Milestone storage milestone = milestones[projectId][milestoneId];
        if (project.status != ProjectStatus.Active || milestoneId != project.currentMilestone ||
            (milestone.status != MilestoneStatus.Released && milestone.status != MilestoneStatus.EvidenceSubmitted) || reasonCode == bytes32(0)) revert InvalidState();
        milestone.status = MilestoneStatus.Disputed;
        project.status = ProjectStatus.Disputed;
        emit DisputeOpened(projectId, milestoneId, openedBy, reasonCode);
    }

    function _policySatisfied(Milestone storage milestone) private view returns (bool) {
        for (uint256 i; i < milestone.requiredRoles.length; ++i) {
            bytes32 role = milestone.requiredRoles[i];
            if (milestone.confirmedCount[role] < milestone.requiredCount[role]) return false;
        }
        return true;
    }

    function _lockedAllocation(uint256 projectId, address donor, uint8 milestoneCount) private view returns (uint256 amount) {
        FundingRange[] storage ranges = donorRanges[projectId][donor];
        for (uint256 r; r < ranges.length; ++r) {
            for (uint8 m; m < milestoneCount; ++m) {
                Milestone storage milestone = milestones[projectId][m];
                if (milestone.status != MilestoneStatus.Locked) continue;
                uint256 milestoneEnd = milestone.fundingStart + milestone.budget;
                uint256 start = ranges[r].start > milestone.fundingStart ? ranges[r].start : milestone.fundingStart;
                uint256 end = ranges[r].end < milestoneEnd ? ranges[r].end : milestoneEnd;
                if (end > start) amount += end - start;
            }
        }
    }

    function _currentMilestone(Project storage project, uint256 projectId, uint8 milestoneId) private view returns (Milestone storage milestone) {
        if (milestoneId >= project.milestoneCount || milestoneId != project.currentMilestone) revert InvalidMilestone();
        return milestones[projectId][milestoneId];
    }

    function _project(uint256 projectId) private view returns (Project storage project) {
        project = projects[projectId];
        if (project.organizer == address(0)) revert InvalidProject();
    }

    function _knownRole(bytes32 role) private pure returns (bool) {
        return role == ORGANIZER_ROLE || role == SAFEGUARDING_VERIFIER_ROLE || role == AUDITOR_ROLE || role == ARBITRATOR_ROLE;
    }
}
