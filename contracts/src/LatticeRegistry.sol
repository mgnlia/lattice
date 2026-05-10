// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ILatticeRegistry} from "./interfaces/ILatticeRegistry.sol";
import {ILatticeAttestor} from "./interfaces/ILatticeAttestor.sol";
import {ISoulINFT} from "./interfaces/ISoulINFT.sol";
import {AttestationVerifier} from "./AttestationVerifier.sol";
import {RoyaltyFanout} from "./RoyaltyFanout.sol";

/// @title LatticeRegistry
/// @notice The Lattice multi-party communion registry. N souls (ERC-7857 iNFTs)
///         jointly produce one TEE-attested inference, then a single payment is
///         fanned out N ways to the souls' royalty wallets.
/// @dev Lifecycle:
///        openCommunion → submitAttestation → settleRoyalties.
///      The TEE only attests "*some* inference with this chatID happened, signed
///      by this provider's registered key, with this cost". Soul-id binding is an
///      orchestrator commitment recorded on-chain at openCommunion (the contextHash
///      and the participation receipts) and at submitAttestation (chatID + outputHash
///      + usageHash). See LATTICE-ARCH.md §2 for the trust model.
contract LatticeRegistry is ILatticeRegistry {
    using RoyaltyFanout for uint256;

    /// @notice Maximum souls per communion. Bounds royalty-fanout gas and protects
    ///         against TeeML provider context-window collapse (per spike risk #1).
    uint256 public constant override MAX_SOULS_PER_COMMUNION = 16;

    /// @notice Soul iNFT contract used for ownership + royalty wallet lookups.
    ISoulINFT public immutable soulINFT;

    /// @notice Attestor contract that verifies TEE signatures.
    ILatticeAttestor public immutable attestor;

    /// @notice Recipient of integer-division dust on royalty splits.
    address public immutable protocolFeeRecipient;

    /// @notice Communion state by communionId.
    mapping(uint256 communionId => Communion) private _communions;

    /// @param soulINFT_ Deployed SoulINFT contract.
    /// @param attestor_ Deployed LatticeAttestor contract.
    /// @param protocolFeeRecipient_ Address to receive dust on settle (split remainder).
    constructor(ISoulINFT soulINFT_, ILatticeAttestor attestor_, address protocolFeeRecipient_) {
        if (
            address(soulINFT_) == address(0) || address(attestor_) == address(0)
                || protocolFeeRecipient_ == address(0)
        ) revert ZeroAddress();
        soulINFT = soulINFT_;
        attestor = attestor_;
        protocolFeeRecipient = protocolFeeRecipient_;
    }

    /// @inheritdoc ILatticeRegistry
    function openCommunion(
        bytes32 nonce,
        uint256[] calldata soulIds,
        bytes32 contextHash,
        bytes[] calldata participationReceipts
    ) external payable override returns (uint256 communionId) {
        uint256 n = soulIds.length;
        if (n == 0 || n > MAX_SOULS_PER_COMMUNION) revert SoulCountOutOfRange(n);
        if (participationReceipts.length != n) revert ReceiptCountMismatch();
        if (msg.value == 0) revert PaymentRequired();

        // Enforce sorted-ascending invariant so the contextHash commitment over
        // sortedSoulIds (computed off-chain by the orchestrator) cannot be reordered
        // post-hoc to a different soul set with a different royalty layout.
        for (uint256 i = 1; i < n; ++i) {
            if (soulIds[i] <= soulIds[i - 1]) revert SoulIdsNotSorted();
        }

        communionId = predictCommunionId(msg.sender, nonce, contextHash);
        if (_communions[communionId].openedAt != 0) revert CommunionIdCollision(communionId);

        // Snapshot royalty wallets at open time so a soul transfer mid-flight does
        // not divert in-flight royalties.
        address[] memory wallets = new address[](n);
        bytes32 partMsg = participationMessage(communionId, contextHash);
        for (uint256 i = 0; i < n; ++i) {
            uint256 soulId = soulIds[i];
            address ownerAddr = soulINFT.ownerOf(soulId);
            bool ok = AttestationVerifier.verify(partMsg, participationReceipts[i], ownerAddr);
            if (!ok) revert InvalidParticipationReceipt(soulId);
            address rw = soulINFT.royaltyWalletOf(soulId);
            wallets[i] = rw == address(0) ? ownerAddr : rw;
        }

        _communions[communionId] = Communion({
            soulIds: soulIds,
            royaltyWallets: wallets,
            payer: msg.sender,
            payment: msg.value,
            contextHash: contextHash,
            outputHash: bytes32(0),
            usageHash: bytes32(0),
            provider: address(0),
            chatID: "",
            openedAt: uint64(block.timestamp),
            attestedAt: 0,
            settled: false
        });

        emit CommunionOpened(communionId, soulIds, msg.sender, msg.value, contextHash, uint64(block.timestamp));
    }

    /// @inheritdoc ILatticeRegistry
    function submitAttestation(
        uint256 communionId,
        address provider,
        string calldata chatID,
        bytes32 outputHash,
        bytes32 usageHash,
        bytes calldata teeText,
        bytes calldata teeSignature
    ) external override {
        Communion storage c = _communions[communionId];
        if (c.openedAt == 0) revert CommunionNotFound(communionId);
        if (c.attestedAt != 0) revert CommunionAlreadyAttested(communionId);

        // Reverts if signature/chatID/provider invalid; marks the (provider,chatID)
        // proofId as used inside the attestor (replay protection).
        attestor.verifyAndMark(provider, chatID, teeText, teeSignature);

        c.provider = provider;
        c.chatID = chatID;
        c.outputHash = outputHash;
        c.usageHash = usageHash;
        c.attestedAt = uint64(block.timestamp);

        emit CommunionAttested(communionId, provider, chatID, outputHash, usageHash, uint64(block.timestamp));
    }

    /// @inheritdoc ILatticeRegistry
    function settleRoyalties(uint256 communionId) external override {
        Communion storage c = _communions[communionId];
        if (c.openedAt == 0) revert CommunionNotFound(communionId);
        if (c.attestedAt == 0) revert CommunionNotAttested(communionId);
        if (c.settled) revert CommunionAlreadySettled(communionId);

        c.settled = true;

        uint256 n = c.royaltyWallets.length;
        (uint256[] memory payouts, uint256 dust) = RoyaltyFanout.splitEqual(c.payment, n);

        for (uint256 i = 0; i < n; ++i) {
            (bool ok,) = c.royaltyWallets[i].call{value: payouts[i]}("");
            if (!ok) revert RoyaltyTransferFailed(c.royaltyWallets[i]);
        }
        if (dust > 0) {
            (bool okDust,) = protocolFeeRecipient.call{value: dust}("");
            if (!okDust) revert RoyaltyTransferFailed(protocolFeeRecipient);
        }

        emit CommunionSettled(communionId, c.royaltyWallets, payouts, dust);
    }

    /// @inheritdoc ILatticeRegistry
    function predictCommunionId(address payer, bytes32 nonce, bytes32 contextHash)
        public
        pure
        override
        returns (uint256)
    {
        return uint256(keccak256(abi.encode(payer, nonce, contextHash)));
    }

    /// @inheritdoc ILatticeRegistry
    function participationMessage(uint256 communionId, bytes32 contextHash)
        public
        view
        override
        returns (bytes32)
    {
        return keccak256(abi.encode("LATTICE_OPEN", block.chainid, address(this), communionId, contextHash));
    }

    /// @inheritdoc ILatticeRegistry
    function communionOf(uint256 communionId) external view override returns (Communion memory) {
        Communion storage c = _communions[communionId];
        if (c.openedAt == 0) revert CommunionNotFound(communionId);
        return c;
    }
}
