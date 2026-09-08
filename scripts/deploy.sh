#!/usr/bin/env bash
# Deploy the curriculum to Cloudflare Pages. Runs the QA harness first; refuses to ship a broken file.
# usage: bash scripts/deploy.sh [project-name]            (default: system-curriculum)
#   CF_ENV_FILE=/path/to/cf-personal.env bash scripts/deploy.sh   -> use a personal token file
#   (no CF_ENV_FILE)                                                -> use the browser login (npx wrangler login)
# The env file holds CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, one per line. It is never printed.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -n "${CF_ENV_FILE:-}" ] && [ -f "$CF_ENV_FILE" ]; then
  # Load the personal credentials line by line (Windows line endings tolerated). Values are never echoed.
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in ''|'#'*) continue ;; esac
    export "$line"
  done < "$CF_ENV_FILE"
else
  # Never let a work API token left in the environment decide where this goes.
  unset CLOUDFLARE_API_TOKEN || true
fi

echo "Deploying as:"
npx wrangler whoami 2>/dev/null | grep -E "logged in|Account Name|│" || true

node qa/qa-harness.js
rm -rf dist && mkdir dist
cp curriculum.html dist/index.html

PROJECT="${1:-system-curriculum}"
npx wrangler pages project create "$PROJECT" --production-branch main 2>/dev/null || true
npx wrangler pages deploy dist --project-name "$PROJECT" --branch main --commit-dirty=true
