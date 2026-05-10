// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title AttestationVerifier
/// @notice Pure helper for verifying TEE-signed attestations using EIP-191 ECDSA.
/// @dev The 0G Compute SDK signs response payloads with `ethers.hashMessage()` +
///      `ethers.recoverAddress()`, which is the EIP-191 personal_sign scheme.
///      This contract recovers the signer from the digest and matches against the
///      expected signer. Per-call cost ~3-5k gas. Used by LatticeAttestor for
///      cheap on-chain attestation checks (heavy DCAP quote verification stays
///      off-chain by design — see docs/ARCH.md §2 trust model).
library AttestationVerifier {
    using MessageHashUtils for bytes32;

    /// @notice Verify an EIP-191 personal-signed message recovers to expectedSigner.
    /// @param messageHash The 32-byte hash of the canonical message text.
    /// @param signature 65-byte (r||s||v) ECDSA secp256k1 signature.
    /// @param expectedSigner The expected signing address registered off-chain.
    /// @return ok True iff signature recovers to expectedSigner.
    function verify(bytes32 messageHash, bytes calldata signature, address expectedSigner)
        internal
        pure
        returns (bool ok)
    {
        if (expectedSigner == address(0)) {
            return false;
        }
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(ethSignedHash, signature);
        if (err != ECDSA.RecoverError.NoError) {
            return false;
        }
        return recovered == expectedSigner;
    }

    /// @notice Verify a raw 32-byte digest signature (no EIP-191 prefix).
    /// @dev Used for signed-typed-data flows or pre-prefixed digests. Prefer the
    ///      EIP-191 variant for SDK-produced signatures.
    /// @param digest The 32-byte digest the signature is over.
    /// @param signature 65-byte ECDSA signature.
    /// @param expectedSigner The expected signing address.
    /// @return ok True iff signature recovers to expectedSigner.
    function verifyRaw(bytes32 digest, bytes calldata signature, address expectedSigner)
        internal
        pure
        returns (bool ok)
    {
        if (expectedSigner == address(0)) {
            return false;
        }
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError) {
            return false;
        }
        return recovered == expectedSigner;
    }
}

/// @title AttestationVerifierContract
/// @notice External-callable wrapper around the AttestationVerifier library.
/// @dev Exposed so off-chain tooling and other contracts that prefer composition
///      over inheritance can call into a deployed verifier. The library is the
///      canonical path; this contract is a thin shim.
contract AttestationVerifierContract {
    /// @notice Verify an EIP-191 personal-signed message recovers to expectedSigner.
    /// @param messageHash The 32-byte hash of the canonical message text.
    /// @param signature 65-byte (r||s||v) ECDSA secp256k1 signature.
    /// @param expectedSigner The expected signing address.
    /// @return True iff signature recovers to expectedSigner.
    function verify(bytes32 messageHash, bytes calldata signature, address expectedSigner)
        external
        pure
        returns (bool)
    {
        return AttestationVerifier.verify(messageHash, signature, expectedSigner);
    }

    /// @notice Verify a raw digest signature against expectedSigner.
    /// @param digest The 32-byte digest the signature is over.
    /// @param signature 65-byte ECDSA signature.
    /// @param expectedSigner The expected signing address.
    /// @return True iff signature recovers to expectedSigner.
    function verifyRaw(bytes32 digest, bytes calldata signature, address expectedSigner)
        external
        pure
        returns (bool)
    {
        return AttestationVerifier.verifyRaw(digest, signature, expectedSigner);
    }
}
