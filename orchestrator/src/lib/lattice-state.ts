/**
 * In-memory state for the Lattice orchestrator.
 *
 * Stores per-soul metadata (the orchestrator's local copy of (merkleRoot →
 * sealedKey, domain, royaltyWallet, owner)) and per-communion state during the
 * open → attest → settle lifecycle. Cleared on process restart — production
 * would persist to SQLite (better-sqlite3 is already in package.json).
 */

export interface SoulRecord {
  soulId: bigint;
  owner: string;
  contextRoot: string; // 0G Storage Merkle root (32-byte hex)
  sealedKey: string; // local-only — would be ECIES-sealed to soul owner in prod
  plaintextPreview: string; // first ~200 chars for UI hints
  domain: string;
  royaltyWallet: string;
  mintedAt: number;
  txHash: string;
}

export interface CommunionPrepared {
  communionId: string; // bigint serialized as decimal string for JSON
  payer: string;
  soulIds: string[]; // sorted
  contextHash: string;
  nonce: string;
  participationMessage: string;
  paymentWei: string;
  question: string;
  preparedAt: number;
}

export type CommunionStatus =
  | 'prepared'
  | 'opened'
  | 'attesting'
  | 'attested'
  | 'settled'
  | 'failed';

export interface CommunionRecord {
  communionId: string;
  status: CommunionStatus;
  prepared: CommunionPrepared;
  openedAt?: number;
  openTxHash?: string;
  attestedAt?: number;
  attestationTxHash?: string;
  settledAt?: number;
  settleTxHash?: string;
  output?: string;
  outputHash?: string;
  usageHash?: string;
  chatID?: string;
  failureReason?: string;
}

const souls = new Map<string, SoulRecord>(); // key: soulId as decimal string
const communions = new Map<string, CommunionRecord>(); // key: communionId

export function putSoul(s: SoulRecord): void {
  souls.set(s.soulId.toString(), s);
}

export function getSoul(soulId: bigint | string): SoulRecord | undefined {
  return souls.get(typeof soulId === 'string' ? soulId : soulId.toString());
}

export function listSouls(): SoulRecord[] {
  return Array.from(souls.values()).sort((a, b) => Number(a.soulId - b.soulId));
}

export function putCommunion(c: CommunionRecord): void {
  communions.set(c.communionId, c);
}

export function getCommunion(communionId: bigint | string): CommunionRecord | undefined {
  return communions.get(typeof communionId === 'string' ? communionId : communionId.toString());
}

export function listCommunions(): CommunionRecord[] {
  return Array.from(communions.values()).sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0));
}

export function patchCommunion(communionId: string, patch: Partial<CommunionRecord>): void {
  const existing = communions.get(communionId);
  if (!existing) throw new Error(`Communion ${communionId} not found in state`);
  communions.set(communionId, { ...existing, ...patch });
}

/** Test reset. */
export function _resetLatticeStateForTests(): void {
  souls.clear();
  communions.clear();
}
