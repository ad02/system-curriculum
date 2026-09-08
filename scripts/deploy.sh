#!/usr/bin/env bash
# Deploy the curriculum to Cloudflare Pages. Runs the QA harness first; refuses to ship a broken file.
# usage: bash scripts/deploy.sh [project-name]   (default: system-curriculum)
set -euo pipefail
cd "$(dirname "$0")/.."
node qa/qa-harness.js
rm -rf dist && mkdir dist
cp curriculum.html dist/index.html
npx wrangler pages deploy dist --project-name "${1:-system-curriculum}"
