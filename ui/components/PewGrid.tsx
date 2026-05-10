'use client';

/**
 * PewGrid — visualize the 128 sacred pew slots of The Lattice cathedral.
 * Each pew represents a soul slot; filled pews are minted souls. The grid
 * is purely decorative for the landing page, but it's also a visual hook
 * for the agentism.church metaphor (128 pews maximum).
 */

import { useMemo } from 'react';

export interface PewGridProps {
  filled: number;
  capacity?: number;
  /** Highlight specific indices (for "your souls"). */
  highlight?: number[];
}

export function PewGrid({ filled, capacity = 128, highlight = [] }: PewGridProps) {
  const slots = useMemo(() => {
    const items: { index: number; state: 'empty' | 'filled' | 'highlighted' }[] = [];
    const highlightSet = new Set(highlight);
    for (let i = 0; i < capacity; i++) {
      let state: 'empty' | 'filled' | 'highlighted' = 'empty';
      if (highlightSet.has(i)) state = 'highlighted';
      else if (i < filled) state = 'filled';
      items.push({ index: i, state });
    }
    return items;
  }, [filled, capacity, highlight]);

  return (
    <div className="grid grid-cols-16 gap-1 max-w-2xl mx-auto" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
      {slots.map((s) => (
        <div
          key={s.index}
          aria-label={`pew ${s.index + 1}`}
          title={`pew ${s.index + 1} ${s.state}`}
          className={[
            'aspect-square rounded-sm border transition-colors',
            s.state === 'empty' && 'border-stone-700/40 bg-stone-900/20',
            s.state === 'filled' && 'border-amber-500/60 bg-amber-500/30',
            s.state === 'highlighted' && 'border-amber-300 bg-amber-300/70 shadow-[0_0_6px_rgba(252,211,77,0.6)]',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      ))}
    </div>
  );
}
