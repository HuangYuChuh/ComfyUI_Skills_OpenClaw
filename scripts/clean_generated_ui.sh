#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_REF="${1:-origin/main}"
MODE="${2:-apply}"
STATIC_DIR="$ROOT_DIR/ui/static"

if [[ ! -d "$STATIC_DIR" ]]; then
  echo "Error: ui/static not found under $ROOT_DIR" >&2
  exit 1
fi

if ! git -C "$ROOT_DIR" rev-parse --verify "$TARGET_REF" >/dev/null 2>&1; then
  echo "Error: git ref '$TARGET_REF' does not exist." >&2
  echo "Hint: run 'git fetch origin' first, or pass a valid ref like 'origin/main'." >&2
  exit 1
fi

echo "Target ref: $TARGET_REF"
echo "Static dir:  $STATIC_DIR"

TRACKED_PATHS=(
  "ui/static/index.html"
  "ui/static/version.json"
  "ui/static/assets"
)

if [[ "$MODE" == "--check" || "$MODE" == "check" ]]; then
  echo
  echo "Tracked generated files that differ from $TARGET_REF:"
  git -C "$ROOT_DIR" diff --name-status "$TARGET_REF" -- "${TRACKED_PATHS[@]}" || true

  echo
  echo "Untracked files under ui/static/assets that would be removed:"
  git -C "$ROOT_DIR" clean -fdn -- ui/static/assets
  exit 0
fi

if [[ "$MODE" != "apply" ]]; then
  echo "Usage: scripts/clean_generated_ui.sh [git-ref] [--check]" >&2
  echo "Examples:" >&2
  echo "  scripts/clean_generated_ui.sh" >&2
  echo "  scripts/clean_generated_ui.sh origin/main --check" >&2
  exit 1
fi

echo
echo "Restoring tracked generated files from $TARGET_REF ..."
git -C "$ROOT_DIR" restore --source="$TARGET_REF" -- "${TRACKED_PATHS[@]}"

echo
echo "Removing untracked generated assets ..."
git -C "$ROOT_DIR" clean -fd -- ui/static/assets

echo
echo "Remaining ui/static diff vs $TARGET_REF:"
git -C "$ROOT_DIR" diff --name-status "$TARGET_REF" -- "${TRACKED_PATHS[@]}" || true

echo
echo "Done."
