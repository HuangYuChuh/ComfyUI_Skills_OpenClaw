#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -x /opt/homebrew/opt/ruby/bin/ruby ]]; then
  export PATH="/opt/homebrew/opt/ruby/bin:$PATH"
fi

cd "$ROOT_DIR"

bundle config set --local path "vendor/bundle"
bundle install
bundle exec jekyll serve \
  --source docs \
  --destination docs/_site \
  --host 127.0.0.1 \
  --port 4000 \
  --livereload
