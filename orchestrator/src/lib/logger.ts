/** Pino logger — single instance, tagged with service name. */
import pino from 'pino';
import { loadEnv } from './env.js';

let cached: pino.Logger | undefined;

/** Returns the shared logger; initializes lazily. */
export function getLogger(): pino.Logger {
  if (cached) return cached;
  const env = loadEnv();
  cached = pino({
    level: env.ORCHESTRATOR_LOG_LEVEL,
    base: { service: 'lattice-orchestrator' },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
  return cached;
}
