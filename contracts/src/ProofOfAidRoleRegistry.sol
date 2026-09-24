// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @notice Admin-managed wallet roles and organization bindings for the prototype.
/// @dev Contains no child, family, case, or safeguarding incident information.
contract ProofOfAidRoleRegistry is AccessControl {
    bytes32 public constant ORGANIZER_ROLE = keccak256("ORGANIZER_ROLE");
    bytes32 public constant SAFEGUARDING_VERIFIER_ROLE = keccak256("SAFEGUARDING_VERIFIER_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    bytes32 public constant ARBITRATOR_ROLE = keccak256("ARBITRATOR_ROLE");

    mapping(address wallet => bytes32 organizationId) public organizationOf;

    event OrganizationBound(address indexed wallet, bytes32 indexed organizationId);

    error ZeroAddress();

    constructor(address initialAdmin) {
        if (initialAdmin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
    }

    /// @notice Bind a wallet to an off-chain verified organization identifier.
    /// @dev The identifier must be an opaque, non-identifying bytes32 value.
    function bindOrganization(address wallet, bytes32 organizationId)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (wallet == address(0)) revert ZeroAddress();
        organizationOf[wallet] = organizationId;
        emit OrganizationBound(wallet, organizationId);
    }
}
