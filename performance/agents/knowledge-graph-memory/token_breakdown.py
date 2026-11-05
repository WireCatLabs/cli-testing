#!/usr/bin/env python3
"""Where an answer run's tokens and cost go: the skill, each memo command's replies, the agent's own output.

    python3 token_breakdown.py openclaw <copy of agents/memo/agent/openclaw-agent.sqlite> <run>/raw
    python3 token_breakdown.py hermes <copy of hermes-home/state.db> <run>/raw

Read a copy of each database: OpenClaw and Hermes keep them open while they run.
"""

import collections
import glob
import json
import os
import re
import sqlite3
import subprocess
import sys

# $ per million tokens. OpenClaw reports its own cost with cache reads at $0.10; RESULTS.md prices Hermes's
# reported tokens with cache reads at $0.20, so each agent keeps the price its earlier rows used.
OPENCLAW = {"input": 2.0, "output": 10.0, "cache_read": 0.1, "cache_write": 2.5}
HERMES = {"input": 2.0, "output": 10.0, "cache_read": 0.2, "cache_write": 2.5}
# Hermes stores tool results as text, not tokens: OpenClaw's run measured the 22.7k-character skill as 8.1k tokens.
CHARS_PER_TOKEN = 2.8


def memo_command(code):
    if "skills.read" in code or "skill_view" in code or "skill show" in code:
        return "skill"
    found = re.findall(r"memo ([a-z]+(?: [a-z-]+)?)", code)
    return "memo " + collections.Counter(found).most_common(1)[0][0] if found else "other"


def limits_of(code):
    return [int(n) for n in re.findall(r"--limit (\d+)", code)]


def report(n, parts, total, calls, tool_calls, limits):
    print(f"questions {n}, model calls {calls / n:.1f}/q, tool calls {tool_calls / n:.1f}/q, ${total:.2f} "
          f"(${total / n:.4f}/q)")
    for name, (tokens, cost) in sorted(parts.items(), key=lambda item: -item[1][1]):
        print(f"  {name:40s} {tokens / n:>9,.0f} tok/q  ${cost / n:.4f}/q  {100 * cost / total:5.1f} %")
    print("  --limit asked:", dict(sorted(limits.items())))


def openclaw(db, raw):
    con = sqlite3.connect(db)
    parts = collections.defaultdict(lambda: [0, 0.0])
    limits = collections.Counter()
    n = calls = tool_calls = 0
    for path in sorted(glob.glob(os.path.join(raw, "q*.stdout.json"))):
        try:
            session = json.load(open(path))["meta"]["agentMeta"]["sessionId"]
        except (ValueError, KeyError):
            continue
        n += 1
        turns = []
        for event_json, event_zstd in con.execute(
                "select event_json, event_zstd from transcript_events where session_id = ? order by seq", (session,)):
            if event_json is None:
                event_json = subprocess.run(["zstd", "-dc"], input=event_zstd, capture_output=True, check=True).stdout
            event = json.loads(event_json)
            message = event.get("message") if event.get("type") == "message" else None
            if not message or message["role"] != "assistant":
                continue
            kinds = []
            for block in message["content"]:
                if block.get("type") == "toolCall":
                    code = json.dumps(block.get("arguments", {}))
                    kinds.append(memo_command(code))
                    limits.update(limits_of(code))
            turns.append((message["usage"], kinds))
        calls += len(turns)
        tool_calls += sum(len(kinds) for _, kinds in turns)
        for at, (usage, _) in enumerate(turns):
            later = len(turns) - at - 1
            new = usage["input"] + usage["cacheWrite"]
            out = usage["output"]
            part = parts["agent output"]
            part[0] += out
            part[1] += out * OPENCLAW["output"] / 1e6
            if at == 0:
                prompt = new + usage["cacheRead"]
                part = parts["OpenClaw prompt + question"]
                part[0] += prompt * (1 + later)
                part[1] += (new * OPENCLAW["cache_write"] + usage["cacheRead"] * OPENCLAW["cache_read"]
                            + prompt * OPENCLAW["cache_read"] * later) / 1e6
                continue
            # What this call wrote first is the previous call's output plus the tool results it got back.
            previous_out = turns[at - 1][0]["output"]
            result = max(new - previous_out, 0)
            name = "/".join(sorted(set(turns[at - 1][1]))) or "none"
            for key, tokens in ((f"reply: {name}", result), ("agent output, re-read", previous_out)):
                part = parts[key]
                part[0] += tokens * (1 + later)
                part[1] += tokens * (OPENCLAW["cache_write"] + OPENCLAW["cache_read"] * later) / 1e6
    report(n, parts, sum(cost for _, cost in parts.values()), calls, tool_calls, limits)


def hermes(db, raw):
    con = sqlite3.connect(db)
    parts = collections.defaultdict(lambda: [0, 0.0])
    limits = collections.Counter()
    totals = collections.Counter()
    n = 0
    for path in sorted(glob.glob(os.path.join(raw, "q*.usage.json"))):
        usage = json.load(open(path))
        n += 1
        for key in ("input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "api_calls"):
            totals[key] += usage.get(key) or 0
        rows = con.execute("select role, tool_name, content, tool_calls from messages where session_id = ? order by id",
                           (usage["session_id"],)).fetchall()
        answers = sum(1 for role, *_ in rows if role == "assistant")
        seen = 0
        asked = {}
        for role, tool, content, calls in rows:
            if role == "assistant":
                seen += 1
                for call in json.loads(calls or "[]"):
                    asked[call["id"]] = call["function"]["arguments"]
                    limits.update(limits_of(call["function"]["arguments"]))
                    totals["tool_calls"] += 1
                continue
            if role != "tool":
                continue
            name = "skill" if tool == "skill_view" else memo_command(list(asked.values())[-1] if asked else "")
            tokens = len(content or "") / CHARS_PER_TOKEN
            part = parts[f"reply: {name}"]
            part[0] += tokens * (1 + answers - seen)
            part[1] += tokens * (HERMES["cache_write"] + HERMES["cache_read"] * (answers - seen)) / 1e6
    total = (totals["input_tokens"] * HERMES["input"] + totals["output_tokens"] * HERMES["output"]
             + totals["cache_read_tokens"] * HERMES["cache_read"] + totals["cache_write_tokens"] * HERMES["cache_write"]) / 1e6
    parts["agent output"] = [totals["output_tokens"], totals["output_tokens"] * HERMES["output"] / 1e6]
    parts["rest: system prompt, question, re-reads"] = [0, total - sum(cost for _, cost in parts.values())]
    print(f"cache write {totals['cache_write_tokens'] / n:,.0f}/q, read {totals['cache_read_tokens'] / n:,.0f}/q, "
          f"output {totals['output_tokens'] / n:,.0f}/q")
    report(n, parts, total, totals["api_calls"], totals["tool_calls"], limits)


if __name__ == "__main__":
    {"openclaw": openclaw, "hermes": hermes}[sys.argv[1]](sys.argv[2], sys.argv[3])
