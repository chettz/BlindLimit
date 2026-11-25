// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CollateralRegistry} from "../src/CollateralRegistry.sol";
import {LoanPool} from "../src/LoanPool.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @notice 팩토리 없이 레지스트리, MockUSDC, 대출 풀을 Base Sepolia 에 배포 - 기능 테스트용
contract DeployM1 is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address lender = vm.envAddress("LENDER_ADDRESS");
        address operator = vm.envAddress("OPERATOR_ADDRESS");
        address oracle = vm.envAddress("ORACLE_ADDRESS");
        bytes32 agreementHash = vm.envOr("AGREEMENT_HASH", bytes32(0));
        bool deployPoolB = vm.envOr("DEPLOY_POOL_B", true); // 이중 담보 설정

        // 약정서 숫자에 맞게 여기만 고친다.
        LoanPool.Settings memory settings = LoanPool.Settings({
            advanceRateBps: 8500,
            delinquencyCutoffDays: 30,
            amountToleranceCents: 100,
            obligorConcBps: 1000,
            dealerConcBps: 3000,
            maxCommitment: 500_000e6
        });

        vm.startBroadcast(deployerKey);

        CollateralRegistry registry = new CollateralRegistry();
        MockUSDC usdc = new MockUSDC();
        LoanPool poolA = _deployPool(usdc, registry, lender, operator, oracle, agreementHash, settings);
        registry.authorizePool(address(poolA));
        usdc.mint(address(poolA), 1_000_000e6);

        console.log("REGISTRY_ADDRESS", address(registry));
        console.log("USDC_ADDRESS", address(usdc));
        console.log("POOL_A_ADDRESS", address(poolA));

        if (deployPoolB) {
            LoanPool poolB = _deployPool(usdc, registry, lender, operator, oracle, agreementHash, settings);
            registry.authorizePool(address(poolB));
            console.log("POOL_B_ADDRESS", address(poolB));
        }

        vm.stopBroadcast();
    }

    function _deployPool(
        MockUSDC usdc,
        CollateralRegistry registry,
        address lender,
        address operator,
        address oracle,
        bytes32 agreementHash,
        LoanPool.Settings memory settings
    ) internal returns (LoanPool) {
        return new LoanPool(usdc, registry, lender, operator, oracle, agreementHash, settings, "", "");
    }
}
