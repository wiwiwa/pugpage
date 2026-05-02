#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Building release/render.min.js ..."
deno bundle --minify -o ./release/render.min.js ./src/render/render.js
git add release/render.min.js
git commit --amend --no-edit
echo "OK"

CURRENT=$(git describe --tags --abbrev=0 2>/dev/null || echo "0.0.0")
echo "Current tag: $CURRENT"

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
PATCH=$((PATCH + 1))
DEFAULT="$MAJOR.$MINOR.$PATCH"

echo -n "New tag [$DEFAULT]: "
read -r NEW_TAG
NEW_TAG="${NEW_TAG:-$DEFAULT}"

if git tag -l "$NEW_TAG" | grep -q .; then
  echo "Error: tag $NEW_TAG already exists"
  exit 1
fi

git tag "$NEW_TAG"

echo -n "Push tag $NEW_TAG to origin? [y/N]: "
read -r CONFIRM
if [ "$CONFIRM" = "y" ] || [ "$CONFIRM" = "Y" ]; then
  git push origin "$NEW_TAG"
  echo "Pushed $NEW_TAG"
else
  echo "Skipped push. To push later: git push origin $NEW_TAG"
fi
