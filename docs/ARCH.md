# Architecture

This is the longer-form companion to the README. It documents the trust
model, the contract surface, and the orchestrator API.

## The primitive

A "Communion" is an atomic on-chain event where N ERC-7857 souls jointly
produce one TEE-attested inference, and the inference fee is fanned N ways
to the soul owners. Every iNFT today is atomic: single owner, single
context, single inference. There's no on-chain primitive for N souls to
compose into one inference where all N get cryptographic attribution and
royalty. That gap is what The Lattice fills.

## Trust model

Five things matter — what's proven on-chain, what's assumed, and where
the gaps are.

1. **TeeML provider's signing key is genuinely TEE-attested.** Trusted at
   registration time via off-chain DCAP. Per inference we ECDSA-recover
   against the registered signer. Full in-protocol DCAP verify (5-15M gas)
   is on the v2 roadmap.

2. **Soul owner consents to participate.** Proven on-chain: each soul owner
   signs an EIP-191 receipt over
   `keccak256("LATTICE_OPEN" ‖ chainId ‖ contract ‖ communionId ‖ contextHash)`,
   and `LatticeRegistry.openCommunion` calls `ecrecover` against
   `SoulINFT.ownerOf(soulId)`.

3. **TEE response signature binds soul IDs to inference.** False — and the
   most important caveat. The 0G Compute SDK signs `requestHash || cost`,
   not the request body. So the TEE attests "a TeeML inference happened
   with this chatID and cost," not "these N souls were the inputs." We
   bind the soul IDs by orchestrator commitment: alongside the raw
   `(text, signature)` we submit
   `proofRoot = keccak256(provider, chatID, sortedSoulIds, outputHash, usageHash)`
   on-chain, and the contract checks (a) ECDSA over `text` recovers to the
   registered signer, and (b) `text` contains the chatID via byte-loop.
   v2 path: per-context TEE attestation.

4. **Orchestrator faithfully includes each soul's context.** Trusted in v1.
   A malicious orchestrator could collect N receipts and only forward K<N
   contexts; the TEE wouldn't notice. This follows from #3.

5. **Replay protection.** Proven. `(provider, chatID)` is the canonical
   proofId; `LatticeAttestor.usedProofs[proofId]` blocks reuse across
   providers.

## Contracts

```
┌─────────────┐   ┌────────────────────┐   ┌────────────────────┐
│  SoulINFT   │   │  LatticeRegistry   │   │  LatticeAttestor   │
│             │◄──┤                    ├──►│                    │
│ extends     │   │  openCommunion     │   │  registerProvider  │
│ AgentNFT    │   │  submitAttestation │   │  verifyAndMark     │
│ (ERC-7857)  │   │  settleRoyalties   │   │  usedProofs        │
└─────────────┘   └────────┬───────────┘   └────────────────────┘
                           │
                           ▼
                  ┌────────────────────┐
                  │  RoyaltyFanout     │
                  │  pure helper       │
                  │  splitEqual        │
                  └────────────────────┘
```

### SoulINFT

Extends `AgentNFT` from `0glabs/0g-agent-nft@eip-7857-draft`. Adds:

- `royaltyWalletOf(uint256 soulId) → address` — settable by owner; defaults
  to the soul owner.
- `setRoyaltyWallet(uint256 soulId, address wallet)`
- A mint helper that records a domain tag (`"math"`, `"lit"`, etc.) for UI
  grouping.

Inherits the standard ERC-7857 surface: mint, transfer with re-encryption,
clone, `authorizeUsage`, and the `PublishedSealedKey` event the orchestrator
listens for.

### LatticeRegistry

```solidity
uint256 public constant MAX_SOULS_PER_COMMUNION = 16;

struct Communion {
    uint256[] soulIds;          // sorted ascending
    address[] royaltyWallets;   // snapshot at open time
    address payer;
    uint256 payment;
    bytes32 contextHash;
    bytes32 outputHash;
    bytes32 usageHash;
    address provider;
    string  chatID;
    uint64  openedAt;
    uint64  attestedAt;
    bool    settled;
}

function openCommunion(
    uint256[] calldata soulIds,
    bytes32 contextHash,
    bytes[] calldata participationReceipts
) external payable returns (uint256 communionId);

function submitAttestation(
    uint256 communionId,
    address provider,
    string  calldata chatID,
    bytes32 outputHash,
    bytes32 usageHash,
    bytes   calldata teeText,
    bytes   calldata teeSignature
) external;

function settleRoyalties(uint256 communionId) external;
```

`communionId = keccak256(payer, nonce, contextHash)` is deterministic, so
the orchestrator can pre-compute it and have soul owners sign over the
participation message before the open transaction lands. Receipts can't
be replayed across communions.

### LatticeAttestor

```solidity
mapping(address provider => address teeSigner) public providerSigner;
mapping(bytes32 proofId => bool used) public usedProofs;

function verifyAndMark(
    address provider,
    string calldata chatID,
    bytes calldata teeText,
    bytes calldata teeSignature
) external returns (address teeSigner);
```

`verifyAndMark` does five things: look up the registered signer for the
provider, ECDSA-recover the signature over `teeText`, byte-scan `teeText`
for the chatID, mark `(provider, chatID)` used, and emit the event. Total:
~3-5k gas for the ECDSA step plus ~5k for a short chatID scan.

The contains-check rather than a strict parse is deliberate. The 0G SDK
fetches `text` from `GET {provider}/v1/proxy/signature/{chatID}` verbatim,
and the format isn't contractually frozen by 0G. As long as `text` includes
the chatID we claim, the TEE has signed something specific to that chatID.
Combined with the orchestrator commitment in `submitAttestation`, this is
a sufficient binding for v1. If 0G publishes a strict schema later, the
check tightens.

### RoyaltyFanout

Pure library, no storage:

```solidity
library RoyaltyFanout {
    function splitEqual(uint256 payment, uint256 n)
        internal pure returns (uint256[] memory payouts, uint256 dust);
}
```

Equal N-way split, dust to `protocolFeeRecipient`. Weighted variant on the
v2 roadmap.

## Communion lifecycle

```
Step  Actor          Action                                                 On-chain
----  -----          ------                                                 --------
 1    Payer          Picks N souls + writes question                        no
 2    Orchestrator   Fetches each soul's ciphertext from 0G Storage         no
 3    Orchestrator   Decrypts with sealed keys, merges contexts             no
 4    Orchestrator   contextHash = keccak256(merged); communionId predicted no
 5    Orchestrator   Sends participation message to each soul owner         no
 6    Soul owners    Each signs EIP-191 receipt                             no
 7    Orchestrator   openCommunion(soulIds, contextHash, receipts)          YES
 8    Contract       Verify N receipts, snapshot royaltyWallets, escrow     YES
 9    Orchestrator   POST merged context + question to TeeML provider       no
10    TEE provider   Returns content + chatID                               no
11    Orchestrator   GET /v1/proxy/signature/{chatID} → {text, signature}   no
12    Orchestrator   submitAttestation(comId, provider, chatID, hashes,     YES
                     text, sig)
13    Contract       Verify ECDSA, scan text for chatID, mark used          YES
14    Anyone         settleRoyalties(communionId)                           YES
15    Contract       splitEqual(payment, N), transfer to each wallet        YES
```

For N=5, gas budgets work out to roughly:
- `openCommunion` with 5 receipts + escrow + snapshot ≈ 150-200k
- `submitAttestation` (ECDSA + chatID scan + 2 SSTORE + event) ≈ 35k
- `settleRoyalties` (5 native transfers via Solady, 5 events) ≈ 65k

So ~270k total per communion. At 5 gwei + $0.60 OG that's ~$0.0008.

## Orchestrator API

```
POST   /lattice/souls                  { ownerAddress, contextText, domain,
                                         royaltyWallet? }
                                       → { soulId, owner, contextRoot,
                                           domain, royaltyWallet, txHash }

GET    /lattice/souls                  → SoulRecord[]

POST   /lattice/communions/prepare     { payer, soulIds, paymentWei, question }
                                       → { communionId, contextHash, nonce,
                                           participationMessage, ... }

POST   /lattice/communions/:id/open    { participationReceipts: bytes[] }
                                       → CommunionRecord (status="attested")

POST   /lattice/communions/:id/settle  → { record, onchain }

GET    /lattice/communions/:id         → CommunionRecord

GET    /lattice/healthz                → { ok, chain, storage, compute, env }
```

Implementation lives in `orchestrator/src/lib/lattice-flow.ts`. Each route
is a thin wrapper around one flow function so the routes stay readable.

## Out of scope for v1

- **Per-soul weighted royalty splits.** v1 ships equal N-way only.
- **DCAP on-chain quote verification.** v1 is ECDSA only against a
  registered provider key.
- **Per-context TEE attestation** (the soul-binding gap from §3 of trust
  model). v1 binds via orchestrator commitment.
- **Sealed output to payer's pubkey.** v1 stores plaintext content + hash;
  v2 seals to payer.
- **Native DA blob deletion-proof.** Not yet exposed by 0G; the soul-burn
  flow re-roots the storage Merkle as a substitute.
