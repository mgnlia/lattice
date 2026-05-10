'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';
import { mintSoul, txUrl } from '@/lib/lattice';

const DEMO_DOMAINS = ['math', 'lit', 'code', 'bio', 'history', 'music', 'philosophy'];

export default function MintSoulPage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const [domain, setDomain] = useState('math');
  const [contextText, setContextText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ soulId: string; txHash: string } | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isConnected || !address) {
      setError('connect a wallet first');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const soul = await mintSoul({
        ownerAddress: address,
        contextText,
        domain,
      });
      setResult({ soulId: soul.soulId, txHash: soul.txHash });
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-stone-950 text-stone-100 min-h-[calc(100vh-4rem)] py-12">
      <div className="mx-auto max-w-2xl px-6">
        <h1 className="font-serif text-3xl text-amber-100 mb-2">Mint a Soul</h1>
        <p className="text-sm text-stone-400 mb-8">
          Encrypt a context blob, upload to 0G Storage, mint an ERC-7857 iNFT bound to the
          context Merkle root. Royalties on every Communion you participate in route to the
          royalty wallet (default = your address).
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-2">Domain</label>
            <div className="flex flex-wrap gap-2">
              {DEMO_DOMAINS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDomain(d)}
                  className={[
                    'rounded-full px-3 py-1 text-xs font-mono uppercase tracking-wider',
                    domain === d
                      ? 'bg-amber-400 text-stone-950'
                      : 'border border-stone-700 text-stone-400 hover:border-amber-400/60',
                  ].join(' ')}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="ctx" className="block text-sm font-medium text-stone-300 mb-2">
              Context (this becomes your soul&apos;s sealed knowledge)
            </label>
            <textarea
              id="ctx"
              value={contextText}
              onChange={(e) => setContextText(e.target.value)}
              rows={8}
              className="w-full rounded-md bg-stone-900 border border-stone-700 px-3 py-2 text-sm text-stone-100 focus:border-amber-400 focus:outline-none"
              placeholder="e.g. ‘I am a Math Olympiad coach with 12 years of experience teaching combinatorics and number theory…’"
              required
            />
            <p className="mt-1 text-xs text-stone-500">
              Encrypted client-side, content-addressed via Merkle root on 0G Storage. Only the
              orchestrator (during Communion) decrypts on your behalf.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-300 mb-2">
              Owner / royalty wallet
            </label>
            <p className="font-mono text-xs text-stone-500">
              {address ?? 'connect a wallet to set'}
            </p>
          </div>

          <button
            type="submit"
            disabled={busy || !isConnected}
            className="w-full rounded-md bg-amber-500 py-3 text-stone-950 font-medium hover:bg-amber-400 disabled:opacity-40"
          >
            {busy ? 'minting…' : 'Mint Soul'}
          </button>

          {error && <p className="text-rose-400 text-sm">{error}</p>}

          {result && (
            <div className="rounded-md border border-amber-400/40 bg-amber-400/5 p-4">
              <p className="text-amber-200 text-sm">Soul minted!</p>
              <p className="font-mono text-xs text-stone-300 mt-1">soul #{result.soulId}</p>
              <a
                href={txUrl(result.txHash)}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-amber-400 hover:text-amber-300 font-mono"
              >
                view tx ↗
              </a>
              <button
                type="button"
                onClick={() => router.push('/souls')}
                className="block mt-3 text-sm text-amber-300 underline"
              >
                ← back to souls
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
