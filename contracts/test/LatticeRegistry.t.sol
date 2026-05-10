// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Fixtures} from "./helpers/Fixtures.sol";
import {SoulINFT} from "../src/SoulINFT.sol";
import {LatticeAttestor} from "../src/LatticeAttestor.sol";
import {LatticeRegistry} from "../src/LatticeRegistry.sol";
import {ILatticeRegistry} from "../src/interfaces/ILatticeRegistry.sol";
import {ILatticeAttestor} from "../src/interfaces/ILatticeAttestor.sol";

contract LatticeRegistryTest is Test {
    SoulINFT internal soul;
    LatticeAttestor internal attestor;
    LatticeRegistry internal registry;

    address internal admin = address(this);
    address internal feeRecipient = makeAddr("protocol.fees");
    address internal payer = makeAddr("payer");
    address internal provider = makeAddr("provider");
    uint256 internal teePk = uint256(keccak256("tee.signer"));
    address internal teeSigner;

    // Five souls owned by distinct EOAs whose private keys we control.
    uint256[5] internal soulIds;
    uint256[5] internal soulOwnerPks;
    address[5] internal soulOwners;

    function setUp() public {
        Fixtures.LatticeStack memory s = Fixtures.deployLatticeStack(admin, feeRecipient);
        soul = s.soulINFT;
        attestor = s.attestor;
        registry = s.registry;

        teeSigner = vm.addr(teePk);
        attestor.registerProvider(provider, teeSigner, "https://provider.test");

        // Mint 5 souls with deterministic owner keys so we can sign receipts.
        for (uint256 i = 0; i < 5; ++i) {
            soulOwnerPks[i] = uint256(keccak256(abi.encode("soul.owner", i)));
            soulOwners[i] = vm.addr(soulOwnerPks[i]);
            soulIds[i] = soul.mintSoul(
                soulOwners[i],
                keccak256(abi.encode("ctx", i)),
                "domain",
                address(0)
            );
        }
        vm.deal(payer, 100 ether);
    }

    function _signEip191(uint256 pk, bytes32 messageHash) internal pure returns (bytes memory) {
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ethDigest);
        return abi.encodePacked(r, s, v);
    }

    function _allFiveSorted() internal view returns (uint256[] memory ids) {
        ids = new uint256[](5);
        for (uint256 i = 0; i < 5; ++i) ids[i] = soulIds[i];
        // soul ids are minted sequentially so they're already sorted.
    }

    function _signAllReceipts(uint256 communionId, bytes32 contextHash)
        internal
        view
        returns (bytes[] memory receipts)
    {
        bytes32 partMsg = registry.participationMessage(communionId, contextHash);
        receipts = new bytes[](5);
        for (uint256 i = 0; i < 5; ++i) {
            receipts[i] = _signEip191(soulOwnerPks[i], partMsg);
        }
    }

    function _openHappy() internal returns (uint256 communionId, bytes32 contextHash, bytes32 nonce) {
        contextHash = keccak256("merged.context");
        nonce = bytes32(uint256(0xdeadbeef));
        communionId = registry.predictCommunionId(payer, nonce, contextHash);
        bytes[] memory receipts = _signAllReceipts(communionId, contextHash);

        vm.prank(payer);
        registry.openCommunion{value: 5 ether}(nonce, _allFiveSorted(), contextHash, receipts);
    }

    function _attestHappy(uint256 communionId)
        internal
        returns (string memory chatID, bytes memory teeText)
    {
        chatID = "lattice-chat-001";
        teeText = bytes(string.concat("{\"id\":\"", chatID, "\",\"cost\":\"123\"}"));
        bytes memory sig = _signEip191(teePk, keccak256(teeText));
        registry.submitAttestation(
            communionId,
            provider,
            chatID,
            keccak256("output-payload"),
            keccak256("usage-payload"),
            teeText,
            sig
        );
    }

    // ===== HAPPY PATH ENTIRE LIFECYCLE =====

    function test_FullLifecycle_FiveSouls() public {
        (uint256 communionId,,) = _openHappy();

        ILatticeRegistry.Communion memory c = registry.communionOf(communionId);
        assertEq(c.soulIds.length, 5);
        assertEq(c.payer, payer);
        assertEq(c.payment, 5 ether);
        assertEq(c.openedAt, uint64(block.timestamp));
        assertEq(c.attestedAt, 0);
        assertFalse(c.settled);

        _attestHappy(communionId);
        c = registry.communionOf(communionId);
        assertEq(c.provider, provider);
        assertEq(c.chatID, "lattice-chat-001");
        assertEq(c.outputHash, keccak256("output-payload"));
        assertEq(c.attestedAt, uint64(block.timestamp));

        // Each soul owner gets 1 ether (5 ether / 5 souls).
        uint256[5] memory before;
        for (uint256 i = 0; i < 5; ++i) before[i] = soulOwners[i].balance;

        registry.settleRoyalties(communionId);

        for (uint256 i = 0; i < 5; ++i) {
            assertEq(soulOwners[i].balance - before[i], 1 ether, "each soul owner should receive 1 ether");
        }
        assertEq(feeRecipient.balance, 0, "no dust on a clean 5-way split");
        assertTrue(registry.communionOf(communionId).settled);
    }

    function test_Settle_ProducesDustToFeeRecipient() public {
        // Use 5 souls with payment that doesn't divide evenly.
        bytes32 contextHash = keccak256("ctx.dust");
        bytes32 nonce = bytes32(uint256(0xabc));
        uint256 communionId = registry.predictCommunionId(payer, nonce, contextHash);
        bytes[] memory receipts = _signAllReceipts(communionId, contextHash);

        vm.prank(payer);
        registry.openCommunion{value: 7 wei}(nonce, _allFiveSorted(), contextHash, receipts);

        _attestHappy(communionId);
        registry.settleRoyalties(communionId);

        // 7/5 = 1 each, dust = 2.
        for (uint256 i = 0; i < 5; ++i) assertEq(soulOwners[i].balance, 1);
        assertEq(feeRecipient.balance, 2);
    }

    // ===== OPEN PHASE FAILURES =====

    function test_Open_RevertsOnEmptySoulList() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ILatticeRegistry.SoulCountOutOfRange.selector, 0));
        registry.openCommunion{value: 1 ether}(bytes32(uint256(1)), new uint256[](0), bytes32(0), new bytes[](0));
    }

    function test_Open_RevertsOnTooManySouls() public {
        uint256[] memory many = new uint256[](17);
        for (uint256 i = 0; i < 17; ++i) many[i] = i + 1;
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ILatticeRegistry.SoulCountOutOfRange.selector, 17));
        registry.openCommunion{value: 1 ether}(bytes32(uint256(1)), many, bytes32(0), new bytes[](17));
    }

    function test_Open_RevertsOnUnsortedIds() public {
        uint256[] memory ids = new uint256[](3);
        ids[0] = soulIds[2];
        ids[1] = soulIds[0];
        ids[2] = soulIds[1];
        bytes[] memory receipts = new bytes[](3);
        vm.prank(payer);
        vm.expectRevert(ILatticeRegistry.SoulIdsNotSorted.selector);
        registry.openCommunion{value: 1 ether}(bytes32(uint256(1)), ids, bytes32(0), receipts);
    }

    function test_Open_RevertsOnReceiptCountMismatch() public {
        vm.prank(payer);
        vm.expectRevert(ILatticeRegistry.ReceiptCountMismatch.selector);
        registry.openCommunion{value: 1 ether}(bytes32(uint256(1)), _allFiveSorted(), bytes32(0), new bytes[](3));
    }

    function test_Open_RevertsOnZeroPayment() public {
        bytes32 contextHash = keccak256("c");
        bytes32 nonce = bytes32(uint256(1));
        uint256 communionId = registry.predictCommunionId(payer, nonce, contextHash);
        bytes[] memory receipts = _signAllReceipts(communionId, contextHash);
        vm.prank(payer);
        vm.expectRevert(ILatticeRegistry.PaymentRequired.selector);
        registry.openCommunion{value: 0}(nonce, _allFiveSorted(), contextHash, receipts);
    }

    function test_Open_RevertsOnInvalidParticipationReceipt() public {
        bytes32 contextHash = keccak256("c.invalid");
        bytes32 nonce = bytes32(uint256(2));
        uint256 communionId = registry.predictCommunionId(payer, nonce, contextHash);
        bytes[] memory receipts = _signAllReceipts(communionId, contextHash);

        // Replace one receipt with a bogus signature (sign with a wrong key).
        receipts[2] = _signEip191(uint256(keccak256("intruder")), registry.participationMessage(communionId, contextHash));

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ILatticeRegistry.InvalidParticipationReceipt.selector, soulIds[2]));
        registry.openCommunion{value: 1 ether}(nonce, _allFiveSorted(), contextHash, receipts);
    }

    function test_Open_RevertsOnIdCollision() public {
        // Open once; attempt to open again with same (payer, nonce, contextHash).
        (uint256 communionId, bytes32 contextHash, bytes32 nonce) = _openHappy();
        bytes[] memory receipts = _signAllReceipts(communionId, contextHash);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ILatticeRegistry.CommunionIdCollision.selector, communionId));
        registry.openCommunion{value: 1 ether}(nonce, _allFiveSorted(), contextHash, receipts);
    }

    // ===== ATTEST PHASE FAILURES =====

    function test_Attest_RevertsWhenCommunionMissing() public {
        bytes memory teeText = bytes("doesnt-matter");
        bytes memory sig = _signEip191(teePk, keccak256(teeText));
        vm.expectRevert(abi.encodeWithSelector(ILatticeRegistry.CommunionNotFound.selector, uint256(0xdead)));
        registry.submitAttestation(uint256(0xdead), provider, "x", bytes32(0), bytes32(0), teeText, sig);
    }

    function test_Attest_RevertsWhenAlreadyAttested() public {
        (uint256 communionId,,) = _openHappy();
        _attestHappy(communionId);

        // Attempting a second attestation reverts.
        bytes memory teeText = bytes("{\"id\":\"different-chat\"}");
        bytes memory sig = _signEip191(teePk, keccak256(teeText));
        vm.expectRevert(abi.encodeWithSelector(ILatticeRegistry.CommunionAlreadyAttested.selector, communionId));
        registry.submitAttestation(communionId, provider, "different-chat", bytes32(0), bytes32(0), teeText, sig);
    }

    function test_Attest_PropagatesAttestorErrors() public {
        (uint256 communionId,,) = _openHappy();
        // Provide a TEE text that doesn't include the chatID.
        bytes memory teeText = bytes("no chatid here");
        bytes memory sig = _signEip191(teePk, keccak256(teeText));
        vm.expectRevert(ILatticeAttestor.ChatIdMissingFromText.selector);
        registry.submitAttestation(communionId, provider, "missing", bytes32(0), bytes32(0), teeText, sig);
    }

    // ===== SETTLE PHASE FAILURES =====

    function test_Settle_RevertsWhenNotAttested() public {
        (uint256 communionId,,) = _openHappy();
        vm.expectRevert(abi.encodeWithSelector(ILatticeRegistry.CommunionNotAttested.selector, communionId));
        registry.settleRoyalties(communionId);
    }

    function test_Settle_RevertsWhenAlreadySettled() public {
        (uint256 communionId,,) = _openHappy();
        _attestHappy(communionId);
        registry.settleRoyalties(communionId);
        vm.expectRevert(abi.encodeWithSelector(ILatticeRegistry.CommunionAlreadySettled.selector, communionId));
        registry.settleRoyalties(communionId);
    }

    function test_Settle_RevertsWhenCommunionMissing() public {
        vm.expectRevert(abi.encodeWithSelector(ILatticeRegistry.CommunionNotFound.selector, uint256(123)));
        registry.settleRoyalties(123);
    }

    // ===== ROYALTY ROUTING =====

    function test_Settle_HonorsCustomRoyaltyWallets() public {
        // Reroute soul[0] and soul[2] to custom treasury wallets.
        address treasury0 = makeAddr("t0");
        address treasury2 = makeAddr("t2");
        vm.prank(soulOwners[0]);
        soul.setRoyaltyWallet(soulIds[0], treasury0);
        vm.prank(soulOwners[2]);
        soul.setRoyaltyWallet(soulIds[2], treasury2);

        (uint256 communionId,,) = _openHappy();
        _attestHappy(communionId);
        registry.settleRoyalties(communionId);

        assertEq(treasury0.balance, 1 ether);
        assertEq(treasury2.balance, 1 ether);
        assertEq(soulOwners[0].balance, 0);
        assertEq(soulOwners[2].balance, 0);
        // Untouched souls kept default (= owner) wallets.
        assertEq(soulOwners[1].balance, 1 ether);
        assertEq(soulOwners[3].balance, 1 ether);
        assertEq(soulOwners[4].balance, 1 ether);
    }

    // ===== PREDICT / PARTICIPATION HELPERS =====

    function test_PredictCommunionId_DeterministicAndDistinct() public view {
        uint256 a = registry.predictCommunionId(payer, bytes32(uint256(1)), keccak256("ctx"));
        uint256 b = registry.predictCommunionId(payer, bytes32(uint256(1)), keccak256("ctx"));
        uint256 c = registry.predictCommunionId(payer, bytes32(uint256(2)), keccak256("ctx"));
        assertEq(a, b);
        assertTrue(a != c);
    }
}
