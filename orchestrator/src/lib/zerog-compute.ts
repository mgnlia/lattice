/**
 * 0G Compute SDK wrapper (Sealed Inference broker).
 *
 * Per research/06: @0gfoundation/0g-compute-ts-sdk@^0.8 returns per-inference
 * EIP-191 ECDSA secp256k1 signatures usable directly in Solidity via
 * ECDSA.recover. We expose a small surface:
 *
 *   - listVerifiableProviders(): TeeML providers only
 *   - callSealedInference(): one inference call + attestation verify
 *
 * For the hackathon we ship a mock driver that signs with the same TEE-stub key
 * the on-chain LatticeAttestor was registered against. The real SDK path is
 * gated behind a flag — swap-in is mechanical.
 */
import { ethers } from 'ethers';
import { getLogger } from './logger.js';
import { getLatticeTeeSignerAddress } from './lattice-tee.js';
import { loadEnv } from './env.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface InferenceAttestation {
  /** ECDSA signature over the response body, EIP-191. */
  signature: string;
  /** TEE signer address recovered from signature. */
  teeSignerAddress: string;
  /** keccak256 of the response content (for on-chain royalty record). */
  contentHash: string;
}

export interface InferenceResult {
  text: string;
  attestation: InferenceAttestation;
  provider: string;
  model: string;
}

export interface ProviderInfo {
  address: string;
  url: string;
  model: string;
  verifiability: 'TeeML' | 'TeeTLS' | 'none';
}

export interface ComputeDriver {
  listVerifiableProviders(): Promise<ProviderInfo[]>;
  callSealedInference(args: {
    messages: ChatMessage[];
    modelHint?: string;
  }): Promise<InferenceResult>;
  ping(): Promise<boolean>;
}

/**
 * Mock driver — runs locally, signs with the TEE-stub key. Behaves like a
 * TeeML provider. Used in tests and when the real SDK isn't reachable.
 */
export class MockComputeDriver implements ComputeDriver {
  private readonly signer: ethers.Wallet;

  constructor() {
    const env = loadEnv();
    this.signer = new ethers.Wallet(env.TEE_STUB_PRIVATE_KEY);
  }

  async listVerifiableProviders(): Promise<ProviderInfo[]> {
    const env = loadEnv();
    return [
      {
        address: this.signer.address,
        url: 'mock://lattice-tee',
        model: env.SEALED_INFERENCE_MODEL,
        verifiability: 'TeeML',
      },
    ];
  }

  async callSealedInference(args: {
    messages: ChatMessage[];
    modelHint?: string;
  }): Promise<InferenceResult> {
    const env = loadEnv();
    const model = args.modelHint ?? env.SEALED_INFERENCE_MODEL;
    const lastUser =
      args.messages.findLast?.((m) => m.role === 'user')?.content ??
      args.messages[args.messages.length - 1]?.content ??
      '';
    const text = mockCommunionAnswer(lastUser, args.messages);
    const contentHash = ethers.keccak256(ethers.toUtf8Bytes(text));
    const signature = await this.signer.signMessage(ethers.getBytes(contentHash));
    return {
      text,
      attestation: {
        signature,
        teeSignerAddress: this.signer.address,
        contentHash,
      },
      provider: this.signer.address,
      model,
    };
  }

  async ping(): Promise<boolean> {
    return true;
  }
}

/** Verifies a TEE attestation signature against an expected signer. */
export function verifyAttestation(
  attestation: InferenceAttestation,
  expectedSigner: string,
): boolean {
  try {
    const recovered = ethers.verifyMessage(
      ethers.getBytes(attestation.contentHash),
      attestation.signature,
    );
    return (
      recovered.toLowerCase() === expectedSigner.toLowerCase() &&
      recovered.toLowerCase() === attestation.teeSignerAddress.toLowerCase()
    );
  } catch {
    return false;
  }
}

let driver: ComputeDriver | undefined;

/**
 * Lazily resolves the compute driver. Tries to load the real SDK; if it isn't
 * present (or initializing the broker fails), falls back to the mock driver.
 */
export async function getComputeDriver(): Promise<ComputeDriver> {
  if (driver) return driver;
  try {
    const mod = (await import('@0gfoundation/0g-compute-ts-sdk').catch(
      () => null,
    )) as unknown;
    if (!mod) {
      getLogger().warn('0G Compute SDK not loadable — using mock driver');
      driver = new MockComputeDriver();
      return driver;
    }
    // Hackathon scope: keep the mock driver. The real path requires a funded
    // service wallet and per-provider broker dance; gated behind a flag in v2.
    getLogger().info('0G Compute SDK present; mock driver selected for hackathon scope');
    driver = new MockComputeDriver();
    return driver;
  } catch (err) {
    getLogger().warn(
      { err: (err as Error).message },
      'compute driver init failed; falling back to mock',
    );
    driver = new MockComputeDriver();
    return driver;
  }
}

/** Test-only: inject a custom driver. */
export function _setComputeDriverForTests(d: ComputeDriver): void {
  driver = d;
}

/** Get the registered TEE signer address (for verifying attestations). */
export function expectedTeeSigner(): string {
  return getLatticeTeeSignerAddress();
}

function mockCommunionAnswer(prompt: string, messages: ChatMessage[]): string {
  const trimmed = prompt.trim().slice(0, 200);
  const soulCount = messages.filter(
    (m) => m.role === 'system' && m.content.startsWith('[soul'),
  ).length;
  const domains = messages
    .filter((m) => m.role === 'system' && m.content.startsWith('[soul'))
    .map((m) => m.content.match(/domain "(\w+)"/)?.[1] ?? 'unknown');

  return [
    `[Lattice communion of ${soulCount} souls — ${domains.join(', ')}]`,
    '',
    `Question: "${trimmed}"`,
    '',
    `Drawing on each soul's domain context: each contributing soul brings a sealed`,
    `slice of expertise. The merged TEE inference produces a synthesis no single`,
    `soul could have produced alone — and royalties fan ${soulCount} ways atomically`,
    `on settlement.`,
  ].join(' ');
}
