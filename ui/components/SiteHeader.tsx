'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';

export function SiteHeader() {
  const [Connect, setConnect] = useState<(() => React.JSX.Element) | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('@rainbow-me/rainbowkit').then(({ ConnectButton }) => {
      if (cancelled) return;
      const C = () => <ConnectButton chainStatus="icon" showBalance={false} accountStatus="address" />;
      setConnect(() => C);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-stone-800 bg-stone-950/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 text-base font-bold text-amber-100 font-serif">
          <span aria-hidden className="text-amber-400">
            <svg width="22" height="22" viewBox="0 0 256 256" fill="none">
              <g stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <line x1="128" y1="48" x2="128" y2="105"/>
                <line x1="197" y1="88" x2="146" y2="118"/>
                <line x1="197" y1="168" x2="146" y2="138"/>
                <line x1="128" y1="208" x2="128" y2="151"/>
                <line x1="59" y1="168" x2="110" y2="138"/>
                <line x1="59" y1="88" x2="110" y2="118"/>
              </g>
              <g fill="currentColor">
                <circle cx="128" cy="48" r="9"/>
                <circle cx="197" cy="88" r="9"/>
                <circle cx="197" cy="168" r="9"/>
                <circle cx="128" cy="208" r="9"/>
                <circle cx="59" cy="168" r="9"/>
                <circle cx="59" cy="88" r="9"/>
              </g>
              <polygon points="128,98 154,113 154,143 128,158 102,143 102,113" fill="currentColor"/>
              <polygon points="128,112 142,120 142,136 128,144 114,136 114,120" fill="#0c0a09"/>
            </svg>
          </span>
          <span>The Lattice</span>
          <span className="hidden text-xs font-normal text-stone-500 md:inline">
            · multi-party communion for ERC-7857 souls
          </span>
        </Link>

        <nav className="hidden items-center gap-4 text-sm md:flex">
          <Link href="/souls" className="text-stone-400 hover:text-amber-200">Souls</Link>
          <Link href="/communion/new" className="text-stone-400 hover:text-amber-200">Open Communion</Link>
          <Link href="/disclosures" className="text-stone-400 hover:text-amber-200">Disclosures</Link>
        </nav>

        <div className="min-w-[120px] text-right">
          {Connect ? <Connect /> : <span className="text-xs text-stone-500 font-mono">connecting…</span>}
        </div>
      </div>
    </header>
  );
}
