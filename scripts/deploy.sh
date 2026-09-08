#!/usr/bin/env bash
# Deploy the curriculum to Cloudflare Pages. Runs the QA harness first; refuses to ship a broken file.
# usage:
#   CF_ENV_FILE=/path/to/cf-personal.env bash scripts/deploy.sh [project-name]   (default project: system-curriculum)
# The env file holds two lines, CLOUDFLARE_API_TOKEN=... and CLOUDFLARE_ACCOUNT_ID=... . It is never printed.
# Without CF_ENV_FILE the script falls back to the browser login (npx wrangler login).
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

PROJECT="${1:-system-curriculum}"

node qa/qa-harness.js
rm -rf dist && mkdir dist
cp curriculum.html dist/index.html

# Create the project if it does not exist. Done through the API because "wrangler pages project create"
# ignores CLOUDFLARE_ACCOUNT_ID and may pick up a stale account from an old login file.
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  code="$(curl -s -o /dev/null -w '%{http_code}' "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")"
  if [ "$code" = "404" ]; then
    echo "Creating Pages project $PROJECT"
    curl -s -o /dev/null -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
      --data "{\"name\":\"$PROJECT\",\"production_branch\":\"main\"}"
  fi
else
  npx wrangler pages project create "$PROJECT" --production-branch main 2>/dev/null || true
fi

npx wrangler pages deploy dist --project-name "$PROJECT" --branch main --commit-dirty=true
echo "Live at: https://$PROJECT.pages.dev"
