/**
 * The Lattice — Fastify HTTP server.
 *
 * Routes:
 *
 *   POST /lattice/souls
 *      mint a Soul iNFT (encrypts context, uploads to 0G Storage, on-chain mint)
 *
 *   GET  /lattice/souls
 *      list known souls (orchestrator-side cache)
 *
 *   POST /lattice/communions/prepare
 *      pre-compute communionId + participation message (UI uses this to collect
 *      EIP-191 sigs from each soul owner)
 *
 *   POST /lattice/communions/:id/open
 *      submit openCommunion on-chain, call 0G Compute, submit attestation
 *
 *   POST /lattice/communions/:id/settle
 *      settle royalties (N-way fan-out to soul royalty wallets)
 *
 *   GET  /lattice/communions/:id
 *      read the current state of a communion
 *
 *   GET  /lattice/healthz
 *      liveness + chain/storage/compute health
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';

import { loadEnv } from './lib/env.js';
import {
  mintSoulFlow,
  prepareCommunion,
  openAndRunCommunion,
  settleCommunionFlow,
  listAllSouls,
} from './lib/lattice-flow.js';
import { getCommunion, listCommunions } from './lib/lattice-state.js';
import { chainHealth } from './lib/lattice-chain.js';
import { getStorageDriver } from './lib/zerog-storage.js';
import { getComputeDriver } from './lib/zerog-compute.js';

const hexAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const hexBytes = z.string().regex(/^0x[a-fA-F0-9]+$/);
const hex32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const decimalString = z.string().regex(/^\d+$/);

const mintSoulSchema = z.object({
  ownerAddress: hexAddress,
  ownerPubKey: hexBytes.optional(),
  contextText: z.string().min(1).max(50_000),
  domain: z.string().min(1).max(64),
  royaltyWallet: hexAddress.optional(),
});

const prepareSchema = z.object({
  payer: hexAddress,
  soulIds: z.array(decimalString).min(1).max(16),
  paymentWei: decimalString,
  question: z.string().min(1).max(8_000),
});

const openSchema = z.object({
  participationReceipts: z.array(hexBytes),
});

export async function buildLatticeServer(): Promise<FastifyInstance> {
  const env = loadEnv();
  const app = Fastify({
    logger: { level: env.ORCHESTRATOR_LOG_LEVEL, base: { service: 'lattice-orchestrator' } },
    bodyLimit: 5_000_000,
  });
  await app.register(cors, { origin: true });

  app.get('/lattice/healthz', async () => {
    const [chain, storageOk, computeOk] = await Promise.all([
      chainHealth(),
      getStorageDriver().then((s) => s.ping()).catch(() => false),
      getComputeDriver().then((c) => c.ping()).catch(() => false),
    ]);
    return {
      ok: chain.ok && storageOk && computeOk,
      service: 'lattice-orchestrator',
      chain,
      storage: storageOk,
      compute: computeOk,
      env: { rpc: env.ZEROG_RPC_URL, chainId: env.ZEROG_CHAIN_ID },
    };
  });

  app.post('/lattice/souls', async (req, reply) => {
    const parsed = mintSoulSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const record = await mintSoulFlow(parsed.data);
    return {
      soulId: record.soulId.toString(),
      owner: record.owner,
      contextRoot: record.contextRoot,
      domain: record.domain,
      royaltyWallet: record.royaltyWallet,
      txHash: record.txHash,
    };
  });

  app.get('/lattice/souls', async () => {
    return listAllSouls().map((s) => ({
      soulId: s.soulId.toString(),
      owner: s.owner,
      domain: s.domain,
      royaltyWallet: s.royaltyWallet,
      contextRoot: s.contextRoot,
      mintedAt: s.mintedAt,
      txHash: s.txHash,
    }));
  });

  app.post('/lattice/communions/prepare', async (req, reply) => {
    const parsed = prepareSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const prep = await prepareCommunion({
      payer: parsed.data.payer,
      soulIds: parsed.data.soulIds.map(BigInt),
      paymentWei: BigInt(parsed.data.paymentWei),
      question: parsed.data.question,
    });
    return prep;
  });

  app.post<{ Params: { id: string } }>('/lattice/communions/:id/open', async (req, reply) => {
    const parsed = openSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const result = await openAndRunCommunion({
      communionId: req.params.id,
      participationReceipts: parsed.data.participationReceipts,
    });
    return serializeCommunion(result);
  });

  app.post<{ Params: { id: string } }>('/lattice/communions/:id/settle', async (req) => {
    const result = await settleCommunionFlow(req.params.id);
    return {
      record: serializeCommunion(result.record),
      onchain: serializeOnchain(result.onchain),
    };
  });

  app.get<{ Params: { id: string } }>('/lattice/communions/:id', async (req, reply) => {
    const rec = getCommunion(req.params.id);
    if (!rec) return reply.status(404).send({ error: 'not found' });
    return serializeCommunion(rec);
  });

  app.get('/lattice/communions', async () => listCommunions().map(serializeCommunion));

  return app;
}

function serializeCommunion(rec: ReturnType<typeof getCommunion> | NonNullable<ReturnType<typeof getCommunion>>) {
  if (!rec) return null;
  return {
    communionId: rec.communionId,
    status: rec.status,
    payer: rec.prepared.payer,
    soulIds: rec.prepared.soulIds,
    paymentWei: rec.prepared.paymentWei,
    question: rec.prepared.question,
    contextHash: rec.prepared.contextHash,
    nonce: rec.prepared.nonce,
    openedAt: rec.openedAt,
    openTxHash: rec.openTxHash,
    attestedAt: rec.attestedAt,
    attestationTxHash: rec.attestationTxHash,
    settledAt: rec.settledAt,
    settleTxHash: rec.settleTxHash,
    output: rec.output,
    outputHash: rec.outputHash,
    chatID: rec.chatID,
  };
}

function serializeOnchain(o: { soulIds: bigint[]; royaltyWallets: string[]; payment: bigint; settled: boolean }) {
  return {
    soulIds: o.soulIds.map((id) => id.toString()),
    royaltyWallets: o.royaltyWallets,
    payment: o.payment.toString(),
    settled: o.settled,
  };
}

const isMainModule = (() => {
  try {
    if (typeof process === 'undefined' || !process.argv?.[1]) return false;
    return process.argv[1].endsWith('lattice-server.ts') || process.argv[1].endsWith('lattice-server.js');
  } catch {
    return false;
  }
})();

if (isMainModule) {
  console.log(`[boot] node=${process.version} pid=${process.pid}`);
  const env = loadEnv();
  buildLatticeServer().then((app) => {
    const port = env.PORT ?? env.ORCHESTRATOR_PORT;
    app.listen({ port, host: '0.0.0.0' }).then(() => {
      // pino auto-prints
    });
  });
}
