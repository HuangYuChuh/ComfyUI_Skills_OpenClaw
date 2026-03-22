#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VENV_DIR="$PROJECT_ROOT/.venv"
VENV_PYTHON="$VENV_DIR/bin/python"
REQUIREMENTS_FILE="$PROJECT_ROOT/requirements.txt"

UI_PORT="${OPENCLAW_UI_PORT:-18189}"

python_is_supported() {
  "$1" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'
}

python_has_ui_deps() {
  "$1" -c 'import fastapi, uvicorn, pydantic, requests' >/dev/null 2>&1
}

discover_python_candidates() {
  printf '%s\n' "python3"

  local dir=""
  local path=""
  local base=""
  local old_ifs="$IFS"
  IFS=":"
  for dir in $PATH; do
    for path in "$dir"/python3*; do
      [ -x "$path" ] || continue
      base="$(basename "$path")"
      case "$base" in
        python3|python3.[0-9]|python3.[0-9][0-9])
          printf '%s\n' "$path"
          ;;
      esac
    done
  done
  IFS="$old_ifs"
}

resolve_python_bin() {
  if [ -n "${PYTHON_BIN:-}" ]; then
    if [ -x "$PYTHON_BIN" ] || command -v "$PYTHON_BIN" >/dev/null 2>&1; then
      if ! python_is_supported "$PYTHON_BIN"; then
        echo "PYTHON_BIN must point to Python 3.10 or newer: $PYTHON_BIN" >&2
        exit 1
      fi
      printf '%s\n' "$PYTHON_BIN"
      return 0
    fi
    echo "Python interpreter not found: $PYTHON_BIN" >&2
    exit 1
  fi

  local best_candidate=""
  local best_major=0
  local best_minor=0
  local candidate=""
  local resolved=""
  local version=""
  local major=0
  local minor=0
  while IFS= read -r candidate; do
    [ -n "$candidate" ] || continue
    resolved="$(command -v "$candidate" 2>/dev/null || true)"
    if [ -z "$resolved" ] && [ -x "$candidate" ]; then
      resolved="$candidate"
    fi
    [ -n "$resolved" ] || continue

    version="$("$resolved" -c 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")' 2>/dev/null || true)"
    case "$version" in
      [0-9]*.[0-9]*) ;;
      *) continue ;;
    esac

    major="${version%%.*}"
    minor="${version##*.}"
    if [ "$major" -lt 3 ] || { [ "$major" -eq 3 ] && [ "$minor" -lt 10 ]; }; then
      continue
    fi

    if [ -z "$best_candidate" ] || [ "$major" -gt "$best_major" ] || { [ "$major" -eq "$best_major" ] && [ "$minor" -gt "$best_minor" ]; }; then
      best_candidate="$resolved"
      best_major="$major"
      best_minor="$minor"
    fi
  done < <(discover_python_candidates | awk '!seen[$0]++')

  if [ -n "$best_candidate" ]; then
    printf '%s\n' "$best_candidate"
    return 0
  fi

  echo "Python 3.10 or newer is required. Install python3.10+ or set PYTHON_BIN." >&2
  exit 1
}

ensure_project_venv() {
  local bootstrap_python="$1"

  if [ -x "$VENV_PYTHON" ] && python_is_supported "$VENV_PYTHON"; then
    return 0
  fi

  if [ -e "$VENV_DIR" ]; then
    echo "Rebuilding .venv with a supported Python interpreter..."
    rm -rf "$VENV_DIR"
  else
    echo "Creating project .venv..."
  fi

  "$bootstrap_python" -m venv "$VENV_DIR"
}

ensure_project_dependencies() {
  if python_has_ui_deps "$VENV_PYTHON"; then
    return 0
  fi

  echo "Installing UI dependencies into .venv..."
  "$VENV_PYTHON" -m pip install -U pip
  "$VENV_PYTHON" -m pip install -r "$REQUIREMENTS_FILE"
}

BOOTSTRAP_PYTHON="$(resolve_python_bin)"
ensure_project_venv "$BOOTSTRAP_PYTHON"
ensure_project_dependencies

if ! python_is_supported "$VENV_PYTHON"; then
  echo "The project virtual environment must use Python 3.10 or newer." >&2
  exit 1
fi

if command -v lsof >/dev/null 2>&1; then
  echo "Ensuring port $UI_PORT is free..."
  lsof -ti:"$UI_PORT" | xargs kill -9 2>/dev/null || true
fi

echo "Starting ComfyUI OpenClaw Skill UI on http://127.0.0.1:$UI_PORT"
cd "$PROJECT_ROOT"
exec "$VENV_PYTHON" -m ui.app
