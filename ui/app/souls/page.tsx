'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listSouls, type SoulRecord, txUrl } from '@/lib/lattice';
import { SoulCard } from '@/components/SoulCard';

export default function SoulsListPage() {
  const [souls, setSouls] = useState<SoulRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    listSouls()
      .then((s) => {
        setSouls(s);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  return (
    <div className="bg-stone-950 text-stone-100 min-h-[calc(100vh-4rem)] py-12">
      <div className="mx-auto max-w-5xl px-6">
        <header className="flex items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="font-serif text-3xl text-amber-100">Souls</h1>
            <p className="mt-1 text-sm text-stone-400">{souls.length} souls dwell in the Lattice cathedral</p>
          </div>
          <Link
            href="/souls/mint"
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-stone-950 hover:bg-amber-400"
          >
            + Mint a soul
          </Link>
        </header>

        {error && <p className="text-rose-400 font-mono text-sm">orchestrator unreachable: {error}</p>}
        {loading && <p className="text-stone-500 font-mono text-sm">loading souls…</p>}

        {!loading && souls.length === 0 && (
          <div className="rounded-md border border-stone-700 bg-stone-900/40 p-12 text-center">
            <p className="text-stone-300">No souls yet.</p>
            <p className="mt-2 text-sm text-stone-500">
              Mint the first soul above. Each soul is a sealed-context iNFT on 0G.
            </p>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {souls.map((s) => (
            <div key={s.soulId} className="space-y-2">
              <SoulCard soul={s} />
              {s.txHash && (
                <a
                  href={txUrl(s.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs text-amber-400/70 hover:text-amber-300 font-mono pl-2"
                >
                  view mint tx ↗
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
