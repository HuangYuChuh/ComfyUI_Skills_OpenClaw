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

echo "Downloading frontend-dist.tar.gz ..."
gh release download "$TAG" --repo "$REPO" --pattern "frontend-dist.tar.gz" --dir "$TMP_DIR"

echo "Extracting to $STATIC_DIR ..."
rm -rf "$STATIC_DIR"
mkdir -p "$STATIC_DIR"
tar -xzf "$TMP_DIR/frontend-dist.tar.gz" -C "$STATIC_DIR"

if [[ -f "$STATIC_DIR/version.json" ]]; then
  echo "Version: $(cat "$STATIC_DIR/version.json")"
fi

echo "Done. Frontend assets updated in ui/static/"
