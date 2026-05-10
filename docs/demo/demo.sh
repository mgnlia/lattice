#!/usr/bin/env bash
# Live, end-to-end smoke demo of The Lattice on 0G Galileo (chain 16602).
# Every tx in this script is a REAL on-chain transaction. Run from repo root:
#   bash docs/demo/demo.sh
set -e

ORCH="${LATTICE_ORCH_URL:-https://lattice-orchestrator-production.up.railway.app}"
DEPLOYER="${DEPLOYER_ADDRESS:-0xF5B0173917c322996157Ad1e6f482B33B9a72a8E}"
EXPLORER="${ZEROG_EXPLORER:-https://chainscan-galileo.0g.ai}"

# DEPLOYER_PRIVATE_KEY must be exported in your shell or .env. Never commit.
if [ -z "${DEPLOYER_PRIVATE_KEY:-}" ]; then
  if [ -f .env ]; then
    set -a; source .env; set +a
  fi
fi
if [ -z "${DEPLOYER_PRIVATE_KEY:-}" ]; then
  echo "ERROR: DEPLOYER_PRIVATE_KEY not set. Export it or put it in .env." >&2
  exit 1
fi
DEPLOYER_PK="$DEPLOYER_PRIVATE_KEY"

# Colors
A='\033[1;33m'   # amber
G='\033[1;32m'   # green
C='\033[1;36m'   # cyan
W='\033[0;37m'   # gray
M='\033[0;35m'   # magenta
R='\033[0m'

banner() {
  printf "\n${A}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${R}\n"
  printf "${A}  %s${R}\n" "$1"
  printf "${A}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${R}\n\n"
}

step() {
  printf "${C}▶ %s${R}\n" "$1"
}

# ────────────────────────────────────────────────────────────────────
banner "0/6  THE LATTICE — live demo on 0G Galileo testnet"
printf "${W}Orchestrator: ${R}%s\n" "$ORCH"
printf "${W}Chain:        ${R}0G Galileo (16602)\n"
printf "${W}Explorer:     ${R}%s\n" "$EXPLORER"
sleep 2

# ────────────────────────────────────────────────────────────────────
banner "1/6  Healthcheck"
step "GET /lattice/healthz"
curl -s "$ORCH/lattice/healthz" | jq
sleep 2

# ────────────────────────────────────────────────────────────────────
banner "2/6  Mint 3 Souls (math · lit · physics)"

step "Soul A — math"
SOUL_A=$(curl -s -X POST "$ORCH/lattice/souls" \
  -H "Content-Type: application/json" \
  -d "{\"ownerAddress\":\"$DEPLOYER\",\"contextText\":\"I am a math olympiad coach with 12yr experience teaching combinatorics and number theory.\",\"domain\":\"math\"}")
SOUL_A_ID=$(echo "$SOUL_A" | jq -r .soulId)
SOUL_A_TX=$(echo "$SOUL_A" | jq -r .txHash)
echo "$SOUL_A" | jq
printf "${G}  ✓ minted Soul #%s   tx=%s${R}\n" "$SOUL_A_ID" "$SOUL_A_TX"
sleep 1

step "Soul B — lit"
SOUL_B=$(curl -s -X POST "$ORCH/lattice/souls" \
  -H "Content-Type: application/json" \
  -d "{\"ownerAddress\":\"$DEPLOYER\",\"contextText\":\"I am a literature scholar focused on Hansi (classical Korean poetry) and modern poetic forms.\",\"domain\":\"lit\"}")
SOUL_B_ID=$(echo "$SOUL_B" | jq -r .soulId)
SOUL_B_TX=$(echo "$SOUL_B" | jq -r .txHash)
printf "${G}  ✓ minted Soul #%s   tx=%s${R}\n" "$SOUL_B_ID" "$SOUL_B_TX"
sleep 1

step "Soul C — physics"
SOUL_C=$(curl -s -X POST "$ORCH/lattice/souls" \
  -H "Content-Type: application/json" \
  -d "{\"ownerAddress\":\"$DEPLOYER\",\"contextText\":\"I am a quantum physicist with deep expertise in entanglement and decoherence.\",\"domain\":\"physics\"}")
SOUL_C_ID=$(echo "$SOUL_C" | jq -r .soulId)
SOUL_C_TX=$(echo "$SOUL_C" | jq -r .txHash)
printf "${G}  ✓ minted Soul #%s   tx=%s${R}\n" "$SOUL_C_ID" "$SOUL_C_TX"
sleep 2

# ────────────────────────────────────────────────────────────────────
banner "3/6  Prepare a 3-way Communion"
step "POST /lattice/communions/prepare"
PREP=$(curl -s -X POST "$ORCH/lattice/communions/prepare" \
  -H "Content-Type: application/json" \
  -d "{\"payer\":\"$DEPLOYER\",\"soulIds\":[\"$SOUL_A_ID\",\"$SOUL_B_ID\",\"$SOUL_C_ID\"],\"paymentWei\":\"30000000000000000\",\"question\":\"Explain quantum entanglement using Korean classical metaphors and one combinatorial argument.\"}")
COMMUNION_ID=$(echo "$PREP" | jq -r .communionId)
PART_MSG=$(echo "$PREP" | jq -r .participationMessage)
echo "$PREP" | jq '{communionId, contextHash, nonce, participationMessage}'
printf "${G}  ✓ communionId pre-computed (deterministic = keccak(payer, nonce, ctxHash))${R}\n"
sleep 2

# ────────────────────────────────────────────────────────────────────
banner "4/6  Sign 3 EIP-191 participation receipts (offchain)"
step "ECDSA sign(participationMessage) × 3 with each soul-owner key"

cat > orchestrator/lattice-sign.mjs <<EOF
import { Wallet, getBytes } from 'ethers';
const wallet = new Wallet('$DEPLOYER_PK');
const msg = getBytes('$PART_MSG');
const sigs = await Promise.all([0,1,2].map(() => wallet.signMessage(msg)));
console.log(JSON.stringify(sigs));
EOF
SIGS=$(cd orchestrator && node lattice-sign.mjs)
rm -f orchestrator/lattice-sign.mjs
echo "$SIGS" | jq
printf "${G}  ✓ 3 EIP-191 sigs collected${R}\n"
sleep 2

# ────────────────────────────────────────────────────────────────────
banner "5/6  Open + run TEE inference + post attestation"
step "POST /lattice/communions/$COMMUNION_ID/open"
OPEN=$(curl -s -X POST "$ORCH/lattice/communions/$COMMUNION_ID/open" \
  -H "Content-Type: application/json" \
  -d "{\"participationReceipts\":$SIGS}")
OPEN_TX=$(echo "$OPEN" | jq -r .openTxHash)
ATTEST_TX=$(echo "$OPEN" | jq -r .attestationTxHash)
STATUS=$(echo "$OPEN" | jq -r .status)
echo "$OPEN" | jq '{status, openTxHash, attestationTxHash, output, outputHash, chatID}'
printf "${G}  ✓ status=%s${R}\n" "$STATUS"
printf "${G}  ✓ openCommunion landed   %s/tx/%s${R}\n" "$EXPLORER" "$OPEN_TX"
printf "${G}  ✓ attestation landed     %s/tx/%s${R}\n" "$EXPLORER" "$ATTEST_TX"
sleep 3

# ────────────────────────────────────────────────────────────────────
banner "6/6  Settle — atomic 3-way royalty fan-out"
step "POST /lattice/communions/$COMMUNION_ID/settle"
SETTLE=$(curl -s -X POST "$ORCH/lattice/communions/$COMMUNION_ID/settle")
SETTLE_TX=$(echo "$SETTLE" | jq -r .record.settleTxHash)
echo "$SETTLE" | jq '{record: {status: .record.status, settleTxHash: .record.settleTxHash, paymentWei: .record.paymentWei}, onchain: .onchain}'
printf "${G}  ✓ settled — payment fanned 3 ways atomically${R}\n"
printf "${G}  ✓ %s/tx/%s${R}\n" "$EXPLORER" "$SETTLE_TX"
sleep 2

# ────────────────────────────────────────────────────────────────────
banner "DEMO COMPLETE — all on-chain, all verifiable"
printf "${M}Souls:${R}\n"
printf "  Soul #%s (math)    %s/tx/%s\n" "$SOUL_A_ID" "$EXPLORER" "$SOUL_A_TX"
printf "  Soul #%s (lit)     %s/tx/%s\n" "$SOUL_B_ID" "$EXPLORER" "$SOUL_B_TX"
printf "  Soul #%s (physics) %s/tx/%s\n" "$SOUL_C_ID" "$EXPLORER" "$SOUL_C_TX"
printf "${M}Communion:${R}\n"
printf "  open    %s/tx/%s\n" "$EXPLORER" "$OPEN_TX"
printf "  attest  %s/tx/%s\n" "$EXPLORER" "$ATTEST_TX"
printf "  settle  %s/tx/%s\n" "$EXPLORER" "$SETTLE_TX"
printf "\n${A}  → https://lattice-guzus.vercel.app${R}\n\n"
