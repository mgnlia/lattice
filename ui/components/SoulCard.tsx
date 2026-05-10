'use client';

import type { SoulRecord } from '@/lib/lattice';

const DOMAIN_GLYPHS: Record<string, string> = {
  math: '∑',
  lit: '✒',
  code: '⌘',
  bio: '⚕',
  history: '⏳',
  music: '♪',
  philosophy: 'Ψ',
};

export function SoulCard({
  soul,
  selected,
  onToggle,
}: {
  soul: SoulRecord;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const glyph = DOMAIN_GLYPHS[soul.domain.toLowerCase()] ?? '⌬';
  return (
    <button
      type="button"
      onClick={onToggle}
      className={[
        'w-full text-left rounded-md border p-4 transition-colors',
        selected
          ? 'border-amber-400 bg-amber-400/10 ring-1 ring-amber-400/40'
          : 'border-stone-700 bg-stone-900/40 hover:border-stone-500',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl text-amber-400" aria-hidden>{glyph}</span>
          <div>
            <div className="font-mono text-xs text-stone-400">soul #{soul.soulId}</div>
            <div className="text-base font-semibold text-stone-100">{soul.domain}</div>
          </div>
        </div>
        {selected && (
          <div className="text-amber-400" aria-label="selected">●</div>
        )}
      </div>
      <div className="mt-3 truncate font-mono text-xs text-stone-500" title={soul.contextRoot}>
        ctx {soul.contextRoot.slice(0, 10)}…{soul.contextRoot.slice(-6)}
      </div>
      <div className="mt-1 truncate font-mono text-xs text-stone-500">
        royalty → {soul.royaltyWallet.slice(0, 6)}…{soul.royaltyWallet.slice(-4)}
      </div>
    </button>
  );
}
