// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC7857} from "@0glabs/0g-agent-nft/contracts/interfaces/IERC7857.sol";

/// @title ISoulINFT
/// @notice Lattice-specific surface on top of ERC-7857 AgentNFT. Each Soul is an
///         iNFT with an attached "domain" tag (e.g. "math", "lit") for UI grouping
///         plus a settable royalty wallet so a soul owner can route per-Communion
///         payouts to a different address than `ownerOf(soulId)`.
interface ISoulINFT is IERC7857 {
    /// @notice Reverts on zero-address arguments.
    error ZeroAddress();
    /// @notice Reverts when caller is not the soul owner.
    error NotSoulOwner();
    /// @notice Reverts when the soul has not been minted.
    error SoulNotFound(uint256 soulId);

    /// @notice Emitted when a new Soul is minted.
    event SoulMinted(
        uint256 indexed soulId,
        address indexed owner,
        bytes32 contextRoot,
        string domain,
        address royaltyWallet
    );

    /// @notice Emitted when a soul owner reroutes their royalty wallet.
    event RoyaltyWalletUpdated(uint256 indexed soulId, address indexed oldWallet, address indexed newWallet);

    /// @notice Domain tag for a soul (e.g. "math", "lit", "code").
    /// @param soulId Soul id.
    function domainOf(uint256 soulId) external view returns (string memory);

    /// @notice Royalty wallet for a soul. Defaults to the owner; rerouted by
    ///         `setRoyaltyWallet`.
    /// @param soulId Soul id.
    function royaltyWalletOf(uint256 soulId) external view returns (address);

    /// @notice Reroute a soul's royalty wallet. Only the soul owner can call.
    /// @param soulId Soul id.
    /// @param wallet New royalty wallet (cannot be zero).
    function setRoyaltyWallet(uint256 soulId, address wallet) external;

    /// @notice Mint a new Soul iNFT.
    /// @param to Recipient address.
    /// @param contextRoot 32-byte 0G Storage Merkle root of the encrypted context blob.
    /// @param domain Free-form domain tag (e.g. "math").
    /// @param royaltyWallet Initial royalty wallet (use `to` to default to owner).
    /// @return soulId Newly minted soul id.
    function mintSoul(address to, bytes32 contextRoot, string calldata domain, address royaltyWallet)
        external
        returns (uint256 soulId);
}
