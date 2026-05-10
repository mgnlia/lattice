// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title ILatticeRegistry
/// @notice The Lattice multi-party communion registry. N souls jointly produce one
///         TEE-attested inference; a single payment is fanned out N ways to soul
///         royalty wallets after attestation.
interface ILatticeRegistry {
    /// @notice Snapshot of a single Communion. Created by `openCommunion`,
    ///         finalised by `submitAttestation`, paid out by `settleRoyalties`.
    struct Communion {
        uint256[] soulIds;
        address[] royaltyWallets;
        address payer;
        uint256 payment;
        bytes32 contextHash;
        bytes32 outputHash;
        bytes32 usageHash;
        address provider;
        string chatID;
        uint64 openedAt;
        uint64 attestedAt;
        bool settled;
    }

    /// @notice Reverts when the soul count is zero or exceeds MAX_SOULS_PER_COMMUNION.
    error SoulCountOutOfRange(uint256 n);
    /// @notice Reverts when soulIds are not strictly ascending (orchestrator must sort).
    error SoulIdsNotSorted();
    /// @notice Reverts when participation receipt count != soul count.
    error ReceiptCountMismatch();
    /// @notice Reverts when no payment was attached at openCommunion.
    error PaymentRequired();
    /// @notice Reverts when a participation receipt does not recover to the soul owner.
    error InvalidParticipationReceipt(uint256 soulId);
    /// @notice Reverts when communionId is unknown.
    error CommunionNotFound(uint256 communionId);
    /// @notice Reverts when attempting to attest a communion that's already attested.
    error CommunionAlreadyAttested(uint256 communionId);
    /// @notice Reverts when settling a communion that hasn't been attested yet.
    error CommunionNotAttested(uint256 communionId);
    /// @notice Reverts when settling a communion twice.
    error CommunionAlreadySettled(uint256 communionId);
    /// @notice Reverts on zero-address arguments.
    error ZeroAddress();
    /// @notice Reverts when a royalty transfer fails.
    error RoyaltyTransferFailed(address to);

    event CommunionOpened(
        uint256 indexed communionId,
        uint256[] soulIds,
        address indexed payer,
        uint256 payment,
        bytes32 contextHash,
        uint64 openedAt
    );

    event CommunionAttested(
        uint256 indexed communionId,
        address indexed provider,
        string chatID,
        bytes32 outputHash,
        bytes32 usageHash,
        uint64 attestedAt
    );

    event CommunionSettled(
        uint256 indexed communionId,
        address[] royaltyWallets,
        uint256[] payouts,
        uint256 dust
    );

    /// @notice Maximum souls in a single Communion. Bounds gas and provider context.
    function MAX_SOULS_PER_COMMUNION() external view returns (uint256);

    /// @notice Open a new Communion.
    /// @param nonce Orchestrator-chosen unique value per (payer, contextHash). Lets
    ///        the orchestrator + soul owners deterministically pre-compute the
    ///        communionId before submission.
    /// @param soulIds Sorted ascending list of participating soul iNFT ids.
    /// @param contextHash keccak256 of the merged TEE input (orchestrator commitment).
    /// @param participationReceipts Length-equal-to-soulIds array of EIP-191 sigs by
    ///        each soul owner over the canonical participation message.
    /// @return communionId Deterministic id = uint256(keccak256(payer ‖ nonce ‖ contextHash)).
    function openCommunion(
        bytes32 nonce,
        uint256[] calldata soulIds,
        bytes32 contextHash,
        bytes[] calldata participationReceipts
    ) external payable returns (uint256 communionId);

    /// @notice Submit the TEE attestation for a Communion.
    /// @param communionId The Communion to attest.
    /// @param provider 0G Compute provider EVM address.
    /// @param chatID Server-issued chatID.
    /// @param outputHash keccak256 of the response content the orchestrator is committing to.
    /// @param usageHash keccak256 of JSON.stringify(data.usage).
    /// @param teeText `ResponseSignature.text` returned by /v1/proxy/signature.
    /// @param teeSignature 65-byte ECDSA signature.
    function submitAttestation(
        uint256 communionId,
        address provider,
        string calldata chatID,
        bytes32 outputHash,
        bytes32 usageHash,
        bytes calldata teeText,
        bytes calldata teeSignature
    ) external;

    /// @notice Settle a Communion: split payment equally to royalty wallets.
    /// @dev Anyone can call once the Communion is attested. Dust (integer-division
    ///      remainder) is sent to the protocol fee recipient.
    function settleRoyalties(uint256 communionId) external;

    /// @notice Predict the communionId for a given (payer, nonce, contextHash).
    ///         Off-chain orchestrator + soul owners call this view (or compute it
    ///         locally) to bind their participation receipts before submission.
    /// @dev Pure function; same inputs always produce the same id.
    function predictCommunionId(address payer, bytes32 nonce, bytes32 contextHash)
        external
        pure
        returns (uint256);

    /// @notice Reverts when openCommunion is called with a (payer, nonce, contextHash)
    ///         tuple that has already produced a Communion (collision = griefing
    ///         protection).
    error CommunionIdCollision(uint256 communionId);

    /// @notice Build the EIP-191 message a soul owner signs to participate.
    /// @dev keccak256(abi.encode("LATTICE_OPEN", chainId, address(this), communionId, contextHash)).
    function participationMessage(uint256 communionId, bytes32 contextHash)
        external
        view
        returns (bytes32);

    /// @notice Read a Communion snapshot.
    function communionOf(uint256 communionId) external view returns (Communion memory);
}
