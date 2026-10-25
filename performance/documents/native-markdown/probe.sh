#!/usr/bin/env sh
# Probes a Google Drive Markdown file through the APIs: type, Docs API read and write, comments, whole-file replace.
# Usage: probe.sh <drive-cli checkout, built> <profile> <test folder id>. Writes one file into that folder.
set -eu
repo=$1 profile=$2 folder=$3
here=$(cd "$(dirname "$0")" && pwd)
drive() { node "$repo/dist/bin/drive.js" "$profile" "$@"; }
id=$(drive files upload "$here/sample.md" --parent "$folder" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).item.id))')
echo "== type";      drive api drive-files-get --file-id "$id" --fields mimeType,capabilities/canComment,capabilities/canEdit
echo "== docs read"; drive api docs-documents-get --document-id "$id" > /dev/null && echo "read ok"
echo "== docs write"
drive api docs-documents-batch-update --document-id "$id" \
  --body '{"requests":[{"insertText":{"location":{"index":1},"text":"x"}}]}' || true
echo "== comment";   drive api drive-comments-create --file-id "$id" --fields id --body '{"content":"probe"}'
echo "== replace"
sed 's/^# Sample plan$/# Sample plan (replaced)/' "$here/sample.md" > "${TMPDIR:-/tmp}/probe-replaced.md"
node "$here/replace.mjs" "$repo" "$profile" "$id" "${TMPDIR:-/tmp}/probe-replaced.md"
drive api drive-comments-list --file-id "$id" --fields 'comments(id,deleted)'
echo "file id: $id"
