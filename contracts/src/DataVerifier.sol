// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {
    IERC7857DataVerifier,
    PreimageProofOutput,
    TransferValidityProofOutput
} from "@0glabs/0g-agent-nft/contracts/interfaces/IERC7857DataVerifier.sol";

/// @title DataVerifier
/// @notice Deterministic ERC-7857 verifier for Lattice hackathon scope.
/// @dev Reasoning from first principles: the upstream Verifier from the
///      0glabs/0g-agent-nft eip-7857-draft branch has a stubbed TEE attestation
///      check (bool isValid = true). For Lattice v1 we provide a similarly
///      deterministic verifier so we can mint and transfer Tutor INFTs in
///      tests and on Galileo testnet. Production-grade DCAP attestation
///      verification is intentionally NOT shipped here (5-15M gas; see
///      research/06-0g-compute-sdk-current.md). Off-chain orchestrator
///      emits PublishedSealedKey via the AgentNFT events; per-inference
///      verification uses the cheap ECDSA path in AttestationVerifier.
contract DataVerifier is IERC7857DataVerifier {
    /// @notice Thrown when the preimage proof is not exactly 32 bytes.
    error PreimageProofWrongLength(uint256 idx, uint256 length);

    /// @notice Thrown when the transfer proof has invalid length.
    error TransferProofWrongLength(uint256 idx, uint256 length);

    /// @notice Thrown when the proof nonce has already been observed.
    error ProofReplay(bytes32 nonce);

    /// @dev Replay-protection set for transfer proofs.
    mapping(bytes32 nonce => bool used) private _usedProofs;

    /// @notice Verify preimage proofs by treating proof bytes as the dataHash itself.
    /// @dev Public-data path: caller passes the 32-byte hash; we trust it
    ///      because the educator already commits to the corpus Merkle root
    ///      out of band. For mint, this is sufficient - the on-chain hash is
    ///      the binding commitment, and authenticity comes from the SoulINFT
    ///      issuer signature (see SoulINFT.mintSoul).
    /// @param proofs Array of 32-byte hash buffers.
    /// @return outputs One PreimageProofOutput per proof, all valid.
    function verifyPreimage(bytes[] calldata proofs)
        external
        pure
        override
        returns (PreimageProofOutput[] memory outputs)
    {
        outputs = new PreimageProofOutput[](proofs.length);
        for (uint256 i = 0; i < proofs.length; i++) {
            if (proofs[i].length != 32) {
                revert PreimageProofWrongLength(i, proofs[i].length);
            }
            outputs[i] = PreimageProofOutput({dataHash: bytes32(proofs[i]), isValid: true});
        }
    }

    /// @notice Verify a transfer-validity proof packed per ERC-7857 draft layout.
    /// @dev Layout (private data, 190 bytes):
    ///      [0]      flags (bit7 proof type, bit6 privacy)
    ///      [1..66]  65-byte accessibility signature (currently ignored - stub)
    ///      [66..114] 48-byte nonce
    ///      [114..146] newDataHash
    ///      [146..178] oldDataHash
    ///      [178..190] sealedKey (12+ bytes; we read first 16 as bytes16 padded)
    ///      For Lattice we accept the relaxed 178-190 sealed key window.
    /// @param proofs Array of packed proof buffers.
    /// @return outputs One TransferValidityProofOutput per proof.
    function verifyTransferValidity(bytes[] calldata proofs)
        external
        override
        returns (TransferValidityProofOutput[] memory outputs)
    {
        outputs = new TransferValidityProofOutput[](proofs.length);
        for (uint256 i = 0; i < proofs.length; i++) {
            bytes calldata p = proofs[i];
            // Layout requires at least 194 bytes so the 16-byte sealed key fits.
            if (p.length < 194) {
                revert TransferProofWrongLength(i, p.length);
            }
            // Replay protection on the embedded nonce window [66..114].
            bytes32 nonce = keccak256(p[66:114]);
            if (_usedProofs[nonce]) {
                revert ProofReplay(nonce);
            }
            _usedProofs[nonce] = true;

            // Decode receiver from accessibility signature [1..66] over a digest of
            // (newDataHash || oldDataHash || nonce). EIP-191 prefix applied.
            bytes32 newHash = bytes32(p[114:146]);
            bytes32 oldHash = bytes32(p[146:178]);
            bytes16 sealedKey = bytes16(p[178:194]);

            address receiver = _recoverReceiver(p[1:66], newHash, oldHash, p[66:114]);

            outputs[i] = TransferValidityProofOutput({
                oldDataHash: oldHash,
                newDataHash: newHash,
                receiver: receiver,
                sealedKey: sealedKey,
                isValid: receiver != address(0)
            });
        }
    }

    /// @dev Reconstructs the message hash the receiver signed and ecrecovers.
    function _recoverReceiver(
        bytes calldata sig65,
        bytes32 newHash,
        bytes32 oldHash,
        bytes calldata nonce
    ) private pure returns (address) {
        if (sig65.length != 65) return address(0);
        bytes32 inner = keccak256(abi.encodePacked(newHash, oldHash, nonce));
        // Match upstream Verifier.sol's hex-string-of-hash + EIP-191 prefix.
        bytes32 ethDigest =
            keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n66", _toHexString(inner)));
        bytes32 r;
        bytes32 s;
        uint8 v;
        // Pull r/s/v from the calldata slice via a memory copy (calldata loadable).
        bytes memory sigMem = sig65;
        assembly {
            r := mload(add(sigMem, 32))
            s := mload(add(sigMem, 64))
            v := byte(0, mload(add(sigMem, 96)))
        }
        if (v < 27) v += 27;
        return ecrecover(ethDigest, v, r, s);
    }

    /// @dev Convert a bytes32 to a 0x-prefixed lowercase hex string of length 66.
    function _toHexString(bytes32 value) private pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory out = new bytes(66);
        out[0] = "0";
        out[1] = "x";
        for (uint256 i = 0; i < 32; i++) {
            uint8 b = uint8(value[i]);
            out[2 + (i * 2)] = alphabet[b >> 4];
            out[3 + (i * 2)] = alphabet[b & 0x0f];
        }
        return string(out);
    }
}
