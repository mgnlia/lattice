#!/usr/bin/env node
/**
 * extract-addresses.js
 *
 * Reads a Foundry broadcast JSON (e.g.,
 * contracts/broadcast/Deploy.s.sol/16661/run-latest.json) and prints
 * env-style key=value lines for the 5 HAKWON contracts.
 *
 * Usage:
 *   node scripts/deploy/extract-addresses.js <broadcast.json>
 *   node scripts/deploy/extract-addresses.js contracts/broadcast/Deploy.s.sol/16661/run-latest.json >> .env
 *
 * Idempotent. Safe to re-run; just appends to stdout.
 *
 * Why a separate script: forge writes the broadcast JSON in a deterministic
 * format but the contract names are buried inside `.transactions[].contractName`.
 * This script flattens that into ENV lines that match `.env.example`.
 */

const fs = require('fs');
const path = require('path');

// Map Foundry contractName → env var name. Keep in sync with `.env.example`.
const NAME_MAP = {
  TutorINFT: 'TUTOR_INFT_ADDR',
  BreedRegistry: 'BREED_REGISTRY_ADDR',
  RoyaltySplitter: 'ROYALTY_SPLITTER_ADDR',
  TransferWithMode: 'TRANSFER_WITH_MODE_ADDR',
  AttestationVerifier: 'ATTESTATION_VERIFIER_ADDR',
};

function main() {
  const argv = process.argv.slice(2);
  if (argv.length !== 1) {
    console.error('Usage: extract-addresses.js <broadcast.json>');
    process.exit(2);
  }
  const broadcastPath = path.resolve(argv[0]);
  if (!fs.existsSync(broadcastPath)) {
    console.error(`File not found: ${broadcastPath}`);
    process.exit(2);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(broadcastPath, 'utf8'));
  } catch (err) {
    console.error(`Failed to parse JSON: ${err.message}`);
    process.exit(2);
  }

  const txs = raw.transactions || [];
  const found = {};
  for (const tx of txs) {
    if (tx.transactionType !== 'CREATE') continue;
    const name = tx.contractName;
    const addr = tx.contractAddress;
    if (!name || !addr) continue;
    const envKey = NAME_MAP[name];
    if (!envKey) continue;
    // First occurrence wins (Foundry typically emits in order; if a contract
    // is deployed twice, the first deploy is the canonical one).
    if (!found[envKey]) {
      found[envKey] = addr;
    }
  }

  const expected = Object.values(NAME_MAP);
  const missing = expected.filter((k) => !found[k]);
  if (missing.length > 0) {
    console.error(
      `WARNING: missing addresses for: ${missing.join(', ')}. ` +
        'Verify Deploy.s.sol creates all 5 contracts.'
    );
  }

  // Print in canonical .env order.
  console.log('');
  console.log('# Deployed contract addresses (auto-extracted)');
  for (const envKey of expected) {
    const addr = found[envKey] || '';
    console.log(`${envKey}=${addr}`);
  }
  // Also emit NEXT_PUBLIC_* mirrors the UI reads.
  console.log('');
  console.log('# UI mirrors of contract addresses');
  console.log(`NEXT_PUBLIC_TUTOR_INFT_ADDR=${found.TUTOR_INFT_ADDR || ''}`);
  console.log(`NEXT_PUBLIC_BREED_REGISTRY_ADDR=${found.BREED_REGISTRY_ADDR || ''}`);
  console.log(`NEXT_PUBLIC_ROYALTY_SPLITTER_ADDR=${found.ROYALTY_SPLITTER_ADDR || ''}`);
  console.log(`NEXT_PUBLIC_TRANSFER_WITH_MODE_ADDR=${found.TRANSFER_WITH_MODE_ADDR || ''}`);
}

main();
