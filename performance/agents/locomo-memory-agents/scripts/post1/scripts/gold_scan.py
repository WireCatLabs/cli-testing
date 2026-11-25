"""Wider integrity scan (2026-11-25): any tool call that could reach the gold answers, not only network fetches.
Flags: the LoCoMo dataset by name (locomo10, locomo-src, snap-research, huggingface locomo), the benchmark's own
question file (questions.json holds the gold answers), other runs' folders, and OpenClaw's sessions_history /
sessions_search (they read earlier runs' transcripts). Writes runs/integrity/gold.json for post 1 and post 3."""
import glob
import json
import re
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, "/var/tmp/locomo-bench/scripts")
import net_scan  # noqa: E402

GOLD = re.compile(r"locomo10|locomo-src|snap-research|huggingface\.co[^\s\"']*locomo|locomo\.csv|/tmp/locomo|"
                  r"questions\.json|locomo-bench/runs|locomo-bench-p3/runs|locomo-bench/fixtures/[^\s\"']*qa|\"qa\"|\['qa'\]", re.I)
HISTORY = re.compile(r"sessions_history|sessions_search|sessions_list", re.I)
OUT = Path("/var/tmp/locomo-bench/runs/integrity/gold.json")


def kind_of(text):
    text = net_scan.LOCAL.sub("", text)
    if GOLD.search(text):
        return "gold"
    if HISTORY.search(text):
        return "history"
    return None


def openclaw():
    found = {}
    for db in glob.glob("/var/tmp/locomo-bench/openclaw/home/.openclaw/agents/*/agent/openclaw-agent.sqlite") + \
            glob.glob("/var/tmp/locomo-bench/oc-iso/*/up/home/.openclaw/agents/*/agent/openclaw-agent.sqlite"):
        con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        for session, text, blob in con.execute("select session_id, event_json, event_zstd from transcript_events"):
            event = text or (net_scan.zstd.decompress(blob).decode(errors="replace") if blob else "")
            try:
                parsed = json.loads(event)
            except json.JSONDecodeError:
                continue
            content = (parsed.get("message") or parsed).get("content") if isinstance(parsed, dict) else None
            for call in content or []:
                if isinstance(call, dict) and call.get("type") in ("toolCall", "tool_use"):
                    kind = kind_of(json.dumps(call))
                    if kind and found.get(session) != "gold":
                        found[session] = kind
        con.close()
    return found


def main():
    sessions = openclaw()
    rows = []
    for root in ("/var/tmp/locomo-bench", "/var/tmp/locomo-bench-p3"):
        for answers in sorted(Path(root).glob("runs/**/answers.json")):
            parts = answers.parent.relative_to(Path(root) / "runs").parts
            for row in json.loads(answers.read_text()):
                if "openclaw" in str(answers):
                    if len(parts) < 5:
                        continue
                    stage, setup, run, conv = parts[0], parts[-3], parts[-2], parts[-1]
                    kind = "files" if setup == "files" else "memo"
                    kinds = [sessions.get(f"locomo-{kind}-{stage}-{run}-{conv}-{row['id']}"),
                             sessions.get(f"locomo-{kind}-{run}-{conv}-{row['id']}")]
                elif "claude" in str(answers):
                    kinds = [kind_of(t) for t in net_scan.tool_inputs_claude(answers.parent, row["id"])]
                else:
                    kinds = [kind_of(t) for t in net_scan.tool_inputs_hermes(row)]
                kind = "gold" if "gold" in kinds else ("history" if "history" in kinds else None)
                if kind:
                    rows.append({"root": root, "path": "/".join(parts), "id": row["id"], "kind": kind})
    OUT.write_text(json.dumps(rows, indent=1) + "\n")
    for row in rows:
        print(row["root"][-7:], row["path"], row["id"], row["kind"])
    print(len(rows), "flagged;", sum(1 for s in sessions.values() if s), "OpenClaw sessions flagged in all")


if __name__ == "__main__":
    main()
