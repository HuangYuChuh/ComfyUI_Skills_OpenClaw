#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Reset auto-generated frontend files to avoid merge conflicts
git checkout -- ui/static/ 2>/dev/null || true

git pull

# Install / update Python dependencies
if [[ -f ".venv/bin/pip" ]]; then
  .venv/bin/pip install -q -r requirements.txt
elif command -v pip3 &>/dev/null; then
  pip3 install -q -r requirements.txt
fi

echo "Updated successfully."
