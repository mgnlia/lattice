'use client';

import { useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useRouter } from 'next/navigation';
import { listSouls, prepareCommunion, openCommunion, type SoulRecord } from '@/lib/lattice';
import { SoulCard } from '@/components/SoulCard';

export default function NewCommunionPage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const router = useRouter();

  const [souls, setSouls] = useState<SoulRecord[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [question, setQuestion] = useState('');
  const [paymentOG, setPaymentOG] = useState('1');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'select' | 'preparing' | 'signing' | 'opening' | 'done'>('select');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    listSouls()
      .then(setSouls)
      .catch((e) => setError(String(e)));
  }, []);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function handleStart() {
    if (!isConnected || !address) {
      setError('connect a wallet first');
      return;
    }
    if (selected.size === 0) {
      setError('pick at least one soul');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      // Sort selected ids ascending so they match what the contract expects.
      const sortedIds = Array.from(selected).sort((a, b) => Number(BigInt(a) - BigInt(b)));

      setStep('preparing');
      const paymentWei = (BigInt(Math.floor(parseFloat(paymentOG) * 1e18))).toString();
      const prep = await prepareCommunion({
        payer: address,
        soulIds: sortedIds,
        paymentWei,
        question,
      });

      setStep('signing');
      // For the demo: all souls are owned by the connected wallet, so we sign
      // the same participation message N times. (UX note: this triggers N wallet
      // popups — production would batch via wallet_signTypedData_v4.)
      const receipts: string[] = [];
      for (let i = 0; i < sortedIds.length; i++) {
        const sig = await signMessageAsync({
          message: { raw: prep.participationMessage as `0x${string}` },
        });
        receipts.push(sig);
      }

      setStep('opening');
      const opened = await openCommunion({ communionId: prep.communionId, participationReceipts: receipts });
      setStep('done');
      router.push(`/communion/${opened.communionId}`);
    } catch (err) {
      setError(String(err));
      setStep('select');
    } finally {
      setBusy(false);
    }
  }

  const stepLabel = {
    select: 'Pick souls + ask a question',
    preparing: 'Predicting communionId on-chain…',
    signing: `Sign ${selected.size} participation receipts in your wallet…`,
    opening: 'Submitting openCommunion + running TEE inference + posting attestation…',
    done: 'Communion attested. Redirecting…',
  }[step];

  return (
    <div className="bg-stone-950 text-stone-100 min-h-[calc(100vh-4rem)] py-12">
      <div className="mx-auto max-w-4xl px-6">
        <header className="mb-6">
          <h1 className="font-serif text-3xl text-amber-100">Open a Communion</h1>
          <p className="mt-2 text-sm text-stone-400">
            Select N souls (1–16). They commune via TEE; the payment is fanned N ways atomically
            on settlement.
          </p>
        </header>

        <section className="rounded-md border border-stone-700 bg-stone-900/40 p-5 mb-6">
          <h2 className="font-serif text-lg text-amber-200 mb-3">Question for the Lattice</h2>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            className="w-full rounded-md bg-stone-900 border border-stone-700 px-3 py-2 text-sm text-stone-100 focus:border-amber-400 focus:outline-none"
            placeholder="e.g. ‘Explain quantum entanglement using Korean classical metaphors.’"
            required
          />
          <div className="mt-3 flex items-center gap-2">
            <label className="text-xs text-stone-400">Payment (OG):</label>
            <input
              type="number"
              step="0.001"
              min="0"
              value={paymentOG}
              onChange={(e) => setPaymentOG(e.target.value)}
              className="w-32 rounded bg-stone-900 border border-stone-700 px-2 py-1 text-xs font-mono text-stone-100"
            />
            <span className="text-xs text-stone-500">
              fans {selected.size} ways → {selected.size > 0 ? (parseFloat(paymentOG) / selected.size).toFixed(4) : '—'} per soul
            </span>
          </div>
        </section>

        <h2 className="font-serif text-lg text-amber-200 mb-3">Souls in the cathedral</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 mb-6">
          {souls.map((s) => (
            <SoulCard
              key={s.soulId}
              soul={s}
              selected={selected.has(s.soulId)}
              onToggle={() => toggle(s.soulId)}
            />
          ))}
        </div>

        {error && <p className="text-rose-400 text-sm mb-3">{error}</p>}
        <p className="text-xs text-stone-400 mb-3">{busy ? `→ ${stepLabel}` : `${selected.size} selected · max 16 per Communion`}</p>

        <button
          type="button"
          disabled={busy || selected.size === 0 || question.length === 0 || !isConnected}
          onClick={handleStart}
          className="w-full rounded-md bg-amber-500 py-3 text-stone-950 font-medium hover:bg-amber-400 disabled:opacity-40"
        >
          {busy ? 'communing…' : `Open Communion with ${selected.size} souls`}
        </button>
      </div>
    </div>
  );
}
