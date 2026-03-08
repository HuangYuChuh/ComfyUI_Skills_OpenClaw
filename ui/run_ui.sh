#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"

cd "$SCRIPT_DIR"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Python interpreter not found: $PYTHON_BIN"
  exit 1
fi

if command -v lsof >/dev/null 2>&1; then
  echo "Ensuring port 8189 is free..."
  lsof -ti:8189 | xargs kill -9 2>/dev/null || true
fi

echo "Starting ComfyUI OpenClaw Skill UI on http://127.0.0.1:8189"
exec "$PYTHON_BIN" app.py
