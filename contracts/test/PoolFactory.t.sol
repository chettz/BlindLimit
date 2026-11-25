// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {CollateralRegistry} from "../src/CollateralRegistry.sol";
import {LoanPool} from "../src/LoanPool.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {PoolFactory} from "../src/PoolFactory.sol";

contract PoolFactoryTest is Test {
    MockUSDC internal usdc;
    CollateralRegistry internal registry;
    PoolFactory internal factory;

    uint256 internal lenderKey = 0xA11CE;
    uint256 internal operatorKey = 0xB0B;
    uint256 internal wrongKey = 0xDEAD;

    address internal lender;
    address internal operator;
    address internal oracle = makeAddr("oracle");

    bytes32 internal agreementHash = keccak256("agreement-doc");

    event PoolCreated(address indexed pool, bytes32 agreementHash, bytes32 settingsHash);

    function setUp() public {
        lender = vm.addr(lenderKey);
        operator = vm.addr(operatorKey);
        usdc = new MockUSDC();
        registry = new CollateralRegistry();
        factory = new PoolFactory(registry);
        registry.setFactory(address(factory));
    }

    function test_createPool_authorizesInRegistry() public {
        bytes memory lenderSig = _sign(lenderKey, agreementHash);
        bytes memory operatorSig = _sign(operatorKey, agreementHash);
        LoanPool.Settings memory settings = _settings();

        vm.prank(operator);
        LoanPool pool = factory.createPool(usdc, lender, oracle, agreementHash, settings, lenderSig, operatorSig);

        assertTrue(registry.isPool(address(pool)));
        assertEq(pool.lender(), lender);
        assertEq(pool.operator(), operator);
        assertEq(pool.agreementHash(), agreementHash);
    }

    function test_createPool_revertBadLenderSig_wrongHashSigned() public {
        bytes32 otherHash = keccak256("other");
        bytes memory lenderSig = _sign(lenderKey, otherHash);
        bytes memory operatorSig = _sign(operatorKey, agreementHash);

        vm.prank(operator);
        vm.expectRevert(PoolFactory.BadLenderSig.selector);
        factory.createPool(usdc, lender, oracle, agreementHash, _settings(), lenderSig, operatorSig);
    }

    function test_createPool_revertBadLenderSig_wrongSigner() public {
        bytes memory lenderSig = _sign(wrongKey, agreementHash);
        bytes memory operatorSig = _sign(operatorKey, agreementHash);

        vm.prank(operator);
        vm.expectRevert(PoolFactory.BadLenderSig.selector);
        factory.createPool(usdc, lender, oracle, agreementHash, _settings(), lenderSig, operatorSig);
    }

    function test_createPool_revertBadOperatorSig() public {
        bytes memory lenderSig = _sign(lenderKey, agreementHash);
        bytes memory operatorSig = _sign(wrongKey, agreementHash);

        vm.prank(operator);
        vm.expectRevert(PoolFactory.BadOperatorSig.selector);
        factory.createPool(usdc, lender, oracle, agreementHash, _settings(), lenderSig, operatorSig);
    }

    function _settings() internal pure returns (LoanPool.Settings memory) {
        return LoanPool.Settings({
            advanceRateBps: 8500,
            delinquencyCutoffDays: 30,
            amountToleranceCents: 100,
            obligorConcBps: 1000,
            dealerConcBps: 3000,
            maxCommitment: 500_000e6
        });
    }

    function _sign(uint256 privateKey, bytes32 hash) internal returns (bytes memory) {
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(hash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}