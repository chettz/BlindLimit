// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CollateralRegistry} from "../src/CollateralRegistry.sol";
import {LoanPool} from "../src/LoanPool.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract LoanPoolTest is Test {
    MockUSDC internal usdc;
    CollateralRegistry internal registry;

    address internal lender = makeAddr("lender");
    address internal operator = makeAddr("operator");
    address internal oracle = makeAddr("oracle");
    address internal stranger = makeAddr("stranger");
    bytes32 internal agreementHash = keccak256("agreement");

    uint256 internal constant LIMIT = 100e6;
    uint256 internal constant MAX_COMMITMENT = 1_000e6;

    event LimitUpdated(
        bytes32 agreementHash,
        bytes32 docBundleHash,
        bytes32 attestationHash,
        bytes32 ruleHash,
        uint256 eligibleCount,
        uint256 eligibleAmount,
        uint256 newLimit,
        uint64 timestamp
    );
    event Borrowed(address indexed lender, uint256 amount);
    event Repaid(address indexed lender, uint256 amount);

    function setUp() public {
        usdc = new MockUSDC();
        registry = new CollateralRegistry();
    }

    function test_borrow_revertWhenLimitZero() public {
        LoanPool pool = _deploy(MAX_COMMITMENT);
        vm.prank(lender);
        vm.expectRevert(abi.encodeWithSelector(LoanPool.ExceedsLimit.selector, 1, 0));
        pool.borrow(1);
    }

    function test_borrow_withinLimit() public {
        LoanPool pool = _fund(_deploy(MAX_COMMITMENT), 200e6);
        _post(pool, LIMIT, _vins(keccak256("VIN-A")));

        vm.expectEmit(true, false, false, true, address(pool));
        emit Borrowed(lender, 40e6);
        vm.prank(lender);
        pool.borrow(40e6);

        assertEq(pool.borrowed(), 40e6);
        assertEq(usdc.balanceOf(lender), 40e6);
        assertEq(pool.availableToBorrow(), 60e6);
    }

    function test_borrow_revertExceedsLimit() public {
        LoanPool pool = _fund(_deploy(MAX_COMMITMENT), 200e6);
        _post(pool, LIMIT, _vins(keccak256("VIN-A")));

        vm.prank(lender);
        pool.borrow(90e6);

        vm.prank(lender);
        vm.expectRevert(abi.encodeWithSelector(LoanPool.ExceedsLimit.selector, 20e6, 10e6));
        pool.borrow(20e6);
    }

    function test_borrow_revertMaxCommitment() public {
        LoanPool pool = _fund(_deploy(30e6), 200e6);
        _post(pool, LIMIT, _vins(keccak256("VIN-A")));

        assertEq(pool.availableToBorrow(), 30e6);

        vm.prank(lender);
        vm.expectRevert(abi.encodeWithSelector(LoanPool.ExceedsLimit.selector, 31e6, 30e6));
        pool.borrow(31e6);
    }

    function test_borrow_revertNotLender() public {
        LoanPool pool = _fund(_deploy(MAX_COMMITMENT), 200e6);
        _post(pool, LIMIT, _vins(keccak256("VIN-A")));

        vm.prank(stranger);
        vm.expectRevert(LoanPool.NotLender.selector);
        pool.borrow(1e6);
    }

    function test_borrow_revertZeroAmount() public {
        LoanPool pool = _fund(_deploy(MAX_COMMITMENT), 200e6);
        _post(pool, LIMIT, _vins(keccak256("VIN-A")));

        vm.prank(lender);
        vm.expectRevert(LoanPool.ZeroAmount.selector);
        pool.borrow(0);
    }

    function test_postLimit_revertNotOracle() public {
        LoanPool pool = _deploy(MAX_COMMITMENT);
        bytes32 vin = keccak256("VIN-A");

        vm.prank(lender);
        vm.expectRevert(LoanPool.NotOracle.selector);
        pool.postLimit(bytes32(0), bytes32(0), bytes32(0), 1, 1, LIMIT, _vins(vin));

        assertEq(pool.limit(), 0);
        assertFalse(registry.isPledged(vin));
    }

    function test_postLimit_emitsLimitUpdated() public {
        LoanPool pool = _deploy(MAX_COMMITMENT);
        bytes32 docBundle = keccak256("bundle");
        bytes32 attestation = keccak256("attestation");
        bytes32 rule = keccak256("rule");
        bytes32[] memory vins = _vins(keccak256("VIN-A"));

        vm.expectEmit(false, false, false, true, address(pool));
        emit LimitUpdated(agreementHash, docBundle, attestation, rule, 2, 80e6, LIMIT, uint64(block.timestamp));

        vm.prank(oracle);
        pool.postLimit(docBundle, attestation, rule, 2, 80e6, LIMIT, vins);

        assertEq(pool.limit(), LIMIT);
        assertEq(registry.pledgedTo(vins[0]), address(pool));
    }

    function test_updateSettings_revert() public {
        LoanPool pool = _deploy(MAX_COMMITMENT);
        LoanPool.Settings memory next = _settings(MAX_COMMITMENT);
        next.advanceRateBps = 1000;

        vm.expectRevert(LoanPool.SettingsLocked.selector);
        pool.updateSettings(next);

        vm.prank(operator);
        vm.expectRevert(LoanPool.SettingsLocked.selector);
        pool.updateSettings(next);

        assertEq(pool.settings().advanceRateBps, 8500);
    }

    function test_settingsHashIncludesTolerance() public {
        LoanPool pool = _deploy(MAX_COMMITMENT);
        LoanPool.Settings memory s = _settings(MAX_COMMITMENT);

        assertEq(pool.settingsHash(), keccak256(abi.encode(s)));
        assertEq(pool.settings().amountToleranceCents, 100);

        s.amountToleranceCents = 101;
        assertTrue(pool.settingsHash() != keccak256(abi.encode(s)));
    }

    function test_postLimit_revertWhenVinPledgedToOtherPool() public {
        LoanPool poolA = _deploy(MAX_COMMITMENT);
        LoanPool poolB = _deploy(MAX_COMMITMENT);
        bytes32[] memory vins = _vins(keccak256("VIN-A"));

        _post(poolA, LIMIT, vins);

        vm.prank(oracle);
        vm.expectRevert(abi.encodeWithSelector(CollateralRegistry.AlreadyPledged.selector, vins[0], address(poolA)));
        poolB.postLimit(bytes32(0), bytes32(0), bytes32(0), 1, 1, 50e6, vins);

        assertEq(poolB.limit(), 0);
        assertEq(registry.pledgedTo(vins[0]), address(poolA));
    }

    function test_repay() public {
        LoanPool pool = _fund(_deploy(MAX_COMMITMENT), 200e6);
        _post(pool, LIMIT, _vins(keccak256("VIN-A")));

        vm.prank(lender);
        pool.borrow(40e6);

        vm.prank(lender);
        usdc.approve(address(pool), 15e6);

        vm.expectEmit(true, false, false, true, address(pool));
        emit Repaid(lender, 15e6);
        vm.prank(lender);
        pool.repay(15e6);

        assertEq(pool.borrowed(), 25e6);
        assertEq(usdc.balanceOf(lender), 25e6);
        assertEq(pool.availableToBorrow(), 75e6);
    }

    function test_repay_revertNotLender() public {
        LoanPool pool = _fund(_deploy(MAX_COMMITMENT), 200e6);
        _post(pool, LIMIT, _vins(keccak256("VIN-A")));
        vm.prank(lender);
        pool.borrow(10e6);

        vm.prank(stranger);
        vm.expectRevert(LoanPool.NotLender.selector);
        pool.repay(1e6);
    }

    function test_repay_revertZeroAmount() public {
        LoanPool pool = _fund(_deploy(MAX_COMMITMENT), 200e6);
        _post(pool, LIMIT, _vins(keccak256("VIN-A")));
        vm.prank(lender);
        pool.borrow(10e6);

        vm.prank(lender);
        vm.expectRevert(LoanPool.ZeroAmount.selector);
        pool.repay(0);
    }

    function test_repay_revertExceedsBorrowed() public {
        LoanPool pool = _fund(_deploy(MAX_COMMITMENT), 200e6);
        _post(pool, LIMIT, _vins(keccak256("VIN-A")));
        vm.prank(lender);
        pool.borrow(10e6);
        vm.prank(lender);
        usdc.approve(address(pool), 11e6);

        vm.prank(lender);
        vm.expectRevert(abi.encodeWithSelector(LoanPool.ExceedsLimit.selector, 11e6, 10e6));
        pool.repay(11e6);
        assertEq(pool.borrowed(), 10e6);
    }

    function test_releaseVins() public {
        LoanPool pool = _deploy(MAX_COMMITMENT);
        bytes32 vin = keccak256("VIN-A");
        _post(pool, LIMIT, _vins(vin));

        vm.prank(oracle);
        pool.releaseVins(_vins(vin));

        assertFalse(registry.isPledged(vin));
        assertEq(pool.limit(), LIMIT);
    }

    function test_releaseVins_revertNotOracle() public {
        LoanPool pool = _deploy(MAX_COMMITMENT);
        bytes32 vin = keccak256("VIN-A");
        _post(pool, LIMIT, _vins(vin));

        vm.prank(lender);
        vm.expectRevert(LoanPool.NotOracle.selector);
        pool.releaseVins(_vins(vin));
        assertTrue(registry.isPledged(vin));
    }

    function test_releaseVins_revertNotOwnerPool() public {
        LoanPool poolA = _deploy(MAX_COMMITMENT);
        LoanPool poolB = _deploy(MAX_COMMITMENT);
        bytes32 vin = keccak256("VIN-A");
        _post(poolA, LIMIT, _vins(vin));

        vm.prank(oracle);
        vm.expectRevert(abi.encodeWithSelector(CollateralRegistry.NotOwnerPool.selector, vin));
        poolB.releaseVins(_vins(vin));
    }

    function _settings(uint256 maxCommitment) internal pure returns (LoanPool.Settings memory) {
        return LoanPool.Settings({
            advanceRateBps: 8500,
            delinquencyCutoffDays: 30,
            amountToleranceCents: 100,
            obligorConcBps: 2000,
            dealerConcBps: 3000,
            maxCommitment: maxCommitment
        });
    }

    function _deploy(uint256 maxCommitment) internal returns (LoanPool pool) {
        pool = new LoanPool(
            usdc,
            registry,
            lender,
            operator,
            oracle,
            agreementHash,
            _settings(maxCommitment),
            hex"01",
            hex"02"
        );
        registry.authorizePool(address(pool));
    }

    function _fund(LoanPool pool, uint256 amount) internal returns (LoanPool) {
        usdc.mint(address(pool), amount);
        return pool;
    }

    function _vins(bytes32 vin) internal pure returns (bytes32[] memory vins) {
        vins = new bytes32[](1);
        vins[0] = vin;
    }

    function _post(LoanPool pool, uint256 newLimit, bytes32[] memory vins) internal {
        vm.prank(oracle);
        pool.postLimit(keccak256("bundle"), keccak256("attestation"), keccak256("rule"), 1, newLimit, newLimit, vins);
    }
}
