#!/usr/bin/env bash
# Checks memo's sender score against Gmail's Spam folder and the senders the owner wrote to. Prints totals only —
# never a sender, a subject or a domain. Reads the mailbox; writes nothing to the real config, state or store.
set -euo pipefail

account=${1:?usage: calibrate.sh <memo mail account> [threshold] [since, e.g. 2025-01-01]}
threshold=${2:-3}
since=${3:-}

config=${MEMO_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/cli-memo}/config.json
state=${MEMO_STATE_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/cli-memo}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/config" "$work/state"

# The same account, reading only Gmail's Spam; no rules, so nothing is decided for it.
jq --arg a "$account" \
  '{mail: {accounts: [.mail.accounts[] | select(.name == $a or .address == $a)
    | del(.rules) + {folders: ["[Gmail]/Spam"]}]}}' "$config" >"$work/config/config.json"
[ "$(jq '.mail.accounts | length' "$work/config/config.json")" = 1 ] || { echo "no account $account in $config" >&2; exit 2; }
# Domain ages already looked up are reused; the copy is thrown away, so the real cache never learns spam domains.
[ -f "$state/domain-ages.json" ] && cp "$state/domain-ages.json" "$work/state/"

window=()
[ -n "$since" ] && window=(--since-time "$since")
age=()
[ -n "${DOMAIN_AGE:-}" ] && age=(--domain-age)

MEMO_CONFIG_DIR="$work/config" MEMO_STATE_DIR="$work/state" MESSAGING_STORE="$work/store" \
  memo mail probe "$account" --json --limit-groups 1000000 "${window[@]}" "${age[@]}" >"$work/spam.json"
memo mail probe "$account" --json --limit-groups 1000000 "${window[@]}" >"$work/all.json"

# Without the two signals that know the answer: being in Spam, and the owner's own replies.
raw='(.score - (if (.signals | index("spam_folder")) then 4 else 0 end)
        - (if (.signals | index("replied")) then -5 else 0 end))'

jq -n --argjson t "$threshold" --slurpfile spam "$work/spam.json" --slurpfile all "$work/all.json" "
  def raw: $raw;
  ((\$spam[0].item // \$spam[0]).items) as \$s | ((\$all[0].item // \$all[0]).items) as \$a |
  (\$a | map(select(.replied))) as \$replied |
  (\$a | map(select(.replied | not))) as \$others |
  {
    threshold: \$t,
    spam: {
      emails: (\$s | map(.emails) | add // 0),
      groups: (\$s | length),
      caught_emails: (\$s | map(select(raw >= \$t) | .emails) | add // 0),
      signals: (\$s | map(.signals[]) | group_by(.) | map({(.[0]): length}) | add // {})
    },
    replied_senders: {
      groups: (\$replied | length),
      false_alarms: (\$replied | map(select(raw >= \$t)) | length),
      signals: (\$replied | map(.signals[] | select(. != \"replied\")) | group_by(.) | map({(.[0]): length}) | add // {})
    },
    other_groups_at_or_above: (\$others | map(select(.score >= \$t)) | length),
    other_groups: (\$others | length)
  }
  | .spam.recall = (if .spam.emails > 0 then (.spam.caught_emails / .spam.emails * 1000 | round / 1000) else null end)
  | .replied_senders.false_alarm_rate =
      (if .replied_senders.groups > 0 then (.replied_senders.false_alarms / .replied_senders.groups * 1000 | round / 1000) else null end)"
