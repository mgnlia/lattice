/**
 * Lattice TEE attestation helpers.
 *
 * Production path: orchestrator calls 0G Compute SDK, receives a chatID, then
 * GETs `{provider.url}/v1/proxy/signature/{chatID}` to fetch `{text, signature}`.
 * Per the researcher spike (LATTICE-ARCH §2): the TEE signs server-generated
 * `text` whose payload is `requestHash(32) || cost(16)`. We submit `text` and
 * `signature` to LatticeAttestor which:
 *   (a) ECDSA-recovers the signer from `keccak256(text)` (EIP-191), AND
 *   (b) verifies that the supplied `chatID` literally appears inside `text`.
 *
 * Dev / test / mainnet-demo path: the orchestrator owns a deterministic ECDSA
 * signer (the same TEE-stub Lattice uses) and forges a `text` blob that includes
 * the chatID as JSON. The on-chain attestor cannot tell the difference because
 * (a) the signer is registered via `attestor.registerProvider(provider, signerAddr, uri)`
 * and (b) the text contains the chatID. The honest disclosure in the README
 * states this clearly.
 */
import { ethers } from 'ethers';
import { loadEnv } from './env.js';

export interface TeeAttestation {
  /** Server-issued chatID (we synthesize a stable one for the mock). */
  chatID: string;
  /** Bytes (hex 0x...) of the TEE-signed text blob. */
  text: string;
  /** 65-byte ECDSA signature, EIP-191. */
  signature: string;
  /** Recovered TEE signer address (informational; on-chain re-recovers). */
  signer: string;
}

let cachedSigner: ethers.Wallet | undefined;

function teeSigner(): ethers.Wallet {
  if (cachedSigner) return cachedSigner;
  const env = loadEnv();
  cachedSigner = new ethers.Wallet(env.TEE_STUB_PRIVATE_KEY);
  return cachedSigner;
}

/** Returns the Lattice TEE signer address (used to register the provider on-chain). */
export function getLatticeTeeSignerAddress(): string {
  return teeSigner().address;
}

/**
 * Construct a `text` blob that the on-chain attestor will accept, then ECDSA-sign
 * it (EIP-191 personal_sign). Format echoes what a real 0G Compute provider
 * returns: a small JSON envelope including the chatID and cost. The on-chain
 * `_contains(text, chatID)` check is byte-string substring.
 *
 * @param chatID Stable identifier for this inference. We echo it inside `text`.
 * @param costNanoOG Optional cost field — informational, included so the schema
 *                   echoes the real provider shape.
 */
export async function attestForChat(args: {
  chatID: string;
  costNanoOG?: number;
}): Promise<TeeAttestation> {
  const signer = teeSigner();
  const cost = args.costNanoOG ?? 0;
  // Format mirrors what 0G's TeeML provider returns from /v1/proxy/signature.
  // Critical: chatID must appear verbatim inside the bytes so the on-chain
  // _contains check passes.
  const textJson = JSON.stringify({
    schemaVersion: 1,
    chatID: args.chatID,
    cost,
    issuedAt: Math.floor(Date.now() / 1000),
  });
  const textHex = ethers.hexlify(ethers.toUtf8Bytes(textJson));
  const messageHash = ethers.keccak256(textHex);
  const signature = await signer.signMessage(ethers.getBytes(messageHash));
  return { chatID: args.chatID, text: textHex, signature, signer: signer.address };
}

/** Test-only reset for env-reloading tests. */
export function _resetLatticeTeeSignerForTests(): void {
  cachedSigner = undefined;
}
