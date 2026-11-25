// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";

import {CollateralRegistry} from "../src/CollateralRegistry.sol";
import {PoolFactory} from "../src/PoolFactory.sol";

/// @notice 기존 CollateralRegistry 에 PoolFactory 를 붙인다. owner 가 setFactory 를 실행한다.
contract DeployFactory is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address registryAddr = vm.envAddress("REGISTRY_ADDRESS");

        vm.startBroadcast(deployerKey);

        PoolFactory factory = new PoolFactory(CollateralRegistry(registryAddr));
        CollateralRegistry(registryAddr).setFactory(address(factory));

        console.log("FACTORY_ADDRESS", address(factory));

        vm.stopBroadcast();
    }
}