#!/usr/bin/env bash
# Scores every stored sender group of one mail account with memo's own scorer and prints totals only.
# Usage: score-store.sh <account address> [memo dist folder]; reads the store read-only.
set -euo pipefail
ACCOUNT=${1:?account address, as memo stores it}
DIST=${2:-$(npm root -g)/@wirecat/cli-memo/dist}
STORE=${MESSAGING_STORE:-$HOME/.local/share/WireCat/wirecat.db}
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
chmod 700 "$WORK"
sqlite3 -readonly -json "$STORE" "
  select e.external_id id, e.from_address f, e.from_name n, coalesce(e.received_at, e.sent_at) at, e.read r,
    e.size s, e.outgoing o, e.body_text is not null fulltext,
    json_extract(e.headers, '\$.\"reply-to\"') rt, json_extract(e.headers, '\$.dkim') dkim,
    json_extract(e.headers, '\$.dmarc') dmarc,
    coalesce(json_extract(e.metadata, '\$.listId'), json_extract(e.headers, '\$.\"list-id\"')) l,
    (select json_group_array(b.name) from email_mailboxes m join mailboxes b on b.id = m.mailbox_id
      where m.email_id = e.id and b.kind = 'label') labels,
    exists (select 1 from email_mailboxes m join mailboxes b on b.id = m.mailbox_id
      where m.email_id = e.id and b.kind = 'bulk') bulk,
    (select json_group_array(r.address) from email_recipients r where r.email_id = e.id and r.role in ('to', 'cc')) rcpt
  from emails e join accounts a on a.id = e.account_id
  where a.name = '$ACCOUNT' and e.deleted_at is null" >"$WORK/rows.json"
node "$(dirname "$0")/score-store.mjs" "$WORK/rows.json" "$DIST"
