// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AgentNFT} from "@0glabs/0g-agent-nft/contracts/AgentNFT.sol";
import {ISoulINFT} from "./interfaces/ISoulINFT.sol";

/// @title SoulINFT
/// @notice ERC-7857 iNFT for a Lattice "Soul" — one agent identity with an encrypted
///         context blob on 0G Storage. Adds a settable royalty wallet (where Lattice
///         communion payouts route) and a free-form domain tag for UI grouping.
/// @dev Single dataItem per mint (the encrypted context Merkle root). The standard
///      ERC-7857 sealed-key transfer flow keeps the context private to the current
///      owner; the royalty wallet is a public reroute address used only by
///      LatticeRegistry's settle path.
contract SoulINFT is AgentNFT, ISoulINFT {
    /// @notice Per-soul domain tag (e.g. "math", "lit", "code").
    /// @dev Public so UIs can group + filter without an indexer.
    mapping(uint256 soulId => string) public _domain;

    /// @notice Per-soul royalty wallet. Defaults to the owner at mint time;
    ///         the owner can later reroute via `setRoyaltyWallet`.
    mapping(uint256 soulId => address) public _royaltyWallet;

    /// @inheritdoc ISoulINFT
    function domainOf(uint256 soulId) external view override returns (string memory) {
        return _domain[soulId];
    }

    /// @inheritdoc ISoulINFT
    function royaltyWalletOf(uint256 soulId) external view override returns (address) {
        return _royaltyWallet[soulId];
    }

    /// @inheritdoc ISoulINFT
    function setRoyaltyWallet(uint256 soulId, address wallet) external override {
        if (wallet == address(0)) revert ZeroAddress();
        if (this.ownerOf(soulId) != msg.sender) revert NotSoulOwner();
        if (_royaltyWallet[soulId] == address(0)) revert SoulNotFound(soulId);
        address old = _royaltyWallet[soulId];
        _royaltyWallet[soulId] = wallet;
        emit RoyaltyWalletUpdated(soulId, old, wallet);
    }

    /// @inheritdoc ISoulINFT
    function mintSoul(address to, bytes32 contextRoot, string calldata domain, address royaltyWallet)
        external
        override
        returns (uint256 soulId)
    {
        if (to == address(0)) revert ZeroAddress();
        address rw = royaltyWallet == address(0) ? to : royaltyWallet;

        bytes[] memory proofs = new bytes[](1);
        proofs[0] = abi.encodePacked(contextRoot);

        string[] memory descriptions = new string[](1);
        descriptions[0] = "encrypted_soul_context_root";

        soulId = SoulINFT(address(this)).__internalMint(proofs, descriptions, to);

        _domain[soulId] = domain;
        _royaltyWallet[soulId] = rw;

        emit SoulMinted(soulId, to, contextRoot, domain, rw);
    }

    /// @notice Internal mint trampoline; only callable by self.
    /// @dev Marked external so the inner self-call presents calldata-shaped
    ///      arguments to AgentNFT.mint. Reverts when called by anyone else.
    function __internalMint(bytes[] calldata proofs, string[] calldata descriptions, address to)
        external
        returns (uint256 soulId)
    {
        if (msg.sender != address(this)) revert NotSoulOwner();
        soulId = mint(proofs, descriptions, to);
    }
}
