// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {RoyaltyFanout} from "../src/RoyaltyFanout.sol";

contract RoyaltyFanoutTest is Test {
    function test_SplitEqual_FivewayNoDust() public pure {
        (uint256[] memory payouts, uint256 dust) = RoyaltyFanout.splitEqual(5 ether, 5);
        assertEq(payouts.length, 5);
        for (uint256 i = 0; i < 5; ++i) assertEq(payouts[i], 1 ether);
        assertEq(dust, 0);
    }

    function test_SplitEqual_ProducesDust() public pure {
        // 7 wei split 3 ways -> 2 each, 1 dust.
        (uint256[] memory payouts, uint256 dust) = RoyaltyFanout.splitEqual(7, 3);
        for (uint256 i = 0; i < 3; ++i) assertEq(payouts[i], 2);
        assertEq(dust, 1);
    }

    function test_SplitEqual_OneSoulTakesAll() public pure {
        (uint256[] memory payouts, uint256 dust) = RoyaltyFanout.splitEqual(123 ether, 1);
        assertEq(payouts.length, 1);
        assertEq(payouts[0], 123 ether);
        assertEq(dust, 0);
    }

    function _splitEqualSubcall(uint256 payment, uint256 n)
        external
        pure
        returns (uint256[] memory, uint256)
    {
        return RoyaltyFanout.splitEqual(payment, n);
    }

    function test_SplitEqual_RevertsOnZeroSouls() public {
        // Library calls are inlined at the test's call depth; route through a
        // sub-call so vm.expectRevert can match.
        vm.expectRevert(RoyaltyFanout.NoSouls.selector);
        this._splitEqualSubcall(1 ether, 0);
    }

    function testFuzz_SplitEqual_DustLessThanN(uint256 payment, uint8 n) public pure {
        n = uint8(bound(uint256(n), 1, 16));
        payment = bound(payment, 0, type(uint128).max);
        (uint256[] memory payouts, uint256 dust) = RoyaltyFanout.splitEqual(payment, n);
        // Sum of payouts + dust == payment.
        uint256 total = dust;
        for (uint256 i = 0; i < n; ++i) total += payouts[i];
        assertEq(total, payment);
        // Dust strictly < n (integer-division remainder).
        assertLt(dust, n);
    }
}
