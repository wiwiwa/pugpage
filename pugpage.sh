#!/bin/sh
VERSION="1.4.0"
BASE="https://cdn.jsdelivr.net/gh/wiwiwa/pugpage@${VERSION}"

set -e
which deno >/dev/null 2>&1 || {
  echo "Error: Deno is not installed. Install from https://docs.deno.com/runtime/getting_started/installation/"
  exit 1
}

if [ $# -eq 0 ] && ! [ -t 0 ]; then
  set -- install
fi

PUGPAGE_SELF="$0" exec deno run \
  --import-map "${BASE}/deno.json" \
  --allow-read --allow-write --allow-net --allow-env --allow-sys \
  "${BASE}/src/main.ts" \
  "$@"
