// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {AttestationVerifierContract} from "../src/AttestationVerifier.sol";

contract AttestationVerifierTest is Test {
    AttestationVerifierContract internal verifier;

    uint256 internal signerPk;
    address internal signer;

    function setUp() public {
        verifier = new AttestationVerifierContract();
        signerPk = uint256(keccak256("lattice.signer.pk"));
        signer = vm.addr(signerPk);
    }

    /// Happy path: EIP-191 signature recovers to the registered signer.
    function test_VerifyEip191HappyPath() public view {
        bytes32 msgHash = keccak256("hello lattice");
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", msgHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        assertTrue(verifier.verify(msgHash, sig, signer));
    }

    /// Failure: signature by a different key must not verify.
    function test_VerifyEip191WrongSigner() public view {
        bytes32 msgHash = keccak256("hello lattice");
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", msgHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        address rogue = vm.addr(uint256(keccak256("rogue")));
        assertFalse(verifier.verify(msgHash, sig, rogue));
    }

    /// Failure: zero address must short-circuit to false even with a valid sig.
    function test_VerifyEip191ZeroSigner() public view {
        bytes32 msgHash = keccak256("hello lattice");
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", msgHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        assertFalse(verifier.verify(msgHash, sig, address(0)));
    }

    /// Raw verify path used for already-prefixed digests.
    function test_VerifyRawHappyPath() public view {
        bytes32 digest = keccak256("merge attestation digest");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        assertTrue(verifier.verifyRaw(digest, sig, signer));
    }
}
