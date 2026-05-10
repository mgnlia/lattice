/**
 * The Lattice orchestration core.
 *
 * Three primary operations:
 *
 *   prepareCommunion(soulIds, payer, paymentWei, question)
 *      → { communionId, contextHash, participationMessage } the soul owners sign
 *
 *   openAndRunCommunion(communionId, participationReceipts)
 *      → submits openCommunion on-chain, calls 0G Compute with the merged
 *        contexts, fetches the TEE attestation, submits attestation on-chain.
 *
 *   settleCommunion(communionId)
 *      → calls settleRoyalties, returns the per-soul payout split.
 */
import { ethers } from 'ethers';
import { loadEnv } from './env.js';
import { getLogger } from './logger.js';
import {
  getStorageDriver,
  type StorageDriver,
} from './zerog-storage.js';
import {
  getComputeDriver,
  type ComputeDriver,
  type ChatMessage,
} from './zerog-compute.js';
import {
  attestForChat,
  getLatticeTeeSignerAddress,
} from './lattice-tee.js';
import {
  mintSoul as chainMintSoul,
  ownerOfSoul,
  predictCommunionId,
  participationMessage as chainParticipationMessage,
  openCommunion as chainOpenCommunion,
  submitAttestation as chainSubmitAttestation,
  settleRoyalties as chainSettleRoyalties,
  communionOf,
  type CommunionView,
} from './lattice-chain.js';
import {
  putSoul,
  getSoul,
  listSouls,
  putCommunion,
  patchCommunion,
  getCommunion,
  type SoulRecord,
  type CommunionRecord,
} from './lattice-state.js';

const log = getLogger().child({ module: 'lattice-flow' });

/** Mint a new Soul iNFT — encrypts the context, uploads to 0G Storage, mints on-chain. */
export async function mintSoulFlow(args: {
  ownerAddress: string;
  ownerPubKey?: string;
  contextText: string;
  domain: string;
  royaltyWallet?: string;
}): Promise<SoulRecord> {
  const storage = await getStorageDriver();
  // Encrypt to the owner's pubkey if supplied; else seal to the orchestrator's
  // own ephemeral key — the demo uses orchestrator-held keys throughout.
  const recipientPubKey =
    args.ownerPubKey ??
    ethers.SigningKey.computePublicKey(ethers.Wallet.createRandom().privateKey, true);
  const plaintext = ethers.toUtf8Bytes(args.contextText);
  const upload = await storage.uploadEncrypted(plaintext, recipientPubKey);

  const royalty = args.royaltyWallet ?? args.ownerAddress;
  const { soulId, txHash } = await chainMintSoul({
    to: args.ownerAddress,
    contextRoot: upload.merkleRoot,
    domain: args.domain,
    royaltyWallet: royalty,
  });

  const record: SoulRecord = {
    soulId,
    owner: args.ownerAddress,
    contextRoot: upload.merkleRoot,
    sealedKey: upload.sealedKey,
    plaintextPreview: args.contextText.slice(0, 200),
    domain: args.domain,
    royaltyWallet: royalty,
    mintedAt: Date.now(),
    txHash,
  };
  putSoul(record);
  log.info({ soulId: soulId.toString(), domain: args.domain }, 'soul minted');
  return record;
}

export interface PreparedCommunion {
  communionId: string;
  contextHash: string;
  nonce: string;
  participationMessage: string;
  payer: string;
  soulIds: string[];
  paymentWei: string;
  question: string;
}

/**
 * Step 1 — orchestrator pre-computes the communionId and the message each soul
 * owner must EIP-191-sign. Returns the prepared communion for the UI to collect
 * receipts.
 */
export async function prepareCommunion(args: {
  payer: string;
  soulIds: bigint[];
  paymentWei: bigint;
  question: string;
}): Promise<PreparedCommunion> {
  if (args.soulIds.length === 0) throw new Error('Must include at least one soul');

  // Sort ascending — contract enforces this invariant.
  const sorted = [...args.soulIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  // Build the merged context from all souls' plaintext (orchestrator-held).
  const contexts: { soulId: bigint; domain: string; plaintext: string }[] = [];
  for (const id of sorted) {
    const s = getSoul(id);
    if (!s) throw new Error(`Soul ${id} not found in orchestrator state`);
    contexts.push({ soulId: id, domain: s.domain, plaintext: s.plaintextPreview });
  }

  // Canonical merge: a JSON document so the contextHash reflects exactly the
  // input schema the TEE consumes. This is the orchestrator commitment.
  const mergedDoc = {
    schema: 'lattice.v1.commitment',
    souls: contexts.map((c) => ({
      soulId: c.soulId.toString(),
      domain: c.domain,
      contextPreviewSha256: ethers.sha256(ethers.toUtf8Bytes(c.plaintext)),
    })),
    question: args.question,
  };
  const contextHash = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify(mergedDoc)),
  );
  const nonce = ethers.hexlify(ethers.randomBytes(32));
  const communionId = await predictCommunionId(args.payer, nonce, contextHash);

  // The participation message uses the on-chain helper (block.chainid + addr +
  // communionId + contextHash). We must call the contract to get the canonical
  // version because it's parameterized by the deployed contract address.
  const partMsg = await chainParticipationMessage(communionId, contextHash);

  const prep: PreparedCommunion = {
    communionId: communionId.toString(),
    contextHash,
    nonce,
    participationMessage: partMsg,
    payer: args.payer,
    soulIds: sorted.map((s) => s.toString()),
    paymentWei: args.paymentWei.toString(),
    question: args.question,
  };

  // Persist the prepared communion in 'prepared' state so subsequent /open can
  // pick it up by communionId.
  putCommunion({
    communionId: prep.communionId,
    status: 'prepared',
    prepared: { ...prep, preparedAt: Date.now() },
  });

  log.info({ communionId: prep.communionId, n: sorted.length }, 'communion prepared');
  return prep;
}

/**
 * Step 2 — open + run + attest the communion. Submits all three on-chain calls
 * (open, attest) and the off-chain TEE inference. Settle is a separate step so
 * the UI can display the output before the royalty fan-out fires.
 */
export async function openAndRunCommunion(args: {
  communionId: string;
  participationReceipts: string[];
}): Promise<CommunionRecord> {
  const rec = getCommunion(args.communionId);
  if (!rec) throw new Error(`Communion ${args.communionId} not prepared`);
  if (rec.status !== 'prepared') {
    throw new Error(`Communion ${args.communionId} already in status ${rec.status}`);
  }
  const prep = rec.prepared;

  // 2a — submit openCommunion on-chain.
  const open = await chainOpenCommunion({
    nonce: prep.nonce,
    soulIds: prep.soulIds.map(BigInt),
    contextHash: prep.contextHash,
    participationReceipts: args.participationReceipts,
    paymentWei: BigInt(prep.paymentWei),
  });
  patchCommunion(prep.communionId, {
    status: 'opened',
    openedAt: Date.now(),
    openTxHash: open.txHash,
  });

  // 2b — call 0G Compute with merged context.
  patchCommunion(prep.communionId, { status: 'attesting' });
  const compute = await getComputeDriver();
  const messages = await buildMergedMessages(prep);
  const inference = await compute.callSealedInference({ messages });

  // 2c — synthesize the TEE attestation. In production this comes from
  //       GET /v1/proxy/signature/{chatID} — our mock builds an equivalent
  //       envelope locally with the same TEE-stub key.
  const env = loadEnv();
  const provider = env.LATTICE_TEE_PROVIDER ?? getLatticeTeeSignerAddress();
  const chatID = `lattice-${prep.communionId.slice(-12)}-${Date.now()}`;
  const teeAtt = await attestForChat({ chatID, costNanoOG: 1 });

  const outputHash = ethers.keccak256(ethers.toUtf8Bytes(inference.text));
  const usageHash = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify({ model: inference.model, text: inference.text.length })),
  );

  const attest = await chainSubmitAttestation({
    communionId: BigInt(prep.communionId),
    provider,
    chatID,
    outputHash,
    usageHash,
    teeText: teeAtt.text,
    teeSignature: teeAtt.signature,
  });

  patchCommunion(prep.communionId, {
    status: 'attested',
    attestedAt: Date.now(),
    attestationTxHash: attest.txHash,
    output: inference.text,
    outputHash,
    usageHash,
    chatID,
  });

  return getCommunion(prep.communionId)!;
}

/** Step 3 — settle the royalty fan-out. Returns updated record + onchain view. */
export async function settleCommunionFlow(communionId: string): Promise<{
  record: CommunionRecord;
  onchain: CommunionView;
}> {
  const rec = getCommunion(communionId);
  if (!rec) throw new Error(`Communion ${communionId} not found`);
  if (rec.status !== 'attested') {
    throw new Error(`Communion ${communionId} cannot settle from status ${rec.status}`);
  }
  const settle = await chainSettleRoyalties(BigInt(communionId));
  patchCommunion(communionId, {
    status: 'settled',
    settledAt: Date.now(),
    settleTxHash: settle.txHash,
  });
  const onchain = await communionOf(BigInt(communionId));
  return { record: getCommunion(communionId)!, onchain };
}

/** Build the OpenAI-style messages array from N souls' contexts + the user question. */
async function buildMergedMessages(prep: CommunionRecord['prepared']): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are The Lattice — a multi-soul communion. Several souls have contributed sealed context. Synthesize an answer that draws on each domain, citing each soul by domain in your reasoning.',
    },
  ];
  for (const idStr of prep.soulIds) {
    const soul = getSoul(idStr);
    if (!soul) continue;
    messages.push({
      role: 'system',
      content: `[soul ${soul.soulId} — domain "${soul.domain}"]\n${soul.plaintextPreview}`,
    });
  }
  messages.push({ role: 'user', content: prep.question });
  return messages;
}

/** Re-export for the server's GET /souls. */
export const listAllSouls = listSouls;

/** Verify a participation receipt off-chain (sanity check before opening). */
export function verifyParticipationReceipt(args: {
  message: string;
  signature: string;
  expectedSigner: string;
}): boolean {
  try {
    const recovered = ethers.verifyMessage(ethers.getBytes(args.message), args.signature);
    return recovered.toLowerCase() === args.expectedSigner.toLowerCase();
  } catch {
    return false;
  }
}

/** Lookup a soul's on-chain owner (used when the orchestrator wants to verify
 *  a receipt before paying gas to submit). */
export async function fetchOwnerOf(soulId: bigint): Promise<string> {
  return ownerOfSoul(soulId);
}
