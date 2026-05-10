# Demo bundle

Every transaction in `demo.mp4` is a real call against the live deploy on
0G Galileo testnet (chain 16602). No fake state, no stubs at the chain layer.

| File | What |
|---|---|
| [`../demo.mp4`](../demo.mp4) | The video. 25 seconds. |
| [`../demo.gif`](../demo.gif) | Same content, GIF for embedding. |
| [`../demo.cast`](../demo.cast) | asciinema source. Re-render with a different theme via `agg --theme dracula docs/demo.cast out.gif`. |

Pipeline: `asciinema rec --command "bash demo.sh"` → `agg` → `ffmpeg`. To
regenerate from a fresh run (mints 3 new souls + opens 1 new communion):

```bash
bash docs/demo/regen.sh
```

UI screenshots from Playwright against https://lattice-guzus.vercel.app:

- `ui-home.png` — `/`
- `ui-souls.png` — `/souls`
- `ui-mint.png` — `/souls/mint`
- `ui-communion-new.png` — `/communion/new`

## Caveats specific to this run

- The orchestrator's TEE inference falls back to a templated string until
  the 0G Compute broker is funded with testnet OG. The chain attestation
  step still runs against the real `LatticeAttestor` contract.
- All souls in the demo are owned by the deployer wallet
  (`0xF5B0…a8E`), so the three royalty payouts land in one place. The
  `RoyaltyFanout` library handles N distinct wallets identically; this is
  just a demo-data shortcut.
- Re-encryption on transfer (the ERC-7857 special move) is implemented in
  `SoulINFT` but not exercised in this happy-path video.
