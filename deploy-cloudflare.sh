#!/usr/bin/env sh
# Deploy to Cloudflare Pages (https://diwali-gesture-crackers.pages.dev).
# Uploads ONLY the site files (never .cert/, test frames or tool folders). Needs `wrangler login` once.
set -e
cd "$(dirname "$0")"
rm -rf dist && mkdir dist
cp index.html 404.html app.js gestures.js _headers dist/
npx --yes wrangler@4 pages deploy dist --project-name diwali-gesture-crackers --branch main --commit-dirty=true
