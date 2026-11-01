#!/usr/bin/env python3
"""Totals of one Claude Code subagent transcript (JSONL): tool calls, tool errors, tokens, wall time.

`subagent_tokens` is the last turn's whole context, the figure Claude Code reports when a subagent ends.

Prints counts only, never message text, so the output is safe to publish.
Usage: python3 -I transcript-totals.py <agent.jsonl> [...]
"""
import json
import sys
from datetime import datetime

CLIS = ("memo ", "tg ", "max ", "drive ")


def stamp(value):
  return datetime.fromisoformat(value.replace("Z", "+00:00"))


def totals(path):
  rows = [json.loads(line) for line in open(path, encoding="utf-8")]
  calls, cli_calls, failed, seen, last = {}, 0, 0, set(), {}
  usage = {"input": 0, "output": 0, "cache_read": 0, "cache_create": 0}
  for row in rows:
    message = row.get("message") or {}
    content = message.get("content")
    if row.get("type") == "assistant":
      if message.get("id") not in seen:
        seen.add(message.get("id"))
        got = message.get("usage") or {}
        last = got or last
        usage["input"] += got.get("input_tokens", 0)
        usage["output"] += got.get("output_tokens", 0)
        usage["cache_read"] += got.get("cache_read_input_tokens", 0)
        usage["cache_create"] += got.get("cache_creation_input_tokens", 0)
      for part in content or []:
        if isinstance(part, dict) and part.get("type") == "tool_use":
          command = (part.get("input") or {}).get("command", "")
          calls[part["id"]] = command
          if any(cli in command for cli in CLIS):
            cli_calls += 1
    elif row.get("type") == "user" and isinstance(content, list):
      for part in content:
        if isinstance(part, dict) and part.get("type") == "tool_result" and part.get("is_error"):
          failed += 1
  times = [stamp(row["timestamp"]) for row in rows if row.get("timestamp")]
  return {
    "tool_calls": len(calls),
    "calls_with_a_cli": cli_calls,
    "tool_errors": failed,
    "turns": len(seen),
    "subagent_tokens": sum(last.get(key, 0) for key in (
      "input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")),
    "tokens_summed_over_turns": usage,
    "wall_s": round((max(times) - min(times)).total_seconds()),
  }


if __name__ == "__main__":
  for path in sys.argv[1:]:
    print(json.dumps({"file": path.rsplit("/", 1)[-1], **totals(path)}))
