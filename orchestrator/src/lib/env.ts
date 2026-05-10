/**
 * Zod-validated environment loader for The Lattice orchestrator.
 * Fails fast at startup with human-readable errors when required vars are missing.
 */
import 'dotenv/config';
import { z } from 'zod';

const hexAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'must be a 0x-prefixed 20-byte address');
const hexPrivateKey = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'must be a 0x-prefixed 32-byte private key');

const schema = z.object({
  // Chain
  ZEROG_RPC_URL: z.string().url().default('https://evmrpc.0g.ai'),
  ZEROG_CHAIN_ID: z.coerce.number().int().positive().default(16661),
  ZEROG_EXPLORER: z.string().url().default('https://chainscan.0g.ai'),

  // Service wallet (pays gas + Compute broker fees)
  DEPLOYER_PRIVATE_KEY: hexPrivateKey.optional(),
  DEPLOYER_ADDRESS: hexAddress.optional(),

  // Compute broker
  ZEROG_BROKER_RPC: z.string().url().default('https://evmrpc.0g.ai'),
  SEALED_INFERENCE_MODEL: z.string().default('deepseek-v3'),
  FALLBACK_INFERENCE_MODEL: z.string().default('glm-5-744b'),
  COMPUTE_BROKER_DEPOSIT_OG: z.coerce.number().nonnegative().default(0),

  // Storage
  ZEROG_STORAGE_INDEXER: z
    .string()
    .url()
    .default('https://indexer-storage-testnet-turbo.0g.ai'),

  // Lattice contracts (optional — populated post-deploy)
  SOUL_INFT_ADDR: hexAddress.optional(),
  LATTICE_ATTESTOR_ADDR: hexAddress.optional(),
  LATTICE_REGISTRY_ADDR: hexAddress.optional(),
  LATTICE_PROTOCOL_FEE_RECIPIENT: hexAddress.optional(),
  // Lattice TeeML provider EVM address (the on-chain identifier of the registered
  // 0G Compute provider — distinct from the TEE signer wallet that produces ECDSA
  // sigs over `text`). For dev / mainnet demo we set both to the TEE-stub address.
  LATTICE_TEE_PROVIDER: hexAddress.optional(),

  // TEE stub signer
  TEE_STUB_PRIVATE_KEY: hexPrivateKey.default(
    // Deterministic dev default — REPLACE in prod via env
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  ),

  // Runtime — Railway/Render/Fly inject PORT; fall back to ORCHESTRATOR_PORT, then 3001.
  PORT: z.coerce.number().int().positive().optional(),
  ORCHESTRATOR_PORT: z.coerce.number().int().positive().default(3001),
  ORCHESTRATOR_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type AppEnv = z.infer<typeof schema>;

let cached: AppEnv | undefined;

/** Loads + validates env once. Throws a single aggregated error if invalid. */
export function loadEnv(): AppEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${lines}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test-only: reset the env cache so a test can re-load with patched process.env. */
export function _resetEnvCacheForTests(): void {
  cached = undefined;
}
