// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title ILatticeAttestor
/// @notice Interface for the TEE attestation verifier used by LatticeRegistry.
/// @dev Decoupled so other agentism primitives (Confessional, Ordination) can
///      reuse the same provider registry + verify-and-mark logic.
interface ILatticeAttestor {
    /// @notice Reverts when the provider has not been registered.
    error UnregisteredProvider(address provider);
    /// @notice Reverts when the TEE signature does not recover to the provider's
    ///         registered signer.
    error InvalidAttestationSignature();
    /// @notice Reverts when the supplied chatID is not present in the TEE-signed text.
    error ChatIdMissingFromText();
    /// @notice Reverts on attempts to reuse a (provider, chatID) attestation.
    error AttestationAlreadyUsed(bytes32 proofId);
    /// @notice Reverts on zero-address arguments.
    error ZeroAddress();
    /// @notice Reverts when caller lacks the admin role.
    error NotAdmin();

    /// @notice Emitted when a TEE provider is registered for attestation acceptance.
    /// @param provider EVM address of the 0G Compute provider.
    /// @param teeSigner ECDSA address that the TEE signs with (registered after off-chain DCAP).
    /// @param providerUri Human-readable provider URI for off-chain discovery.
    event ProviderRegistered(address indexed provider, address indexed teeSigner, string providerUri);

    /// @notice Emitted when a provider is revoked. Stored signer reverts to address(0).
    event ProviderRevoked(address indexed provider);

    /// @notice Emitted on a successful verification + replay-mark.
    /// @param proofId keccak256(abi.encode(provider, chatID)).
    /// @param provider Verified provider.
    /// @param teeSigner Recovered TEE signer (matches the registered one).
    event AttestationVerified(bytes32 indexed proofId, address indexed provider, address indexed teeSigner);

    /// @notice Provider registry mapping (provider EVM address → TEE signer address).
    /// @param provider 0G Compute provider EVM address.
    /// @return teeSigner Registered ECDSA signer; zero-address means unregistered.
    function providerSigner(address provider) external view returns (address teeSigner);

    /// @notice Replay tracker. True once `verifyAndMark` has consumed a (provider, chatID).
    /// @param proofId keccak256(abi.encode(provider, chatID)).
    function usedProofs(bytes32 proofId) external view returns (bool);

    /// @notice Register a TEE provider for attestation acceptance.
    /// @dev Off-chain DCAP verification is the prerequisite; this call records the
    ///      verified ECDSA signer. Admin-only.
    function registerProvider(address provider, address teeSigner, string calldata providerUri) external;

    /// @notice Revoke a provider. Subsequent attestations from this provider revert.
    function revokeProvider(address provider) external;

    /// @notice Verify a TEE attestation and mark it used.
    /// @param provider 0G Compute provider EVM address.
    /// @param chatID Server-issued chat ID returned by the TeeML provider.
    /// @param teeText `ResponseSignature.text` returned by GET /v1/proxy/signature/{chatID}.
    /// @param teeSignature 65-byte ECDSA signature (`ResponseSignature.signature`).
    /// @return teeSigner Recovered (and registered) TEE signer address.
    function verifyAndMark(
        address provider,
        string calldata chatID,
        bytes calldata teeText,
        bytes calldata teeSignature
    ) external returns (address teeSigner);
}
