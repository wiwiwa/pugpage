#!/bin/sh

MAIN=${MAIN:-https://raw.githubusercontent.com/wiwiwa/pugpage/master/src/main.ts}
DIR=${MAIN%/*}

which deno >/dev/null 2>&1 || {
  echo "Deno is not installed. Please install Deno first."
  exit 1
}

echo "Installing PugPage ..."
deno compile \
    --allow-read --allow-write --allow-net  --allow-env --allow-sys \
    --include $DIR/render/render.js \
    --no-check --output ./pugpage $MAIN
