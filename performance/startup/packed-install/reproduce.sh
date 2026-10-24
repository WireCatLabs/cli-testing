#!/bin/sh
set -eu
: "${1:?Pass a new artifact directory as the first argument}"
pnpm build
npm run ux:plan -- "$1/tarballs"
node dist/main.js ux install "$1/run" "$1/tarballs/plan.json"
