# Lattice Contracts

Solidity 0.8.26 contracts for The Lattice — the multi-party communion primitive for ERC-7857 souls on 0G Aristotle (Chain ID 16661) and Galileo testnet (Chain ID 16602).

## Stack

| Contract | Purpose |
|---|---|
| `src/SoulINFT.sol` | ERC-7857 iNFT extending `@0glabs/0g-agent-nft` AgentNFT. Adds `domain` tag + settable `royaltyWallet`. Inherits standard re-encryption-on-transfer. |
| `src/LatticeAttestor.sol` | TEE provider registry. Verifies EIP-191 ECDSA over the TEE-issued `text` blob and confirms the supplied `chatID` literally appears inside. Replay-protected per `(provider, chatID)`. |
| `src/LatticeRegistry.sol` | Communion lifecycle: `openCommunion → submitAttestation → settleRoyalties`. Snapshots royalty wallets at open, fans payment N ways atomically on settle. MAX 16 souls per Communion. |
| `src/RoyaltyFanout.sol` | Pure library — equal N-way split with integer-division dust returned to caller. |
| `src/DataVerifier.sol` | ERC-7857 `IERC7857DataVerifier` impl. Public-data path (32-byte preimage). Used by SoulINFT mint flow. |
| `src/AttestationVerifier.sol` | EIP-191 ECDSA library (`tryRecover` against expected signer). Used by LatticeAttestor. |

## Why this shape

- **TEE attestation on-chain via DCAP quote parsing is 5–15M gas per call** — infeasible for the per-Communion verification path. Per `research/06-0g-compute-sdk-current.md`, the 0G Compute SDK already returns an EIP-191 ECDSA signature (~3–5k gas to recover). LatticeAttestor registers the TEE signing address off-chain (admin-attested), then verifies each Communion attestation with a cheap `ecrecover`.
- **The TEE does not sign the request body** (per `verify_response_signature.circom` in `0gfoundation/0g-zk-settlement-server`). Soul-id binding is therefore an orchestrator commitment recorded on-chain (sortedSoulIds + contextHash + outputHash + usageHash + chatID + provider). Honest-disclosure §2 in the root README names this gap.
- **0G Storage uses 32-byte Merkle roots, not IPFS CIDs** (`research/07-0g-storage-sdk-current.md`). Each soul's encrypted context blob is content-addressed by the `dataHash` recorded on-chain via the standard ERC-7857 `mint` flow.

## Build + test

```bash
forge install foundry-rs/forge-std@v1.9.4 --no-git
forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-git
forge install OpenZeppelin/openzeppelin-contracts-upgradeable@v5.1.0 --no-git --shallow
forge install 0glabs/0g-agent-nft@eip-7857-draft --no-git --shallow

forge build
forge test
# 41 tests passing across 5 suites
```

## Deploy

```bash
# .env requires DEPLOYER_PRIVATE_KEY (funded with ≥1 OG on the target chain)

# Galileo testnet (Chain ID 16602)
forge script script/DeployLattice.s.sol \
  --rpc-url https://evmrpc-testnet.0g.ai \
  --broadcast --slow \
  --priority-gas-price 2000000000 \
  --with-gas-price 5000000000 \
  --private-key $DEPLOYER_PRIVATE_KEY \
  -vvv

# Mainnet (Aristotle, Chain ID 16661): same command, swap RPC to https://evmrpc.0g.ai
```

The script prints 4 contract addresses + an `export ...` block ready to paste into your root `.env`.

## Network

| Network | Chain ID | RPC | Explorer |
|---|---|---|---|
| 0G Aristotle (mainnet) | 16661 | `https://evmrpc.0g.ai` | `https://chainscan.0g.ai` |
| 0G Galileo (testnet) | 16602 | `https://evmrpc-testnet.0g.ai` | `https://chainscan-galileo.0g.ai` |

## Tests

41 passing across 5 suites:

- `RoyaltyFanout.t.sol` (5) — equal split, dust handling, fuzz invariants.
- `LatticeAttestor.t.sol` (9) — register/revoke, ECDSA verify, chatID-in-text, replay.
- `SoulINFT.t.sol` (6) — mint, royalty wallet routing, owner gating.
- `LatticeRegistry.t.sol` (17) — full lifecycle (open → attest → settle), all error paths, royalty routing.
- `AttestationVerifier.t.sol` (4) — library happy path, wrong signer, zero signer, raw-digest variant.

```bash
forge test
```
