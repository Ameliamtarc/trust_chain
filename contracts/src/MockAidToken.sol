// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Testnet-only token for the hackathon prototype. Never use for production funds.
contract MockAidToken is ERC20, Ownable {
    constructor(address initialOwner) ERC20("Mock Aid Token", "mAID") Ownable(initialOwner) {}

    function mint(address account, uint256 amount) external onlyOwner {
        _mint(account, amount);
    }
}
