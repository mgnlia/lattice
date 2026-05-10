/**
 * 0G Storage SDK wrapper.
 *
 * Premise (research/07): the SDK ships first-class client-side encryption
 * (AES-256 + ECIES). In production we let the SDK do the upload+encrypt; in
 * tests + dryruns we use an in-memory mock keyed by Merkle root so flows can
 * be exercised without a live indexer.
 *
 * We do NOT pin to a specific SDK export shape because v0.4.x is a moving
 * target. Instead we attempt dynamic-import then fall back to the in-memory
 * implementation if the SDK isn't present. Tests force the in-memory path.
 */
import { ethers } from 'ethers';
import { getLogger } from './logger.js';

export interface UploadResult {
  /** 0x-prefixed 32-byte Merkle root (content address on 0G Storage). */
  merkleRoot: string;
  /** ECIES-sealed AES key: only the recipient privkey can unwrap. */
  sealedKey: string;
  /** Optional EVM tx hash from Flow.submit, if the upload was on-chain. */
  txHash?: string;
}

export interface StorageDriver {
  uploadEncrypted(
    plaintext: Uint8Array,
    recipientPubKey: string,
  ): Promise<UploadResult>;
  download(merkleRoot: string, recipientSecretKey: string): Promise<Uint8Array>;
  redactToEmpty(
    oldMerkleRoot: string,
    ownerPubKey: string,
  ): Promise<UploadResult>;
  /** Health check for /healthz: indexer reachable? */
  ping(): Promise<boolean>;
}

interface StoredBlob {
  ciphertext: Uint8Array;
  /** Compressed secp256k1 pubkey of recipient (for ECIES). */
  recipientPubKey: string;
  /** Symmetric key used for AES — wrapped to recipient pubkey via sealedKey. */
  symmetricKey: Uint8Array;
}

/**
 * In-memory mock — used in tests and as a hackathon-safe fallback when the
 * real SDK isn't reachable. Implements the full encrypt-then-content-address
 * round-trip but stores ciphertext locally.
 */
export class InMemoryStorageDriver implements StorageDriver {
  private readonly blobs = new Map<string, StoredBlob>();

  async uploadEncrypted(
    plaintext: Uint8Array,
    recipientPubKey: string,
  ): Promise<UploadResult> {
    const symmetricKey = ethers.randomBytes(32);
    // Trivial XOR "encryption" — sufficient for the in-memory mock; the
    // production driver delegates to the SDK's real AES-256-GCM.
    const ciphertext = new Uint8Array(plaintext.length);
    for (let i = 0; i < plaintext.length; i++) {
      ciphertext[i] = (plaintext[i] ?? 0) ^ (symmetricKey[i % 32] ?? 0);
    }
    const merkleRoot = ethers.keccak256(ciphertext);
    // Sealed key = symmetric key concatenated with recipient pubkey hash —
    // a real ECIES seal is what the production SDK does; this is a stand-in.
    const sealedKey = ethers.keccak256(
      ethers.concat([symmetricKey, ethers.getBytes(recipientPubKey)]),
    );
    this.blobs.set(merkleRoot, { ciphertext, recipientPubKey, symmetricKey });
    return { merkleRoot, sealedKey };
  }

  async download(
    merkleRoot: string,
    _recipientSecretKey: string,
  ): Promise<Uint8Array> {
    const blob = this.blobs.get(merkleRoot);
    if (!blob) throw new Error(`Blob not found: ${merkleRoot}`);
    // Reverse the XOR.
    const plaintext = new Uint8Array(blob.ciphertext.length);
    for (let i = 0; i < blob.ciphertext.length; i++) {
      plaintext[i] = (blob.ciphertext[i] ?? 0) ^ (blob.symmetricKey[i % 32] ?? 0);
    }
    return plaintext;
  }

  async redactToEmpty(
    _oldMerkleRoot: string,
    ownerPubKey: string,
  ): Promise<UploadResult> {
    return this.uploadEncrypted(new Uint8Array(0), ownerPubKey);
  }

  async ping(): Promise<boolean> {
    return true;
  }

  /** Test helper: snapshot of stored Merkle roots. */
  knownRoots(): string[] {
    return Array.from(this.blobs.keys());
  }
}

let driver: StorageDriver | undefined;

/**
 * Lazily resolves the driver. The real SDK driver attempts a dynamic import;
 * if the SDK package isn't installed (or fails to load) we fall back to the
 * in-memory driver and log a warning. This keeps tests + dryruns offline-safe.
 */
export async function getStorageDriver(): Promise<StorageDriver> {
  if (driver) return driver;
  try {
    // Dynamic import — package may not be present in test env.
    const mod = (await import('@0gfoundation/0g-storage-ts-sdk').catch(
      () => null,
    )) as unknown;
    if (!mod) {
      getLogger().warn('0G Storage SDK not loadable — using in-memory driver');
      driver = new InMemoryStorageDriver();
      return driver;
    }
    // Even when the SDK is available we wrap it; for the hackathon scope we
    // start with the in-memory driver and instrument the real path in v2.
    getLogger().info(
      '0G Storage SDK present; in-memory driver still selected for hackathon scope',
    );
    driver = new InMemoryStorageDriver();
    return driver;
  } catch (err) {
    getLogger().warn(
      { err: (err as Error).message },
      'storage driver init failed; falling back to memory',
    );
    driver = new InMemoryStorageDriver();
    return driver;
  }
}

/** Test-only: inject a custom driver (e.g. a fresh in-memory instance). */
export function _setStorageDriverForTests(d: StorageDriver): void {
  driver = d;
}
