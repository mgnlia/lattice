// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ILatticeAttestor} from "./interfaces/ILatticeAttestor.sol";
import {AttestationVerifier} from "./AttestationVerifier.sol";

/// @title LatticeAttestor
/// @notice Provider registry + TEE attestation verifier shared by LatticeRegistry
///         (and reusable by future agentism primitives — Confessional, Ordination).
/// @dev v1 attestation model (per researcher spike, 2026-05-10):
///      The 0G Compute SDK v0.8.x deprecated the `Request-Hash` header. The TEE
///      response signature comes from `GET {provider}/v1/proxy/signature/{chatID}`
///      and signs an opaque server-generated `text` whose payload is
///      `requestHash(32) || cost(16)` (per `verify_response_signature.circom`
///      in `0gfoundation/0g-zk-settlement-server`). The TEE signature does NOT
///      cover the request body. This contract therefore:
///        (1) verifies ECDSA over `text` recovers to the registered TEE signer
///            for the named provider, AND
///        (2) verifies `text` literally contains the supplied `chatID` — a
///            cheap byte-loop check that pins the attestation to a specific
///            chat session.
///      Soul-id binding is achieved by the caller (LatticeRegistry) committing
///      `(provider, chatID, sortedSoulIds, outputHash, usageHash)` on-chain when
///      it forwards the attestation. The Attestor's job is just to verify that
///      *some* TEE inference with this chatID and signed by this provider's
///      registered key actually happened. Replay protection is keyed on
///      `(provider, chatID)`.
contract LatticeAttestor is ILatticeAttestor, AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("LATTICE_ATTESTOR_ADMIN_ROLE");
    bytes32 public constant ATTESTOR_CALLER_ROLE = keccak256("LATTICE_ATTESTOR_CALLER_ROLE");

    /// @inheritdoc ILatticeAttestor
    mapping(address provider => address teeSigner) public providerSigner;

    /// @inheritdoc ILatticeAttestor
    mapping(bytes32 proofId => bool used) public usedProofs;

    /// @notice Construct with `admin` granted both DEFAULT_ADMIN_ROLE and ADMIN_ROLE.
    /// @param admin Address that can register / revoke providers and grant ATTESTOR_CALLER_ROLE.
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    /// @inheritdoc ILatticeAttestor
    function registerProvider(address provider, address teeSigner, string calldata providerUri)
        external
        override
    {
        if (!hasRole(ADMIN_ROLE, msg.sender)) revert NotAdmin();
        if (provider == address(0) || teeSigner == address(0)) revert ZeroAddress();
        providerSigner[provider] = teeSigner;
        emit ProviderRegistered(provider, teeSigner, providerUri);
    }

    /// @inheritdoc ILatticeAttestor
    function revokeProvider(address provider) external override {
        if (!hasRole(ADMIN_ROLE, msg.sender)) revert NotAdmin();
        if (provider == address(0)) revert ZeroAddress();
        delete providerSigner[provider];
        emit ProviderRevoked(provider);
    }

    /// @inheritdoc ILatticeAttestor
    function verifyAndMark(
        address provider,
        string calldata chatID,
        bytes calldata teeText,
        bytes calldata teeSignature
    ) external override returns (address teeSigner) {
        // Anyone can submit an attestation by default. If the deployer wants a closed
        // verifier (e.g. only LatticeRegistry can call), they grant ATTESTOR_CALLER_ROLE
        // exclusively to it and add a check here. v1 ships open by design — the proof
        // is self-validating and replay-protected, so opening it does not weaken the
        // protocol.

        teeSigner = providerSigner[provider];
        if (teeSigner == address(0)) revert UnregisteredProvider(provider);

        bool ok = AttestationVerifier.verify(keccak256(teeText), teeSignature, teeSigner);
        if (!ok) revert InvalidAttestationSignature();

        if (!_contains(teeText, bytes(chatID))) revert ChatIdMissingFromText();

        bytes32 proofId = keccak256(abi.encode(provider, chatID));
        if (usedProofs[proofId]) revert AttestationAlreadyUsed(proofId);
        usedProofs[proofId] = true;

        emit AttestationVerified(proofId, provider, teeSigner);
    }

    /// @notice Cheap byte-substring search. Returns true if `needle` appears
    ///         anywhere in `haystack`. Used to confirm the supplied chatID is
    ///         actually inside the TEE-signed text blob.
    /// @dev Naive O(n*m). For chatIDs (~36 bytes UUID) and texts (a few hundred
    ///      bytes) this is ~5k gas worst case — cheaper than parsing JSON on-chain.
    function _contains(bytes memory haystack, bytes memory needle) internal pure returns (bool) {
        uint256 hl = haystack.length;
        uint256 nl = needle.length;
        if (nl == 0) return true;
        if (nl > hl) return false;
        for (uint256 i = 0; i <= hl - nl; ++i) {
            bool match_ = true;
            for (uint256 j = 0; j < nl; ++j) {
                if (haystack[i + j] != needle[j]) {
                    match_ = false;
                    break;
                }
            }
            if (match_) return true;
        }
        return false;
    }
}
