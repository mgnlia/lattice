/**
 * Ethers v6 wrappers for The Lattice's three contracts.
 *
 * Mirrors Lattice's `chain.ts` shape but talks to SoulINFT / LatticeAttestor /
 * LatticeRegistry. Reads addresses + service-wallet privkey from env. Tests
 * inject a fully-stubbed context via `setLatticeContextForTests`.
 */
import { ethers } from 'ethers';
import { loadEnv } from './env.js';
import {
  SOUL_INFT_ABI,
  LATTICE_ATTESTOR_ABI,
  LATTICE_REGISTRY_ABI,
} from './lattice-abis.js';

export interface LatticeContext {
  provider: ethers.JsonRpcProvider | ethers.AbstractProvider;
  serviceWallet: ethers.Wallet | null;
  contracts: {
    soulINFT: ethers.Contract | null;
    attestor: ethers.Contract | null;
    registry: ethers.Contract | null;
  };
}

let cached: LatticeContext | undefined;

/** Build (or return cached) Lattice context with provider + wallet + contracts. */
export function getLatticeContext(): LatticeContext {
  if (cached) return cached;
  const env = loadEnv();
  const provider = new ethers.JsonRpcProvider(env.ZEROG_RPC_URL, {
    chainId: env.ZEROG_CHAIN_ID,
    name: '0g-aristotle',
  });
  const wallet = env.DEPLOYER_PRIVATE_KEY
    ? new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider)
    : null;

  const make = (addr: string | undefined, abi: readonly string[]) =>
    addr && wallet ? new ethers.Contract(addr, abi, wallet) : null;

  cached = {
    provider,
    serviceWallet: wallet,
    contracts: {
      soulINFT: make(env.SOUL_INFT_ADDR, SOUL_INFT_ABI),
      attestor: make(env.LATTICE_ATTESTOR_ADDR, LATTICE_ATTESTOR_ABI),
      registry: make(env.LATTICE_REGISTRY_ADDR, LATTICE_REGISTRY_ABI),
    },
  };
  return cached;
}

/** Test-only: inject a stubbed Lattice context (used by vitest with a mock RPC). */
export function setLatticeContextForTests(ctx: LatticeContext | undefined): void {
  cached = ctx;
}

function need<T>(c: T | null, name: string): T {
  if (!c) throw new Error(`Lattice contract ${name} not configured (missing address or service wallet).`);
  return c;
}

/** Mint a Soul iNFT, returns soulId. */
export async function mintSoul(args: {
  to: string;
  contextRoot: string;
  domain: string;
  royaltyWallet?: string;
}): Promise<{ txHash: string; soulId: bigint }> {
  const c = need(getLatticeContext().contracts.soulINFT, 'SoulINFT');
  const tx = await c.mintSoul!(
    args.to,
    args.contextRoot,
    args.domain,
    args.royaltyWallet ?? ethers.ZeroAddress,
  );
  const receipt = await tx.wait();
  const log = receipt.logs.find(
    (l: { fragment?: { name?: string } }) => l.fragment?.name === 'SoulMinted',
  );
  const soulId = log?.args?.soulId as bigint | undefined;
  if (soulId === undefined) {
    throw new Error('SoulMinted event missing from mint receipt');
  }
  return { txHash: receipt.hash, soulId };
}

/** Read a soul's owner. */
export async function ownerOfSoul(soulId: bigint): Promise<string> {
  const c = need(getLatticeContext().contracts.soulINFT, 'SoulINFT');
  return c.ownerOf!(soulId);
}

/** Read a soul's royalty wallet. Returns owner if no override set. */
export async function royaltyWalletOf(soulId: bigint): Promise<string> {
  const c = need(getLatticeContext().contracts.soulINFT, 'SoulINFT');
  return c.royaltyWalletOf!(soulId);
}

/** Predict the on-chain communionId before submission. */
export async function predictCommunionId(
  payer: string,
  nonce: string,
  contextHash: string,
): Promise<bigint> {
  const c = need(getLatticeContext().contracts.registry, 'LatticeRegistry');
  return c.predictCommunionId!(payer, nonce, contextHash);
}

/** Read the participation message a soul owner must EIP-191-sign. */
export async function participationMessage(
  communionId: bigint,
  contextHash: string,
): Promise<string> {
  const c = need(getLatticeContext().contracts.registry, 'LatticeRegistry');
  return c.participationMessage!(communionId, contextHash);
}

/** Submit openCommunion. Returns the communionId from the emitted event. */
export async function openCommunion(args: {
  nonce: string;
  soulIds: bigint[];
  contextHash: string;
  participationReceipts: string[];
  paymentWei: bigint;
}): Promise<{ txHash: string; communionId: bigint }> {
  const c = need(getLatticeContext().contracts.registry, 'LatticeRegistry');
  const tx = await c.openCommunion!(
    args.nonce,
    args.soulIds,
    args.contextHash,
    args.participationReceipts,
    { value: args.paymentWei },
  );
  const receipt = await tx.wait();
  const log = receipt.logs.find(
    (l: { fragment?: { name?: string } }) => l.fragment?.name === 'CommunionOpened',
  );
  const communionId = log?.args?.communionId as bigint | undefined;
  if (communionId === undefined) {
    throw new Error('CommunionOpened event missing from open receipt');
  }
  return { txHash: receipt.hash, communionId };
}

/** Submit the TEE attestation for a Communion. */
export async function submitAttestation(args: {
  communionId: bigint;
  provider: string;
  chatID: string;
  outputHash: string;
  usageHash: string;
  teeText: string; // hex 0x-prefixed
  teeSignature: string; // 65-byte hex
}): Promise<{ txHash: string }> {
  const c = need(getLatticeContext().contracts.registry, 'LatticeRegistry');
  const tx = await c.submitAttestation!(
    args.communionId,
    args.provider,
    args.chatID,
    args.outputHash,
    args.usageHash,
    args.teeText,
    args.teeSignature,
  );
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

/** Settle royalties (any caller; mainnet just pays gas). */
export async function settleRoyalties(communionId: bigint): Promise<{ txHash: string }> {
  const c = need(getLatticeContext().contracts.registry, 'LatticeRegistry');
  const tx = await c.settleRoyalties!(communionId);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

/** Read the Communion struct. */
export interface CommunionView {
  soulIds: bigint[];
  royaltyWallets: string[];
  payer: string;
  payment: bigint;
  contextHash: string;
  outputHash: string;
  usageHash: string;
  provider: string;
  chatID: string;
  openedAt: bigint;
  attestedAt: bigint;
  settled: boolean;
}

export async function communionOf(communionId: bigint): Promise<CommunionView> {
  const c = need(getLatticeContext().contracts.registry, 'LatticeRegistry');
  const raw = (await c.communionOf!(communionId)) as unknown as CommunionView;
  return raw;
}

/** Cheap chain ping. */
export async function chainHealth(): Promise<{ ok: boolean; chainId: number | null }> {
  try {
    const ctx = getLatticeContext();
    const network = await ctx.provider.getNetwork();
    return { ok: true, chainId: Number(network.chainId) };
  } catch {
    return { ok: false, chainId: null };
  }
}
