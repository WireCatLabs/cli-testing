#!/usr/bin/env bash
# Times the override check of `relationships list` on a store copy, both ways, and prints the plan and totals only.
# Usage: plan.sh <copy of a store>  — never the live file; make the copy with
#   sqlite3 "file:<store>?mode=ro" "VACUUM INTO '<copy>'"
set -euo pipefail
db=${1:?a store copy}
kinds="'member-of', 'related-to', 'reports-to', 'customer-of', 'partner-of'"
keyed="kind IN ($kinds) AND to_id IS NOT NULL"
query() {
  cat <<SQL
SELECT count(*) FROM (SELECT id FROM links WHERE kind IN ($kinds) AND to_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM links override WHERE $1 override.kind = links.kind AND override.from_type = links.from_type
  AND override.from_id = links.from_id AND override.to_type = links.to_type AND override.to_id = links.to_id
  AND json_extract(override.metadata, '\$.overrides') = links.id) ORDER BY created_at, id LIMIT 101);
SQL
}
sqlite3 -readonly "$db" "SELECT 'links', count(*) FROM links;
  SELECT 'busiest target', max(c) FROM (SELECT count(*) c FROM links WHERE kind = 'related-to' GROUP BY to_type, to_id);"
for label in before after; do
  where=""; [ "$label" = after ] && where="$keyed AND"
  echo "== $label"
  sqlite3 -readonly "$db" "EXPLAIN QUERY PLAN $(query "$where")" | grep override
  start=$(date +%s%N)
  timeout 900 sqlite3 -readonly "$db" "$(query "$where")" >/dev/null || echo "stopped after 900 s"
  echo "$(( ($(date +%s%N) - start) / 1000000 )) ms"
done
