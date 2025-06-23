#!/bin/sh

which deno >/dev/null 2>&1 || {
  echo "Deno is not installed. Please install Deno first."
  exit 1
}

echo "Installing PugPage ..."
deno compile --allow-read --allow-write --allow-net --allow-run --no-check \
    --include ./index.html --include ./render.js --output ./pugpage \
    https://raw.githubusercontent.com/wiwiwa/pugpage/main/src/main.js
