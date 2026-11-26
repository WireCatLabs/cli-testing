"""Retain each LoCoMo session into a local Hindsight bank (one bank per conversation), wait for consolidation,
and record time and the LLM tokens Hindsight reports. Endpoints as in wcatbench's Hindsight store."""
import json
import sys
import time
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:18888"
FIXTURES = Path("/var/tmp/locomo-bench/fixtures")
OUT = Path("/var/tmp/locomo-bench/runs/ingest")


def call(method, path, body=None, timeout=300):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as reply:
        return json.load(reply)


def main(conv):
    bank = f"wcat-p1-{conv}"
    prefix = f"/v1/default/banks/{bank}"
    records = [json.loads(line) for line in (FIXTURES / conv / "corpus.jsonl").read_text().splitlines()]
    call("PUT", prefix, {})
    started = time.time()
    for index, record in enumerate(records):
        rid = f"r{index + 1:04}"
        item = {"content": record["text"], "timestamp": record["timestamp"], "context": "chat conversation",
                "document_id": rid, "metadata": {"rid": rid}}
        call("POST", prefix + "/memories", {"items": [item], "async": True})
    submitted = time.time() - started
    while True:
        stats = call("GET", prefix + "/stats")
        if not stats.get("pending_operations") and not stats.get("pending_consolidation"):
            break
        print(f"{conv} {time.time() - started:.0f}s pending ops={stats.get('pending_operations')} "
              f"consolidation={stats.get('pending_consolidation')}", flush=True)
        time.sleep(20)
    llm = call("GET", prefix + "/llm-requests/stats?period=30d")
    result = {"conversation": conv, "bank": bank, "version": call("GET", "/version"), "sessions": len(records),
              "submit_s": round(submitted, 1), "until_consolidated_s": round(time.time() - started, 1),
              "stats": stats, "llm": llm}
    (OUT / f"hindsight-{conv}.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({k: result[k] for k in ("conversation", "submit_s", "until_consolidated_s")}), flush=True)


if __name__ == "__main__":
    for conversation in sys.argv[1:]:
        main(conversation)
