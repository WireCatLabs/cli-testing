#!/usr/bin/env bash
# Asks one contestant the questions through Claude Code, with the same model, prompt and limits for all.
# Usage: ask.sh <w|w2|w3|w4|ws|ws2|wf|wfh|wf2|m|e> <questions-file> <run-dir> [export-dir for e]
# WF_STATE moves the wf/wfh store out of <run-dir>/wf, which is also where wf writes its answers.
set -euo pipefail
who=$1; questions=$(realpath "$2"); run=$(realpath -m "$3")
model=${ASK_MODEL:-claude-sonnet-5-5}
work="$run/$who/agent"; mkdir -p "$work"
rules="Answer each question about the user's own Telegram. Use only the tools you are given. For every answer give the
chat and the date of the message it comes from. If you cannot find it, say 'not found'; never guess. Number the
answers like the questions."
case "$who" in
  w)
    export WIRECAT_STATE_DIR="$run/w/state" TG_READ_ONLY=1
    access="Telegram is available through the tg command line tool, profile 'personal' (start with: tg personal --help)."
    tools=("Bash(tg:*)" "Bash(memo:*)")
    extra=() ;;
  ws)
    # The owner's own, long-kept store: WIRECAT_STATE_DIR is left unset on purpose.
    export TG_READ_ONLY=1
    access="Telegram is available through the tg command line tool, profile 'personal' (start with: tg personal --help)."
    tools=("Bash(tg:*)" "Bash(memo:*)")
    extra=() ;;
  wf)
    export WIRECAT_STATE_DIR="${WF_STATE:-$run/wf/state}" TG_READ_ONLY=1
    access="Telegram is available through the tg command line tool, profile 'personal' (start with: tg personal --help)."
    tools=("Bash(tg:*)" "Bash(memo:*)")
    extra=() ;;
  wfh)
    # wf plus the change proposed in tg-cli #884, given as a prompt line until the skill carries it.
    export WIRECAT_STATE_DIR="${WF_STATE:-$run/wf/state}" TG_READ_ONLY=1
    access="Telegram is available through the tg command line tool, profile 'personal' (start with: tg personal --help).
For a question in loose wording, with no chat named or a name that may be misspelled, search by meaning first
(tg personal search conversations '<question>'), then tg personal search messages '<question>' --discover, and only
then by keywords."
    tools=("Bash(tg:*)" "Bash(memo:*)")
    extra=() ;;
  w3)
    export WIRECAT_STATE_DIR="$run/w/state"
    access="Telegram is available through the tg command line tool, profile 'personal' (start with: tg personal --help)."
    # No TG_READ_ONLY: it also blocks server search (tg-cli #874). Safety comes from allowing read commands only.
    tools=(
      "Bash(tg --help)" "Bash(tg commands:*)" "Bash(tg guide:*)" "Bash(tg personal --help)" "Bash(tg personal commands:*)"
      "Bash(tg personal search:*)" "Bash(tg personal messages list:*)" "Bash(tg personal messages context:*)"
      "Bash(tg personal messages show:*)" "Bash(tg personal messages link:*)" "Bash(tg personal messages sync:*)"
      "Bash(tg personal chats list:*)" "Bash(tg personal chats show:*)" "Bash(tg personal contacts context:*)"
      "Bash(tg personal store status:*)" "Bash(memo --help)" "Bash(memo commands:*)" "Bash(memo search:*)"
      "Bash(memo context:*)"
    )
    extra=() ;;
  w4)
    export WIRECAT_STATE_DIR="$run/w/state"
    access="Telegram is available through the tg command line tool, profile 'personal' (start with: tg personal --help).
The local archive may not reach back far; when it finds nothing, search Telegram's server too (--backend server or both)."
    # No TG_READ_ONLY: it also blocks server search (tg-cli #874). Safety comes from allowing read commands only.
    tools=(
      "Bash(tg --help)" "Bash(tg commands:*)" "Bash(tg guide:*)" "Bash(tg personal --help)" "Bash(tg personal commands:*)"
      "Bash(tg personal search:*)" "Bash(tg personal messages list:*)" "Bash(tg personal messages context:*)"
      "Bash(tg personal messages show:*)" "Bash(tg personal messages link:*)" "Bash(tg personal messages sync:*)"
      "Bash(tg personal chats list:*)" "Bash(tg personal chats show:*)" "Bash(tg personal contacts context:*)"
      "Bash(tg personal store status:*)" "Bash(memo --help)" "Bash(memo commands:*)" "Bash(memo search:*)"
      "Bash(memo context:*)"
    )
    extra=() ;;
  ws2)
    unset WIRECAT_STATE_DIR
    access="Telegram is available through the tg command line tool, profile 'personal' (start with: tg personal --help)."
    # No TG_READ_ONLY: it also blocks server search (tg-cli #874). Safety comes from allowing read commands only.
    tools=(
      "Bash(tg --help)" "Bash(tg commands:*)" "Bash(tg guide:*)" "Bash(tg personal --help)" "Bash(tg personal commands:*)"
      "Bash(tg personal search:*)" "Bash(tg personal messages list:*)" "Bash(tg personal messages context:*)"
      "Bash(tg personal messages show:*)" "Bash(tg personal messages link:*)" "Bash(tg personal messages sync:*)"
      "Bash(tg personal chats list:*)" "Bash(tg personal chats show:*)" "Bash(tg personal contacts context:*)"
      "Bash(tg personal store status:*)" "Bash(memo --help)" "Bash(memo commands:*)" "Bash(memo search:*)"
      "Bash(memo context:*)"
    )
    extra=() ;;
  wf2)
    export WIRECAT_STATE_DIR="$run/wf/state"
    access="Telegram is available through the tg command line tool, profile 'personal' (start with: tg personal --help)."
    # No TG_READ_ONLY: it also blocks server search (tg-cli #874). Safety comes from allowing read commands only.
    tools=(
      "Bash(tg --help)" "Bash(tg commands:*)" "Bash(tg guide:*)" "Bash(tg personal --help)" "Bash(tg personal commands:*)"
      "Bash(tg personal search:*)" "Bash(tg personal messages list:*)" "Bash(tg personal messages context:*)"
      "Bash(tg personal messages show:*)" "Bash(tg personal messages link:*)" "Bash(tg personal messages sync:*)"
      "Bash(tg personal chats list:*)" "Bash(tg personal chats show:*)" "Bash(tg personal contacts context:*)"
      "Bash(tg personal store status:*)" "Bash(memo --help)" "Bash(memo commands:*)" "Bash(memo search:*)"
      "Bash(memo context:*)"
    )
    extra=() ;;
  w2)
    export WIRECAT_STATE_DIR="$run/w/state" TG_READ_ONLY=1
    access="Telegram is available through the tg command line tool, profile 'personal' (start with: tg personal --help).
The local archive may not reach back far; when it finds nothing, search Telegram's server too (--backend server or both)."
    tools=("Bash(tg:*)" "Bash(memo:*)")
    extra=() ;;
  m)
    cat > "$work/mcp.json" <<JSON
{"mcpServers":{"telegram":{"command":"uv","args":["--directory","$run/m/telegram-mcp","run","main.py"]}}}
JSON
    access="Telegram is available through the telegram MCP tools."
    tools=(
      mcp__telegram__export_contacts
      mcp__telegram__get_admins
      mcp__telegram__get_banned_users
      mcp__telegram__get_blocked_users
      mcp__telegram__get_bot_info
      mcp__telegram__get_chat
      mcp__telegram__get_chatlist_invite
      mcp__telegram__get_chats
      mcp__telegram__get_common_chats
      mcp__telegram__get_contact_chats
      mcp__telegram__get_contact_ids
      mcp__telegram__get_direct_chat_by_contact
      mcp__telegram__get_drafts
      mcp__telegram__get_folder
      mcp__telegram__get_folder_snapshot
      mcp__telegram__get_full_chat
      mcp__telegram__get_full_user
      mcp__telegram__get_history
      mcp__telegram__get_last_interaction
      mcp__telegram__get_me
      mcp__telegram__get_media_info
      mcp__telegram__get_message_context
      mcp__telegram__get_message_link
      mcp__telegram__get_messages
      mcp__telegram__get_messages_after
      mcp__telegram__get_participants
      mcp__telegram__get_pinned_messages
      mcp__telegram__get_recent_actions
      mcp__telegram__get_user_status
      mcp__telegram__inspect_document
      mcp__telegram__list_accounts
      mcp__telegram__list_chats
      mcp__telegram__list_contacts
      mcp__telegram__list_folders
      mcp__telegram__list_messages
      mcp__telegram__list_topics
      mcp__telegram__resolve_username
      mcp__telegram__search_contacts
      mcp__telegram__search_global
      mcp__telegram__search_messages
      mcp__telegram__transcribe_voice
    )
    extra=(--mcp-config "$work/mcp.json" --strict-mcp-config) ;;
  e)
    edir=$(realpath "$4")
    access="The user's Telegram chats are exported as JSON (one result.json per chat) under $edir."
    # What a person who hands an agent the export folder would allow: reading and filtering, Python in isolated mode.
    tools=("Read" "Grep" "Glob" "Bash(jq:*)" "Bash(ls:*)" "Bash(grep:*)" "Bash(python3 -I:*)")
    extra=(--add-dir "$edir") ;;
  *) echo "usage: ask.sh <w|w2|w3|w4|ws|ws2|wf|wfh|wf2|m|e> <questions-file> <run-dir> [export-dir]" >&2; exit 2 ;;
esac
start=$(date +%s)
cd "$work"
claude -p "$access

$rules

$(cat "$questions")" \
  --model "$model" --output-format stream-json --verbose --no-session-persistence --setting-sources project \
  --allowedTools "${tools[@]}" "${extra[@]}" > "$run/$who/transcript.jsonl"
tail -1 "$run/$who/transcript.jsonl" > "$run/$who/answers.json"
echo "ask_seconds $(( $(date +%s) - start ))" | tee -a "$run/$who/ask.log"
jq -r '.result' "$run/$who/answers.json"
