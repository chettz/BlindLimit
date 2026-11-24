// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CollateralRegistry} from "../src/CollateralRegistry.sol";

contract CollateralRegistryTest is Test {
    CollateralRegistry internal registry;

    address internal poolA = makeAddr("poolA");
    address internal poolB = makeAddr("poolB");
    address internal stranger = makeAddr("stranger");

    bytes32 internal vinA = keccak256("VIN-A");
    bytes32 internal vinB = keccak256("VIN-B");

    event PoolAuthorized(address indexed pool);
    event FactorySet(address indexed factory);
    event VinsRegistered(address indexed pool, uint256 count);
    event VinsReleased(address indexed pool, uint256 count);

    function setUp() public {
        registry = new CollateralRegistry();
        registry.authorizePool(poolA);
        registry.authorizePool(poolB);
    }

    function test_registerBatch() public {
        bytes32[] memory vins = new bytes32[](2);
        vins[0] = vinA;
        vins[1] = vinB;

        vm.expectEmit(true, false, false, true, address(registry));
        emit VinsRegistered(poolA, 2);

        vm.prank(poolA);
        registry.registerBatch(vins);

        assertEq(registry.pledgedTo(vinA), poolA);
        assertEq(registry.pledgedTo(vinB), poolA);
        assertTrue(registry.isPledged(vinA));

        address[] memory pools = registry.checkBatch(vins);
        assertEq(pools[0], poolA);
        assertEq(pools[1], poolA);
    }

    function test_registerBatch_revertAlreadyPledgedRollsBack() public {
        bytes32[] memory first = new bytes32[](1);
        first[0] = vinA;
        vm.prank(poolA);
        registry.registerBatch(first);

        bytes32 vinNew = keccak256("VIN-NEW");
        bytes32[] memory batch = new bytes32[](2);
        batch[0] = vinNew;
        batch[1] = vinA;

        vm.expectRevert(abi.encodeWithSelector(CollateralRegistry.AlreadyPledged.selector, vinA, poolA));
        vm.prank(poolB);
        registry.registerBatch(batch);

        assertEq(registry.pledgedTo(vinA), poolA);
        assertFalse(registry.isPledged(vinNew));
    }

    function test_registerBatch_idempotent() public {
        bytes32[] memory vins = new bytes32[](1);
        vins[0] = vinA;
        vm.prank(poolA);
        registry.registerBatch(vins);

        vm.expectEmit(true, false, false, true, address(registry));
        emit VinsRegistered(poolA, 0);

        vm.prank(poolA);
        registry.registerBatch(vins);

        assertEq(registry.pledgedTo(vinA), poolA);
    }

    function test_releaseBatch_thenOtherPoolRegisters() public {
        bytes32[] memory vins = new bytes32[](1);
        vins[0] = vinA;
        vm.prank(poolA);
        registry.registerBatch(vins);

        vm.expectEmit(true, false, false, true, address(registry));
        emit VinsReleased(poolA, 1);
        vm.prank(poolA);
        registry.releaseBatch(vins);

        assertFalse(registry.isPledged(vinA));

        vm.prank(poolB);
        registry.registerBatch(vins);
        assertEq(registry.pledgedTo(vinA), poolB);
    }

    function test_releaseBatch_revertNotOwnerPool() public {
        bytes32[] memory vins = new bytes32[](1);
        vins[0] = vinA;
        vm.prank(poolA);
        registry.registerBatch(vins);

        vm.expectRevert(abi.encodeWithSelector(CollateralRegistry.NotOwnerPool.selector, vinA));
        vm.prank(poolB);
        registry.releaseBatch(vins);

        assertEq(registry.pledgedTo(vinA), poolA);
    }

    function test_registerBatch_revertNotAuthorized() public {
        bytes32[] memory vins = new bytes32[](1);
        vins[0] = vinA;

        vm.expectRevert(CollateralRegistry.NotAuthorized.selector);
        vm.prank(stranger);
        registry.registerBatch(vins);
    }

    function test_authorizePool_revertNotOwner() public {
        vm.expectRevert(CollateralRegistry.NotOwner.selector);
        vm.prank(stranger);
        registry.authorizePool(makeAddr("poolC"));
    }

    function test_authorizePool_factory() public {
        address factory = makeAddr("factory");
        address poolC = makeAddr("poolC");

        vm.expectEmit(true, false, false, true, address(registry));
        emit FactorySet(factory);
        registry.setFactory(factory);

        vm.expectEmit(true, false, false, true, address(registry));
        emit PoolAuthorized(poolC);
        vm.prank(factory);
        registry.authorizePool(poolC);

        assertTrue(registry.isPool(poolC));
    }

    function test_setFactory_revertNotOwner() public {
        vm.expectRevert(CollateralRegistry.NotOwner.selector);
        vm.prank(stranger);
        registry.setFactory(makeAddr("factory"));
        assertEq(registry.factory(), address(0));
    }
}
