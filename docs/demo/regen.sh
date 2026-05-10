#!/usr/bin/env bash
# Regenerate the demo video from a fresh, live on-chain run.
# Mints 3 new souls + opens + settles 1 new communion.
# Each run consumes ~0.05 OG of testnet gas.
set -e

cd "$(git rev-parse --show-toplevel)"

# Record terminal session with idle gaps capped at 1.5s for tight playback.
rm -f docs/demo.cast docs/demo.gif docs/demo.mp4
asciinema rec \
  --command "bash docs/demo/demo.sh" \
  --idle-time-limit 1.5 \
  --window-size "120x36" \
  --headless \
  --title "The Lattice — live demo on 0G Galileo" \
  docs/demo.cast

# Render to GIF (animated, embed-friendly).
agg --theme monokai --font-size 14 --fps-cap 30 docs/demo.cast docs/demo.gif

# Encode MP4 from GIF (better compression, plays inline on social platforms).
ffmpeg -y -i docs/demo.gif \
  -movflags +faststart -pix_fmt yuv420p \
  -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30" \
  -c:v libx264 -crf 22 \
  docs/demo.mp4

ls -lh docs/demo.{cast,gif,mp4}
