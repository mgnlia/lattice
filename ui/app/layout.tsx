// Root layout — server component. Wraps the app in Providers (client component).

import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';
import { SiteHeader } from '@/components/SiteHeader';

const inter = Inter({ subsets: ['latin', 'latin-ext'], display: 'swap' });

export const metadata: Metadata = {
  title: 'The Lattice — multi-party communion for ERC-7857 souls',
  description:
    'N souls jointly produce one TEE-attested inference; the payment fans N ways atomically on 0G Aristotle. Atomic INFTs are molecules; The Lattice is the chemistry.',
  applicationName: 'The Lattice',
  authors: [{ name: 'The Lattice Team' }],
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#0c0a09',
  width: 'device-width',
  initialScale: 1,
};

// Force dynamic — WalletConnect's @walletconnect/ethereum-provider calls indexedDB
// in its constructor, which throws under static pre-render.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="min-h-screen bg-stone-950 text-stone-100 antialiased">
        <Providers>
          <SiteHeader />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
