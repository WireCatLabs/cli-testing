"""Finds every answer whose agent reached the internet through a tool (curl, wget, a URL, a web tool), and marks the
ones that fetched the LoCoMo dataset itself. Writes runs/integrity/network.json; summarize.py excludes those rows."""
import glob
import json
import re
import sqlite3
from compression import zstd
from pathlib import Path

ROOT = Path("/var/tmp/locomo-bench")
OUT = ROOT / "runs/integrity/network.json"
NET = re.compile(r"\bcurl\b|\bwget\b|https?://|urllib|requests\.get|web_search|web_extract|web_fetch|WebFetch|"
                 r"WebSearch|browser_navigate", re.I)
DATASET = re.compile(r"locomo|snap-research|/tmp/locomo", re.I)
LOCAL = re.compile(r"https?://(127\.0\.0\.1|localhost)")


def classify(text):
    text = LOCAL.sub("", text)
    if DATASET.search(text):
        return "dataset"
    return "web" if NET.search(text) else None


def tool_inputs_hermes(row):
    return [t.get("arguments") or "" for t in row.get("tool_calls") or [] if isinstance(t, dict)] + \
        [t.get("name", "") for t in row.get("tool_calls") or [] if isinstance(t, dict)]


def tool_inputs_claude(chunk, qid):
    texts = []
    path = chunk / "raw" / f"{qid}.stream.jsonl"
    if not path.exists():
        return texts
    for line in path.read_text().splitlines():
        event = json.loads(line)
        for part in (event.get("message") or {}).get("content") or []:
            if isinstance(part, dict) and part.get("type") == "tool_use":
                texts.append(part.get("name", "") + " " + json.dumps(part.get("input")))
    return texts


def openclaw_sessions():
    found = {}
    # The sandboxed reruns keep each question's OpenClaw state in its own overlay upper folder.
    dbs = glob.glob(str(ROOT / "openclaw/home/.openclaw/agents/*/agent/openclaw-agent.sqlite")) + glob.glob(
        str(ROOT / "oc-iso*/*/up/home/.openclaw/agents/*/agent/openclaw-agent.sqlite"))
    for db in dbs:
        con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        for session, text, blob in con.execute("select session_id, event_json, event_zstd from transcript_events"):
            event = text or (zstd.decompress(blob).decode(errors="replace") if blob else "")
            try:
                parsed = json.loads(event)
            except json.JSONDecodeError:
                continue
            content = (parsed.get("message") or parsed).get("content") if isinstance(parsed, dict) else None
            calls = [json.dumps(c) for c in content or [] if isinstance(c, dict) and c.get("type") in ("toolCall",
                                                                                                         "tool_use")]
            for call in calls:
                kind = classify(call)
                if kind and found.get(session) != "dataset":
                    found[session] = kind
        con.close()
    return found


def main():
    sessions = openclaw_sessions()
    rows = []
    for answers in sorted(ROOT.glob("runs/*/*/*/*/*/answers.json")):
        stage, arm, setup, run, conv = answers.parent.relative_to(ROOT / "runs").parts
        agent = arm.split("-")[0]
        for row in json.loads(answers.read_text()):
            if agent == "hermes":
                kinds = [classify(t) for t in tool_inputs_hermes(row)]
            elif agent == "claude":
                kinds = [classify(t) for t in tool_inputs_claude(answers.parent, row["id"])]
            elif agent == "openclaw":
                kind = "files" if setup == "files" else "memo"
                kinds = [sessions.get(f"locomo-{kind}-{stage}-{run}-{conv}-{row['id']}"),
                         sessions.get(f"locomo-{kind}-{run}-{conv}-{row['id']}")]
            else:
                kinds = []
            kind = "dataset" if "dataset" in kinds else ("web" if "web" in kinds else None)
            if kind:
                rows.append({"stage": stage, "arm": arm, "setup": setup, "run": run, "id": row["id"], "kind": kind})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(rows, indent=1) + "\n")
    for row in rows:
        print(row["stage"], row["arm"], row["setup"], row["run"], row["id"], row["kind"])


if __name__ == "__main__":
    main()
