#!/usr/bin/env bash
set -euo pipefail

REPO="HuangYuChuh/ComfyUI_Skills_OpenClaw-frontend"
TAG="${1:-latest}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATIC_DIR="$ROOT_DIR/ui/static"

echo "Fetching release '$TAG' from $REPO ..."

DOWNLOAD_URL=$(gh release view "$TAG" --repo "$REPO" --json assets \
  --jq '.assets[] | select(.name == "frontend-dist.tar.gz") | .url')

if [[ -z "$DOWNLOAD_URL" ]]; then
  echo "Error: frontend-dist.tar.gz not found in release '$TAG'." >&2
  exit 1
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
EXTRACT_DIR="$TMP_DIR/static"
SWAP_DIR="$ROOT_DIR/ui/.static.next"
BACKUP_DIR="$ROOT_DIR/ui/.static.bak"

echo "Downloading frontend-dist.tar.gz ..."
gh release download "$TAG" --repo "$REPO" --pattern "frontend-dist.tar.gz" --dir "$TMP_DIR"

mkdir -p "$EXTRACT_DIR"
tar -xzf "$TMP_DIR/frontend-dist.tar.gz" -C "$EXTRACT_DIR"

if [[ ! -f "$EXTRACT_DIR/index.html" ]]; then
  echo "Error: downloaded frontend bundle is missing index.html." >&2
  exit 1
fi

echo "Replacing $STATIC_DIR ..."
rm -rf "$SWAP_DIR" "$BACKUP_DIR"
cp -R "$EXTRACT_DIR" "$SWAP_DIR"
if [[ -d "$STATIC_DIR" ]]; then
  mv "$STATIC_DIR" "$BACKUP_DIR"
fi
mv "$SWAP_DIR" "$STATIC_DIR"
rm -rf "$BACKUP_DIR"

if [[ -f "$STATIC_DIR/version.json" ]]; then
  echo "Version: $(cat "$STATIC_DIR/version.json")"
fi

echo "Done. Frontend assets updated in ui/static/"
