// wagmi + RainbowKit config for 0G Aristotle mainnet (Chain ID 16661).
// First-principle: a wagmi config file is data, not logic. Keep it dumb so it
// can be imported from both client and server without surprising side effects.

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import type { Chain } from 'viem';
import { http } from 'wagmi';

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? 'https://evmrpc.0g.ai';

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? '16661');

const EXPLORER =
  process.env.NEXT_PUBLIC_EXPLORER ?? 'https://chainscan.0g.ai';

/**
 * 0G Aristotle mainnet definition.
 * Source: research/06-0g-compute-sdk-current.md §5.
 */
export const aristotle: Chain = {
  id: CHAIN_ID,
  name: '0G-Aristotle',
  nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] }
  },
  blockExplorers: {
    default: { name: 'ChainScan', url: EXPLORER }
  }
};

/**
 * RainbowKit + wagmi config. WalletConnect projectId is a stub — replace at
 * deploy time with `NEXT_PUBLIC_WC_PROJECT_ID`. Localhost demos work without it.
 */
export const wagmiConfig = getDefaultConfig({
  appName: 'The Lattice',
  projectId:
    process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? 'lattice-demo-projectid-stub',
  chains: [aristotle],
  transports: { [aristotle.id]: http(RPC_URL) },
  ssr: true
});

export const EXPLORER_URL = EXPLORER;
export const RPC = RPC_URL;
