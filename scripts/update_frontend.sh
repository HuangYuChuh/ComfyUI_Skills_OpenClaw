#!/usr/bin/env bash
set -euo pipefail

REPO="HuangYuChuh/ComfyUI_Skills_OpenClaw-frontend"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATIC_DIR="$ROOT_DIR/ui/static"

echo "Fetching latest release from $REPO ..."

DOWNLOAD_URL=$(gh release view --repo "$REPO" --json assets \
  --jq '.assets[] | select(.name == "frontend-dist.tar.gz") | .url')

if [[ -z "$DOWNLOAD_URL" ]]; then
  echo "Error: frontend-dist.tar.gz not found in the latest release." >&2
  exit 1
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Downloading frontend-dist.tar.gz ..."
gh release download --repo "$REPO" --pattern "frontend-dist.tar.gz" --dir "$TMP_DIR"

echo "Extracting to $STATIC_DIR ..."
rm -rf "$STATIC_DIR"
mkdir -p "$STATIC_DIR"
tar -xzf "$TMP_DIR/frontend-dist.tar.gz" -C "$STATIC_DIR"

echo "Done. Frontend assets updated in ui/static/"
