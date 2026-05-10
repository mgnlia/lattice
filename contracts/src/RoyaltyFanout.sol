// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title RoyaltyFanout
/// @notice Pure helper for splitting a payment N ways across soul royalty wallets.
/// @dev v1 ships only `splitEqual` (each soul gets payment/N; integer-division dust
///      becomes the dust return value, sent to the protocol fee recipient by the
///      caller). `splitWeighted` is reserved for v2 when souls accrue per-call weight.
library RoyaltyFanout {
    /// @notice Reverts when N=0 (no souls in communion).
    error NoSouls();

    /// @notice Split `payment` equally across `n` recipients.
    /// @param payment Total payment in wei.
    /// @param n Number of souls.
    /// @return payouts Length-n array; each entry equals payment/n.
    /// @return dust payment - n*payouts[0]; the integer-division remainder.
    function splitEqual(uint256 payment, uint256 n)
        internal
        pure
        returns (uint256[] memory payouts, uint256 dust)
    {
        if (n == 0) revert NoSouls();
        uint256 perSoul = payment / n;
        payouts = new uint256[](n);
        for (uint256 i = 0; i < n; ++i) {
            payouts[i] = perSoul;
        }
        dust = payment - perSoul * n;
    }
}
