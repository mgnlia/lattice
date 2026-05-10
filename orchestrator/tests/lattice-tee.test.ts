/**
 * lattice-tee.test.ts
 *
 * Verifies the TEE-stub produces an EIP-191 signature whose recovery matches the
 * known signer address AND that the produced `text` blob contains the supplied
 * chatID — both invariants the on-chain LatticeAttestor relies on.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ethers } from 'ethers';
import {
  attestForChat,
  getLatticeTeeSignerAddress,
  _resetLatticeTeeSignerForTests,
} from '../src/lib/lattice-tee.js';

beforeAll(() => {
  process.env.TEE_STUB_PRIVATE_KEY =
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
  _resetLatticeTeeSignerForTests();
});

describe('lattice-tee', () => {
  it('produces an EIP-191 signature recoverable to the expected signer', async () => {
    const att = await attestForChat({ chatID: 'chat-test-001', costNanoOG: 42 });
    const signer = getLatticeTeeSignerAddress();
    expect(att.signer.toLowerCase()).toBe(signer.toLowerCase());

    // On-chain attestor uses ECDSA.recover(keccak256(text), sig). Replicate:
    const messageHash = ethers.keccak256(att.text);
    const recovered = ethers.verifyMessage(ethers.getBytes(messageHash), att.signature);
    expect(recovered.toLowerCase()).toBe(signer.toLowerCase());
  });

  it("emits a `text` blob containing the chatID literally (so on-chain _contains check passes)", async () => {
    const chatID = 'lattice-abc-9876';
    const att = await attestForChat({ chatID });
    const utf8 = ethers.toUtf8String(att.text);
    expect(utf8).toContain(chatID);
  });

  it('produces distinct signatures for distinct chatIDs', async () => {
    const a = await attestForChat({ chatID: 'a-id' });
    const b = await attestForChat({ chatID: 'b-id' });
    expect(a.signature).not.toBe(b.signature);
    expect(a.text).not.toBe(b.text);
  });
});
