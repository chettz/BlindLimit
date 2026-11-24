// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract MockUSDCTest is Test {
    MockUSDC internal usdc;

    function setUp() public {
        usdc = new MockUSDC();
    }

    function test_decimals() public view {
        assertEq(usdc.decimals(), 6);
    }

    function test_mint() public {
        address to = makeAddr("to");
        usdc.mint(to, 1_000_000);
        assertEq(usdc.balanceOf(to), 1_000_000);
        assertEq(usdc.totalSupply(), 1_000_000);
    }

    function test_mint_revertZeroAddress() public {
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
        usdc.mint(address(0), 1);
    }
}
