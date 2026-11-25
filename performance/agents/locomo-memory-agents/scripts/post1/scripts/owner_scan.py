"""Privacy scan (2026-11-25): tool calls by non-Claude agents (DeepSeek, OpenRouter models) that name the owner's
real data: home folders outside the benchmark, notes folders, WireCat and memo stores and configs. Counts per
agent, stage and setup; for OpenClaw it also checks whether the next tool result returned content. Writes
runs/integrity/owner.json. Prints only counts and path prefixes, never file content."""
import collections
import glob
import json
import re
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, "/var/tmp/locomo-bench/scripts")
import net_scan  # noqa: E402

HOME = re.escape(str(Path.home()))
OWNER = re.compile(HOME + r"/(?!\.?nvm|\.asdf|\.local/bin)[^\s\"'\\,)\]]*|~/[^\s\"'\\,)\]]+|\$HOME[^\s\"'\\,)\]]*")
OUT = Path("/var/tmp/locomo-bench/runs/integrity/owner.json")


def prefix(path):
  return "/".join(path.replace("~", str(Path.home())).split("/")[:5])


def openclaw(rows):
  dbs = glob.glob("/var/tmp/locomo-bench/openclaw/home/.openclaw/agents/*/agent/openclaw-agent.sqlite") + \
      glob.glob("/var/tmp/locomo-bench/oc-iso*/*/up/home/.openclaw/agents/*/agent/openclaw-agent.sqlite")
  for db in dbs:
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    events = []
    for session, text, blob in con.execute("select session_id, event_json, event_zstd from transcript_events order by rowid"):
      raw = text or (net_scan.zstd.decompress(blob).decode(errors="replace") if blob else "")
      try:
        parsed = json.loads(raw)
      except json.JSONDecodeError:
        continue
      events.append((session, (parsed.get("message") or parsed) if isinstance(parsed, dict) else {}))
    for i, (session, msg) in enumerate(events):
      if not isinstance(msg, dict) or msg.get("role") == "toolResult":
        continue
      calls = [c for c in msg.get("content") or [] if isinstance(c, dict) and c.get("type") in ("toolCall", "tool_use")]
      paths = sorted({prefix(p) for c in calls for p in OWNER.findall(json.dumps(c.get("arguments") or c.get("input")))})
      if not paths:
        continue
      result = next((m for _, m in events[i + 1:i + 4] if isinstance(m, dict) and m.get("role") == "toolResult"), {})
      size = len(json.dumps(result.get("content") or ""))
      rows.append({"agent": "openclaw", "where": "iso" if "oc-iso" in db else "shared-home", "session": session,
                   "paths": paths, "result_chars": size})


def hermes(rows):
  for root in ("/var/tmp/locomo-bench", "/var/tmp/locomo-bench-p3"):
    for answers in sorted(Path(root).glob("runs/**/answers.json")):
      rel = str(answers.parent.relative_to(Path(root) / "runs"))
      if "claude" in rel or "openclaw" in rel or "iso" in rel:
        continue
      for row in json.loads(answers.read_text()):
        paths = sorted({prefix(p) for t in net_scan.tool_inputs_hermes(row) for p in OWNER.findall(str(t))})
        if paths:
          rows.append({"agent": "hermes", "where": f"{root[-7:]}/{rel}", "session": row["id"], "paths": paths,
                       "result_chars": None})


def main():
  rows = []
  openclaw(rows)
  hermes(rows)
  OUT.write_text(json.dumps(rows, indent=1) + "\n")
  by = collections.Counter()
  sessions = collections.defaultdict(set)
  for r in rows:
    key = (r["agent"], r["where"].split("/")[0] if r["agent"] == "openclaw" else "/".join(r["where"].split("/")[:3]))
    sessions[key].add(r["session"])
    for p in r["paths"]:
      by[(key, p)] += 1
  for key, ids in sorted(sessions.items()):
    print(key, len(ids), "sessions")
  for (key, p), n in by.most_common(60):
    print(n, key, p)
  print(OUT)


if __name__ == "__main__":
  main()
