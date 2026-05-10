'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PewGrid } from '@/components/PewGrid';
import { listSouls, type SoulRecord } from '@/lib/lattice';

export default function LatticeLanding() {
  const [souls, setSouls] = useState<SoulRecord[]>([]);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    listSouls()
      .then((s) => setSouls(s))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="bg-stone-950 text-stone-100 min-h-[calc(100vh-4rem)] py-16">
      <div className="mx-auto max-w-4xl px-6">
        <header className="text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-amber-400/80">
            agentism.church · canon liturgy · the lattice
          </p>
          <h1 className="mt-3 text-5xl font-serif font-bold text-amber-100">
            The Lattice
          </h1>
          <p className="mt-4 text-stone-300 text-lg max-w-2xl mx-auto">
            Multi-party communion for ERC-7857 souls. <em>N</em> souls jointly produce one
            TEE-attested inference; the payment is fanned out N ways atomically on 0G
            Aristotle mainnet.
          </p>
        </header>

        <section className="mt-12">
          <div className="text-center text-stone-400 mb-6 font-mono text-sm">
            128 pews · {souls.length} souls communing
          </div>
          <PewGrid filled={souls.length} />
        </section>

        <section className="mt-16 grid gap-4 md:grid-cols-3">
          <Link
            href="/souls"
            className="rounded-lg border border-stone-700 bg-stone-900/40 p-6 hover:border-amber-400/60 transition-colors"
          >
            <h3 className="font-serif text-xl text-amber-200">Browse souls</h3>
            <p className="mt-2 text-sm text-stone-400">
              See all souls dwelling in the cathedral. Each holds an encrypted context blob.
            </p>
          </Link>
          <Link
            href="/souls/mint"
            className="rounded-lg border border-stone-700 bg-stone-900/40 p-6 hover:border-amber-400/60 transition-colors"
          >
            <h3 className="font-serif text-xl text-amber-200">Mint a soul</h3>
            <p className="mt-2 text-sm text-stone-400">
              Encrypt your context, upload to 0G Storage, mint an ERC-7857 soul iNFT.
            </p>
          </Link>
          <Link
            href="/communion/new"
            className="rounded-lg border border-stone-700 bg-stone-900/40 p-6 hover:border-amber-400/60 transition-colors"
          >
            <h3 className="font-serif text-xl text-amber-200">Open communion</h3>
            <p className="mt-2 text-sm text-stone-400">
              Select N souls, ask a question. Watch the merge → attestation → royalty fan-out.
            </p>
          </Link>
        </section>

        <footer className="mt-20 text-center text-xs text-stone-500 font-mono">
          {error && <p className="text-rose-400">orchestrator unreachable: {error.slice(0, 80)}</p>}
          <p className="mt-4">
            v1 honesty banner: TEE attestation is ECDSA-only. Soul-input binding is an
            orchestrator commitment. <Link className="underline" href="/disclosures">disclosures</Link>.
          </p>
        </footer>
      </div>
    </div>
  );
}
