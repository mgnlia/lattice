// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Fixtures} from "./helpers/Fixtures.sol";
import {SoulINFT} from "../src/SoulINFT.sol";
import {ISoulINFT} from "../src/interfaces/ISoulINFT.sol";

contract SoulINFTTest is Test {
    SoulINFT internal soul;

    function setUp() public {
        (SoulINFT s,) = Fixtures.deploySoulINFT(address(this));
        soul = s;
    }

    function test_MintSoul_HappyPath() public {
        address owner = makeAddr("alice");
        bytes32 root = keccak256("alice.context.math");
        uint256 id = soul.mintSoul(owner, root, "math", address(0));
        assertEq(soul.ownerOf(id), owner);
        assertEq(soul.domainOf(id), "math");
        assertEq(soul.royaltyWalletOf(id), owner, "default royalty wallet should equal owner when zero passed");

        bytes32[] memory hashes = soul.dataHashesOf(id);
        assertEq(hashes.length, 1);
        assertEq(hashes[0], root);
    }

    function test_MintSoul_CustomRoyaltyWallet() public {
        address owner = makeAddr("alice");
        address royalty = makeAddr("alice.treasury");
        uint256 id = soul.mintSoul(owner, keccak256("ctx"), "lit", royalty);
        assertEq(soul.royaltyWalletOf(id), royalty);
    }

    function test_MintSoul_ZeroToReverts() public {
        vm.expectRevert(ISoulINFT.ZeroAddress.selector);
        soul.mintSoul(address(0), keccak256("ctx"), "x", address(0));
    }

    function test_SetRoyaltyWallet_OwnerOnly() public {
        address owner = makeAddr("alice");
        uint256 id = soul.mintSoul(owner, keccak256("ctx"), "math", address(0));
        address newRoyalty = makeAddr("treasury");

        // Random caller cannot reroute.
        vm.expectRevert(ISoulINFT.NotSoulOwner.selector);
        soul.setRoyaltyWallet(id, newRoyalty);

        // Owner can.
        vm.prank(owner);
        soul.setRoyaltyWallet(id, newRoyalty);
        assertEq(soul.royaltyWalletOf(id), newRoyalty);
    }

    function test_SetRoyaltyWallet_ZeroReverts() public {
        address owner = makeAddr("alice");
        uint256 id = soul.mintSoul(owner, keccak256("ctx"), "math", address(0));
        vm.prank(owner);
        vm.expectRevert(ISoulINFT.ZeroAddress.selector);
        soul.setRoyaltyWallet(id, address(0));
    }

    function test_MultipleMints_GetUniqueIds() public {
        uint256 a = soul.mintSoul(makeAddr("a"), keccak256("a"), "math", address(0));
        uint256 b = soul.mintSoul(makeAddr("b"), keccak256("b"), "lit", address(0));
        uint256 c = soul.mintSoul(makeAddr("c"), keccak256("c"), "code", address(0));
        assertTrue(a != b && b != c && a != c);
    }
}
