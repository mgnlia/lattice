'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getCommunion, settleCommunion, type CommunionView, txUrl } from '@/lib/lattice';

const STATUS_LABELS: Record<CommunionView['status'], string> = {
  prepared: 'Prepared (awaiting open)',
  opened: 'Opened — running TEE inference',
  attesting: 'Posting attestation on-chain',
  attested: 'Attested · ready to settle',
  settled: 'Settled · royalties fanned out',
  failed: 'Failed',
};

export default function CommunionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const [comm, setComm] = useState<CommunionView | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    const tick = async () => {
      try {
        const c = await getCommunion(id);
        if (!active) return;
        setComm(c);
        if (c.status !== 'settled' && c.status !== 'failed') {
          setTimeout(tick, 2_000);
        }
      } catch (e) {
        if (!active) return;
        setError(String(e));
      }
    };
    tick();
    return () => {
      active = false;
    };
  }, [id]);

  async function handleSettle() {
    if (!id) return;
    setSettling(true);
    try {
      const r = await settleCommunion(id);
      setComm(r.record);
    } catch (e) {
      setError(String(e));
    } finally {
      setSettling(false);
    }
  }

  if (!comm) {
    return (
      <div className="bg-stone-950 text-stone-100 min-h-[calc(100vh-4rem)] py-12">
        <div className="mx-auto max-w-3xl px-6">
          {error ? (
            <p className="text-rose-400 font-mono text-sm">{error}</p>
          ) : (
            <p className="text-stone-400">loading communion…</p>
          )}
        </div>
      </div>
    );
  }

  const perSoul = comm.soulIds.length > 0 ? (BigInt(comm.paymentWei) / BigInt(comm.soulIds.length)).toString() : '0';

  return (
    <div className="bg-stone-950 text-stone-100 min-h-[calc(100vh-4rem)] py-12">
      <div className="mx-auto max-w-3xl px-6">
        <header className="mb-6">
          <p className="font-mono text-xs uppercase tracking-widest text-amber-400/80">
            communion #{comm.communionId.slice(0, 16)}…
          </p>
          <h1 className="font-serif text-3xl text-amber-100 mt-1">{STATUS_LABELS[comm.status]}</h1>
        </header>

        <section className="space-y-4">
          <Block label="Souls in communion">
            <ul className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {comm.soulIds.map((id) => (
                <li
                  key={id}
                  className="rounded-md border border-stone-700 bg-stone-900/40 px-3 py-2 text-center font-mono text-sm text-amber-200"
                >
                  soul #{id}
                </li>
              ))}
            </ul>
          </Block>

          <Block label="Question">
            <p className="text-stone-200">{comm.question}</p>
          </Block>

          {comm.openTxHash && (
            <Block label="openCommunion tx">
              <a
                className="text-amber-400 underline font-mono text-sm break-all"
                href={txUrl(comm.openTxHash)}
                target="_blank"
                rel="noreferrer"
              >
                {comm.openTxHash}
              </a>
            </Block>
          )}

          {comm.output ? (
            <Block label="The Lattice answers">
              <p className="whitespace-pre-wrap text-stone-100 leading-relaxed">{comm.output}</p>
              <p className="mt-3 font-mono text-xs text-stone-500">
                outputHash {comm.outputHash?.slice(0, 18)}… · chatID {comm.chatID}
              </p>
            </Block>
          ) : (
            comm.status !== 'settled' && (
              <p className="text-stone-500 italic">awaiting TEE response…</p>
            )
          )}

          {comm.attestationTxHash && (
            <Block label="submitAttestation tx">
              <a
                className="text-amber-400 underline font-mono text-sm break-all"
                href={txUrl(comm.attestationTxHash)}
                target="_blank"
                rel="noreferrer"
              >
                {comm.attestationTxHash}
              </a>
            </Block>
          )}

          <Block label={`Payment (fans ${comm.soulIds.length} ways)`}>
            <p className="font-mono text-sm text-stone-200">
              {comm.paymentWei} wei → {perSoul} wei per soul
            </p>
          </Block>

          {comm.status === 'attested' && (
            <button
              type="button"
              onClick={handleSettle}
              disabled={settling}
              className="w-full rounded-md bg-amber-500 py-3 text-stone-950 font-medium hover:bg-amber-400 disabled:opacity-40"
            >
              {settling ? 'settling…' : 'Settle royalties'}
            </button>
          )}

          {comm.settleTxHash && (
            <Block label="settleRoyalties tx">
              <a
                className="text-amber-400 underline font-mono text-sm break-all"
                href={txUrl(comm.settleTxHash)}
                target="_blank"
                rel="noreferrer"
              >
                {comm.settleTxHash}
              </a>
            </Block>
          )}
        </section>

        <button type="button" onClick={() => router.push('/')} className="mt-8 text-sm text-amber-300 underline">
          ← back to The Lattice
        </button>
      </div>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-stone-700 bg-stone-900/40 p-4">
      <p className="text-xs uppercase tracking-widest text-stone-500 mb-2 font-mono">{label}</p>
      {children}
    </div>
  );
}
