"""Owner-path check for the sandboxed OpenClaw rerun : counts tool calls and tool results in the
oc-iso2 sessions that name the owner's home folder literally. `~` is the agent's own temp home there, so it does not count.
Prints only counts; exits 3 when any are found."""
import glob
import json
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, "/var/tmp/locomo-bench/scripts")
import net_scan  # noqa: E402

hits = 0
for db in glob.glob("/var/tmp/locomo-bench/oc-iso2/*full-iso2*/up/home/.openclaw/agents/*/agent/openclaw-agent.sqlite"):
  con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
  for text, blob in con.execute("select event_json, event_zstd from transcript_events"):
    raw = text or (net_scan.zstd.decompress(blob).decode(errors="replace") if blob else "")
    hits += str(Path.home()) in raw.replace(str(Path.home() / ".nvm"), "")
print(hits)
sys.exit(3 if hits else 0)
