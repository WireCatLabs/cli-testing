#!/usr/bin/env python3
"""PreToolUse hook for the layer-2 skill arms. Claude Code's dontAsk mode denies `qmd query $'intent: ...\nlex: ...'`,
the form qmd's own skill teaches, even under Bash(qmd:*). Allow one plain call of the arm's binary (L2_HOOK_BIN) whose
text outside quotes has no command separator, pipe, redirect or substitution; anything else falls through to the rules."""
import json, os, sys

def outside_quotes(cmd):
  out, i, n = [], 0, len(cmd)
  while i < n:
    c = cmd[i]
    if c == "$" and i + 1 < n and cmd[i + 1] == "'":
      i += 2
      while i < n and cmd[i] != "'":
        i += 2 if cmd[i] == "\\" else 1
      i += 1
    elif c == "'":
      j = cmd.find("'", i + 1)
      if j < 0:
        return None
      i = j + 1
    elif c == '"':
      i += 1
      while i < n and cmd[i] != '"':
        if cmd[i] in "`$":
          return None
        i += 2 if cmd[i] == "\\" else 1
      i += 1
    else:
      out.append(c)
      i += 1
  return "".join(out) if i <= n + 1 else None

event = json.load(sys.stdin)
cmd = (event.get("tool_input") or {}).get("command", "").strip()
binary = os.environ.get("L2_HOOK_BIN", "")
rest = outside_quotes(cmd)
if binary and event.get("tool_name") == "Bash" and cmd.split(" ", 1)[0] == binary and rest is not None \
    and not any(t in rest for t in (";", "&", "|", "<", ">", "`", "$(", "\n")):
  print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow",
                                           "permissionDecisionReason": "one call of the arm's binary"}}))
