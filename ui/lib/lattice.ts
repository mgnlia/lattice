/**
 * Thin fetch wrapper around the Lattice orchestrator HTTP API.
 * Mirrors lib/orchestrator.ts shape but talks to /lattice/* routes.
 */

const API =
  process.env.NEXT_PUBLIC_LATTICE_URL ?? 'http://localhost:3101';

export interface SoulRecord {
  soulId: string;
  owner: string;
  domain: string;
  royaltyWallet: string;
  contextRoot: string;
  mintedAt?: number;
  txHash: string;
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

export type CommunionStatus =
  | 'prepared'
  | 'opened'
  | 'attesting'
  | 'attested'
  | 'settled'
  | 'failed';

export interface CommunionView {
  communionId: string;
  status: CommunionStatus;
  payer: string;
  soulIds: string[];
  paymentWei: string;
  question: string;
  contextHash: string;
  nonce: string;
  openedAt?: number;
  openTxHash?: string;
  attestedAt?: number;
  attestationTxHash?: string;
  settledAt?: number;
  settleTxHash?: string;
  output?: string;
  outputHash?: string;
  chatID?: string;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Lattice ${init?.method ?? 'GET'} ${url} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function listSouls(): Promise<SoulRecord[]> {
  return jsonFetch(`${API}/lattice/souls`);
}

export async function mintSoul(args: {
  ownerAddress: string;
  ownerPubKey?: string;
  contextText: string;
  domain: string;
  royaltyWallet?: string;
}): Promise<SoulRecord> {
  return jsonFetch(`${API}/lattice/souls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
}

export async function prepareCommunion(args: {
  payer: string;
  soulIds: string[];
  paymentWei: string;
  question: string;
}): Promise<PreparedCommunion> {
  return jsonFetch(`${API}/lattice/communions/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
}

export async function openCommunion(args: {
  communionId: string;
  participationReceipts: string[];
}): Promise<CommunionView> {
  return jsonFetch(`${API}/lattice/communions/${args.communionId}/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participationReceipts: args.participationReceipts }),
  });
}

export async function settleCommunion(communionId: string): Promise<{
  record: CommunionView;
  onchain: { soulIds: string[]; royaltyWallets: string[]; payment: string; settled: boolean };
}> {
  return jsonFetch(`${API}/lattice/communions/${communionId}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function getCommunion(communionId: string): Promise<CommunionView> {
  return jsonFetch(`${API}/lattice/communions/${communionId}`);
}

export async function listCommunions(): Promise<CommunionView[]> {
  return jsonFetch(`${API}/lattice/communions`);
}

export const EXPLORER_BASE =
  process.env.NEXT_PUBLIC_EXPLORER ?? 'https://chainscan.0g.ai';

export function txUrl(hash?: string): string | undefined {
  if (!hash) return undefined;
  return `${EXPLORER_BASE}/tx/${hash}`;
}
