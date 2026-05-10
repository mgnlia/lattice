/**
 * lattice-flow.test.ts
 *
 * Exercises the Lattice orchestration logic with the on-chain bridge fully
 * mocked. We verify:
 *   - mintSoulFlow records the soul in state and forwards correct args
 *   - prepareCommunion sorts soulIds, computes a stable contextHash + nonce,
 *     and persists a 'prepared' communion
 *   - openAndRunCommunion follows the open → attest path and updates state
 *   - settleCommunionFlow transitions attested → settled
 *   - verifyParticipationReceipt accepts valid sigs and rejects forgeries
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { ethers } from 'ethers';

beforeAll(() => {
  process.env.TEE_STUB_PRIVATE_KEY =
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
  process.env.NODE_ENV = 'test';
});

// Mock the on-chain bridge BEFORE importing flow.
vi.mock('../src/lib/lattice-chain.js', () => {
  return {
    mintSoul: vi.fn(async (args: { to: string; contextRoot: string; domain: string }) => {
      // Deterministic ascending soulIds across test runs.
      mintCalls += 1n;
      return { txHash: `0xmint${mintCalls}`, soulId: mintCalls };
    }),
    ownerOfSoul: vi.fn(async () => '0x0000000000000000000000000000000000000000'),
    royaltyWalletOf: vi.fn(async () => '0x0000000000000000000000000000000000000000'),
    predictCommunionId: vi.fn(
      async (payer: string, nonce: string, contextHash: string) =>
        BigInt(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address', 'bytes32', 'bytes32'], [payer, nonce, contextHash]))),
    ),
    participationMessage: vi.fn(
      async (communionId: bigint, contextHash: string) =>
        ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string', 'uint256', 'bytes32'], ['LATTICE_OPEN_TEST', communionId, contextHash])),
    ),
    openCommunion: vi.fn(async (args: { nonce: string }) => ({
      txHash: `0xopen${args.nonce.slice(2, 10)}`,
      communionId: openIdSeq++,
    })),
    submitAttestation: vi.fn(async () => ({ txHash: '0xattest123' })),
    settleRoyalties: vi.fn(async () => ({ txHash: '0xsettle456' })),
    communionOf: vi.fn(async (id: bigint) => ({
      soulIds: [1n, 2n, 3n],
      royaltyWallets: ['0xa1', '0xa2', '0xa3'],
      payer: '0xpayer',
      payment: 3_000_000_000_000_000_000n,
      contextHash: ethers.ZeroHash,
      outputHash: ethers.ZeroHash,
      usageHash: ethers.ZeroHash,
      provider: ethers.ZeroAddress,
      chatID: 'mock',
      openedAt: 1n,
      attestedAt: 1n,
      settled: true,
    })),
    chainHealth: vi.fn(async () => ({ ok: true, chainId: 16661n })),
    setLatticeContextForTests: vi.fn(),
  };
});

// Mock storage and compute too.
vi.mock('../src/lib/zerog-storage.js', async () => {
  const { InMemoryStorageDriver } = await import('../src/lib/zerog-storage.js');
  const driver = new InMemoryStorageDriver();
  return {
    InMemoryStorageDriver,
    getStorageDriver: vi.fn(async () => driver),
    _setStorageDriverForTests: vi.fn(),
  };
});

vi.mock('../src/lib/zerog-compute.js', async () => {
  const ethersMod = await import('ethers');
  return {
    getComputeDriver: vi.fn(async () => ({
      callSealedInference: vi.fn(async ({ messages }) => ({
        text: `Mock answer for: ${messages[messages.length - 1].content}`,
        attestation: {
          signature: '0x' + 'cd'.repeat(65),
          teeSignerAddress: '0x' + 'ab'.repeat(20),
          contentHash: ethersMod.ethers.keccak256(ethersMod.ethers.toUtf8Bytes('mock')),
        },
        provider: 'mock://lattice',
        model: 'mock-model',
      })),
      ping: vi.fn(async () => true),
    })),
  };
});

let mintCalls = 0n;
let openIdSeq = 100n;

import {
  mintSoulFlow,
  prepareCommunion,
  openAndRunCommunion,
  settleCommunionFlow,
  verifyParticipationReceipt,
  listAllSouls,
} from '../src/lib/lattice-flow.js';
import { _resetLatticeStateForTests, getCommunion } from '../src/lib/lattice-state.js';

beforeEach(() => {
  _resetLatticeStateForTests();
  mintCalls = 0n;
  openIdSeq = 100n;
});

describe('lattice-flow', () => {
  it('mints souls and persists them', async () => {
    const owner = ethers.Wallet.createRandom().address;
    const s = await mintSoulFlow({
      ownerAddress: owner,
      contextText: 'I know calculus.',
      domain: 'math',
    });
    expect(s.soulId).toBe(1n);
    expect(s.domain).toBe('math');
    expect(s.owner).toBe(owner);
    expect(s.contextRoot).toMatch(/^0x[0-9a-f]{64}$/);
    expect(listAllSouls()).toHaveLength(1);
  });

  it('prepareCommunion sorts soulIds and produces a stable participation message', async () => {
    // Mint 3 souls in non-sorted order.
    const owner = ethers.Wallet.createRandom().address;
    await mintSoulFlow({ ownerAddress: owner, contextText: 'm', domain: 'math' });
    await mintSoulFlow({ ownerAddress: owner, contextText: 'l', domain: 'lit' });
    await mintSoulFlow({ ownerAddress: owner, contextText: 'c', domain: 'code' });

    const prep = await prepareCommunion({
      payer: owner,
      soulIds: [3n, 1n, 2n], // unsorted
      paymentWei: 3_000n,
      question: 'Hello?',
    });
    expect(prep.soulIds).toEqual(['1', '2', '3']);
    expect(prep.contextHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(prep.participationMessage).toMatch(/^0x[0-9a-f]{64}$/);
    expect(prep.communionId).toMatch(/^\d+$/);
  });

  it('rejects communion preparation with unknown souls', async () => {
    await expect(
      prepareCommunion({ payer: '0x' + 'a'.repeat(40), soulIds: [99n], paymentWei: 1n, question: 'x' }),
    ).rejects.toThrow(/not found/);
  });

  it('runs the open → attest → settle lifecycle', async () => {
    const wallet = ethers.Wallet.createRandom();
    await mintSoulFlow({ ownerAddress: wallet.address, contextText: 'a', domain: 'math' });
    await mintSoulFlow({ ownerAddress: wallet.address, contextText: 'b', domain: 'lit' });

    const prep = await prepareCommunion({
      payer: wallet.address,
      soulIds: [1n, 2n],
      paymentWei: 2_000n,
      question: 'why?',
    });

    // Sign the participation message twice (one per soul), with the same wallet
    // since both souls share the owner in this test.
    const sig = await wallet.signMessage(ethers.getBytes(prep.participationMessage));
    const opened = await openAndRunCommunion({
      communionId: prep.communionId,
      participationReceipts: [sig, sig],
    });
    expect(opened.status).toBe('attested');
    expect(opened.output).toMatch(/Mock answer/);
    expect(opened.attestationTxHash).toBe('0xattest123');

    const settled = await settleCommunionFlow(prep.communionId);
    expect(settled.record.status).toBe('settled');
    expect(settled.record.settleTxHash).toBe('0xsettle456');
  });

  it('verifyParticipationReceipt accepts valid sigs, rejects forgeries', async () => {
    const w = ethers.Wallet.createRandom();
    const message = ethers.keccak256(ethers.toUtf8Bytes('msg'));
    const sig = await w.signMessage(ethers.getBytes(message));
    expect(
      verifyParticipationReceipt({ message, signature: sig, expectedSigner: w.address }),
    ).toBe(true);
    expect(
      verifyParticipationReceipt({
        message,
        signature: sig,
        expectedSigner: ethers.Wallet.createRandom().address,
      }),
    ).toBe(false);
  });

  it('rejects open on an unknown communion', async () => {
    await expect(
      openAndRunCommunion({ communionId: '999999', participationReceipts: [] }),
    ).rejects.toThrow(/not prepared/);
  });

  it('rejects settle when not yet attested', async () => {
    const owner = ethers.Wallet.createRandom().address;
    await mintSoulFlow({ ownerAddress: owner, contextText: 'a', domain: 'math' });
    const prep = await prepareCommunion({
      payer: owner,
      soulIds: [1n],
      paymentWei: 1n,
      question: 'x',
    });
    await expect(settleCommunionFlow(prep.communionId)).rejects.toThrow(/cannot settle/);
  });
});
