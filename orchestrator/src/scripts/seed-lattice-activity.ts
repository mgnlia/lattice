/**
 * seed-lattice-activity.ts
 *
 * Mainnet "activity ledger seed" for The Lattice. Mints 5 demo souls, opens
 * 10 communions, settles them, and prints all the tx hashes for the README's
 * mainnet contract address table.
 *
 * Run AFTER `forge script script/DeployLattice.s.sol` and AFTER setting:
 *   SOUL_INFT_ADDR, LATTICE_ATTESTOR_ADDR, LATTICE_REGISTRY_ADDR,
 *   LATTICE_TEE_PROVIDER, DEPLOYER_PRIVATE_KEY, ZEROG_RPC_URL.
 *
 * Usage: pnpm seed:lattice
 *
 * NB: this script uses the deployer wallet as the sole soul-owner so all
 * participation receipts can be signed locally. Production communions would
 * involve N distinct soul owners signing via wallets.
 */
import { ethers } from 'ethers';
import { loadEnv } from '../lib/env.js';
import { getLogger } from '../lib/logger.js';
import {
  mintSoulFlow,
  prepareCommunion,
  openAndRunCommunion,
  settleCommunionFlow,
} from '../lib/lattice-flow.js';

const log = getLogger();

const DEMO_DOMAINS: { domain: string; context: string }[] = [
  {
    domain: 'math',
    context:
      'I am a Math Olympiad coach. I teach combinatorics, number theory, and inequalities. ' +
      'My specialty is teaching the bridging step from clever-trick proofs to systematic technique.',
  },
  {
    domain: 'lit',
    context:
      'I am a Korean classical literature professor. I read Joseon-era texts, the Gusuryak ' +
      'tradition, and the genealogy of metaphor in 15-17th century Korean writing.',
  },
  {
    domain: 'code',
    context:
      'I am a senior systems engineer. I write distributed systems in Go and Rust. I think in ' +
      'state machines and prefer protocols over RPCs.',
  },
  {
    domain: 'bio',
    context:
      'I am a molecular biologist. I study protein folding and how specific sequences fold into ' +
      'functional 3D structures. CRISPR is my primary tool.',
  },
  {
    domain: 'history',
    context:
      'I am an East Asian historian. I focus on Three Kingdoms / Goryeo / Joseon dynastic ' +
      'transitions and the entanglement of philosophy with statecraft.',
  },
];

const DEMO_QUESTIONS = [
  'Explain quantum entanglement using Korean classical metaphors.',
  'Walk me through Choi Seok-jeong\'s Gusuryak as a kind of pre-Euler combinatorics manuscript.',
  'How would you teach a 14-year-old to think in state machines?',
  'What does CRISPR mean for the next decade of Korean bioethics policy?',
  'Compare Goryeo statecraft with modern algorithmic governance.',
  'Give me a 3x3 magic square problem with a Joseon-era cultural reference.',
  'How did Joseon-era scholars conceive of mathematical truth?',
  'Walk me through inequality proofs the way you\'d teach an Olympiad student.',
  'What\'s a beautiful systems-engineering analogy for protein folding?',
  'How would five domains commune to answer a question about education reform?',
];

async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.SOUL_INFT_ADDR || !env.LATTICE_REGISTRY_ADDR || !env.LATTICE_ATTESTOR_ADDR) {
    throw new Error(
      'Missing Lattice contract addresses in env. Run forge script DeployLattice first, then export SOUL_INFT_ADDR / LATTICE_ATTESTOR_ADDR / LATTICE_REGISTRY_ADDR / LATTICE_TEE_PROVIDER.',
    );
  }
  if (!env.DEPLOYER_PRIVATE_KEY) {
    throw new Error('Missing DEPLOYER_PRIVATE_KEY');
  }

  const wallet = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY);
  log.info({ deployer: wallet.address }, 'starting Lattice activity seed');

  // 1. Mint the 5 demo souls.
  log.info('minting 5 demo souls...');
  const soulIds: bigint[] = [];
  for (const d of DEMO_DOMAINS) {
    const s = await mintSoulFlow({
      ownerAddress: wallet.address,
      contextText: d.context,
      domain: d.domain,
    });
    log.info({ soulId: s.soulId.toString(), domain: d.domain, tx: s.txHash }, '  ✓ minted');
    soulIds.push(s.soulId);
  }

  // 2. Run 10 communions, each picking 3-5 random souls.
  log.info('running 10 communions...');
  const communionTxHashes: { open: string; attest: string; settle: string }[] = [];
  for (let i = 0; i < DEMO_QUESTIONS.length; i++) {
    const n = 3 + (i % 3); // 3, 4, or 5 souls
    const subset = pickRandomSubset(soulIds, n);
    const paymentWei = ethers.parseEther('0.01'); // small but nonzero on mainnet

    const prep = await prepareCommunion({
      payer: wallet.address,
      soulIds: subset,
      paymentWei,
      question: DEMO_QUESTIONS[i] ?? 'communion',
    });

    // Sign the participation message N times — same wallet owns all souls in the seed.
    const sig = await wallet.signMessage(ethers.getBytes(prep.participationMessage));
    const receipts = subset.map(() => sig);

    const opened = await openAndRunCommunion({
      communionId: prep.communionId,
      participationReceipts: receipts,
    });
    if (opened.status !== 'attested') {
      log.error({ status: opened.status, reason: opened.failureReason }, '  ✗ communion failed to attest');
      continue;
    }
    const settled = await settleCommunionFlow(prep.communionId);
    log.info(
      {
        i: i + 1,
        souls: subset.map(String),
        open: opened.openTxHash,
        attest: opened.attestationTxHash,
        settle: settled.record.settleTxHash,
      },
      '  ✓ communion settled',
    );
    communionTxHashes.push({
      open: opened.openTxHash ?? '',
      attest: opened.attestationTxHash ?? '',
      settle: settled.record.settleTxHash ?? '',
    });
  }

  log.info(
    {
      souls: soulIds.length,
      communions: communionTxHashes.length,
    },
    'Lattice activity seed complete',
  );
  console.log('\n=== Lattice Mainnet Seed Summary ===');
  console.log(`souls minted: ${soulIds.length}`);
  console.log(`communions:   ${communionTxHashes.length}`);
  console.log('\nadd these to README.md mainnet activity ledger:');
  for (const c of communionTxHashes) {
    console.log(`  • open ${c.open}  attest ${c.attest}  settle ${c.settle}`);
  }
}

function pickRandomSubset<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length > 0) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]!);
  }
  // Sort ascending for the contract's invariant.
  return out.sort((a, b) => ((a as unknown as bigint) < (b as unknown as bigint) ? -1 : 1));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
