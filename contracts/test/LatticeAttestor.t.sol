// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {LatticeAttestor} from "../src/LatticeAttestor.sol";
import {ILatticeAttestor} from "../src/interfaces/ILatticeAttestor.sol";

contract LatticeAttestorTest is Test {
    LatticeAttestor internal attestor;
    address internal admin = address(this);
    address internal nonAdmin = makeAddr("nonAdmin");

    address internal provider = makeAddr("provider");
    uint256 internal teePk = uint256(keccak256("tee.signer.0g.galileo"));
    address internal teeSigner;

    function setUp() public {
        attestor = new LatticeAttestor(admin);
        teeSigner = vm.addr(teePk);
    }

    function _signEip191(uint256 pk, bytes32 messageHash) internal pure returns (bytes memory) {
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ethDigest);
        return abi.encodePacked(r, s, v);
    }

    function _signTeeText(uint256 pk, bytes memory teeText) internal pure returns (bytes memory) {
        return _signEip191(pk, keccak256(teeText));
    }

    function test_RegisterProvider_AdminOnly() public {
        attestor.registerProvider(provider, teeSigner, "https://galileo-tee.0g.ai");
        assertEq(attestor.providerSigner(provider), teeSigner);
    }

    function test_RegisterProvider_NonAdminReverts() public {
        vm.prank(nonAdmin);
        vm.expectRevert(ILatticeAttestor.NotAdmin.selector);
        attestor.registerProvider(provider, teeSigner, "x");
    }

    function test_RegisterProvider_ZeroAddressReverts() public {
        vm.expectRevert(ILatticeAttestor.ZeroAddress.selector);
        attestor.registerProvider(address(0), teeSigner, "x");
        vm.expectRevert(ILatticeAttestor.ZeroAddress.selector);
        attestor.registerProvider(provider, address(0), "x");
    }

    function test_RevokeProvider_ClearsSigner() public {
        attestor.registerProvider(provider, teeSigner, "x");
        attestor.revokeProvider(provider);
        assertEq(attestor.providerSigner(provider), address(0));
    }

    function test_VerifyAndMark_HappyPath() public {
        attestor.registerProvider(provider, teeSigner, "x");
        string memory chatID = "chat-abc123";
        bytes memory teeText = bytes(string.concat("{\"chatID\":\"", chatID, "\",\"cost\":42}"));
        bytes memory sig = _signTeeText(teePk, teeText);

        address recovered = attestor.verifyAndMark(provider, chatID, teeText, sig);
        assertEq(recovered, teeSigner);

        bytes32 proofId = keccak256(abi.encode(provider, chatID));
        assertTrue(attestor.usedProofs(proofId));
    }

    function test_VerifyAndMark_UnregisteredProviderReverts() public {
        bytes memory teeText = bytes("anything");
        bytes memory sig = _signTeeText(teePk, teeText);
        vm.expectRevert(abi.encodeWithSelector(ILatticeAttestor.UnregisteredProvider.selector, provider));
        attestor.verifyAndMark(provider, "chat", teeText, sig);
    }

    function test_VerifyAndMark_BadSignatureReverts() public {
        attestor.registerProvider(provider, teeSigner, "x");
        bytes memory teeText = bytes("chat-xyz blob");
        // Sign with a different key.
        uint256 wrongPk = uint256(keccak256("not.tee"));
        bytes memory sig = _signTeeText(wrongPk, teeText);
        vm.expectRevert(ILatticeAttestor.InvalidAttestationSignature.selector);
        attestor.verifyAndMark(provider, "chat-xyz", teeText, sig);
    }

    function test_VerifyAndMark_ChatIdMissingReverts() public {
        attestor.registerProvider(provider, teeSigner, "x");
        bytes memory teeText = bytes("text without the chatid here");
        bytes memory sig = _signTeeText(teePk, teeText);
        vm.expectRevert(ILatticeAttestor.ChatIdMissingFromText.selector);
        attestor.verifyAndMark(provider, "missing-chatid", teeText, sig);
    }

    function test_VerifyAndMark_ReplayReverts() public {
        attestor.registerProvider(provider, teeSigner, "x");
        string memory chatID = "chat-replay";
        bytes memory teeText = bytes(string.concat("{\"id\":\"", chatID, "\"}"));
        bytes memory sig = _signTeeText(teePk, teeText);

        attestor.verifyAndMark(provider, chatID, teeText, sig);

        bytes32 proofId = keccak256(abi.encode(provider, chatID));
        vm.expectRevert(abi.encodeWithSelector(ILatticeAttestor.AttestationAlreadyUsed.selector, proofId));
        attestor.verifyAndMark(provider, chatID, teeText, sig);
    }
}
