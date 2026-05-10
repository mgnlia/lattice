'use client';

// Providers — react-query always mounted; wagmi + RainbowKit lazy-loaded
// client-side only. wagmi's WalletConnect transitively imports indexedDB,
// which crashes Node-side SSR on Vercel — so we keep wagmi out of the SSR
// import graph entirely via dynamic import inside useEffect.

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Web3Wrapper = (p: { children: ReactNode }) => React.JSX.Element;

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );
  const [Web3, setWeb3] = useState<Web3Wrapper | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ WagmiProvider }, rk, { wagmiConfig }] = await Promise.all([
        import('wagmi'),
        import('@rainbow-me/rainbowkit'),
        import('@/lib/wagmi'),
        import('@rainbow-me/rainbowkit/styles.css'),
      ]);
      if (cancelled) return;
      const { RainbowKitProvider, darkTheme } = rk;
      const theme = darkTheme({
        accentColor: '#f59e0b',
        accentColorForeground: '#0c0a09',
        borderRadius: 'medium',
      });
      const Wrap: Web3Wrapper = ({ children: c }) => (
        <WagmiProvider config={wagmiConfig}>
          <RainbowKitProvider theme={theme}>{c}</RainbowKitProvider>
        </WagmiProvider>
      );
      setWeb3(() => Wrap);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Block children render until Web3 is loaded — otherwise pages that call
  // useAccount() / useSignMessage() crash on hydration before WagmiProvider
  // mounts. Pages that don't need wagmi are unaffected (the bundle is tiny
  // and loads in well under 200ms).
  return (
    <QueryClientProvider client={qc}>
      {Web3 ? (
        <Web3>{children}</Web3>
      ) : (
        <div className="min-h-screen bg-stone-950 text-stone-100" aria-hidden />
      )}
    </QueryClientProvider>
  );
}
