// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {CollateralRegistry} from "./CollateralRegistry.sol";
import {LoanPool} from "./LoanPool.sol";

/// @notice 운영자가 호출하고, 대출사·운영자가 같은 약정서 해시에 서명했을 때만 풀을 배포한다.
contract PoolFactory {
    CollateralRegistry public immutable registry;

    error BadLenderSig();
    error BadOperatorSig();

    event PoolCreated(address indexed pool, bytes32 agreementHash, bytes32 settingsHash);

    constructor(CollateralRegistry registry_) {
        registry = registry_;
    }

  /// @param operatorSig 운영자( msg.sender )가 agreementHash 에 대한 personal_sign 서명
    function createPool(
        IERC20 usdc,
        address lender,
        address oracle,
        bytes32 agreementHash,
        LoanPool.Settings memory s,
        bytes memory lenderSig,
        bytes memory operatorSig
    ) external returns (LoanPool pool) {
        address operator = msg.sender;
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(agreementHash);

        if (ECDSA.recover(digest, lenderSig) != lender) revert BadLenderSig();
        if (ECDSA.recover(digest, operatorSig) != operator) revert BadOperatorSig();

        bytes32 settingsHash = keccak256(abi.encode(s));
        pool = new LoanPool(usdc, registry, lender, operator, oracle, agreementHash, s, lenderSig, operatorSig);
        registry.authorizePool(address(pool));
        emit PoolCreated(address(pool), agreementHash, settingsHash);
    }
}