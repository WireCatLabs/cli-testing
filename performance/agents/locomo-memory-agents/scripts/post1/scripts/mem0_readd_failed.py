"""Re-adds the Mem0 sessions whose extraction FAILED (BYOK key limit, 2026-11-24), per store, by record id.
Reads the event feed, keeps each record's best outcome, and adds again every record of w1 and s1 that never
SUCCEEDED. Status CSV: /var/tmp/locomo-bench/runs/ingest/mem0-readd.csv."""
import ast
import csv
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, "/var/tmp/locomo-bench/harness")
from provider_retrieval import MEM0, Api, keyring_secret  # noqa: E402

ROOT = Path("/var/tmp/locomo-bench")
STORES = ROOT / "runs/mem0-stores.json"
STATUS = ROOT / "runs/ingest/mem0-readd.csv"
RANK = {"FAILED": 0, "PENDING": 1, "RUNNING": 1, "SUCCEEDED": 2}


def lit(value):
    return ast.literal_eval(value) if isinstance(value, str) and value.startswith("{") else value or {}


def outcomes(api, users):
    best, page = {}, 1
    while True:
        reply = api.request("GET", f"/v1/events/?page={page}&page_size=100")
        for event in reply.get("results", []):
            user = lit(event.get("payload")).get("user_id")
            if event.get("event_type") != "ADD" or user not in users:
                continue
            rid = lit(event.get("metadata")).get("rid")
            if RANK.get(event["status"], 1) >= RANK.get(best.get((user, rid)), -1):
                best[(user, rid)] = event["status"]
        if not reply.get("next") or page > 40:
            return best
        page += 1


def main():
    api = Api(MEM0, "Token " + keyring_secret("mem0"))
    stores = json.loads(STORES.read_text())
    users = {user: (run, conv) for run in ("w1", "s1") for conv, user in stores[run].items()}
    best = outcomes(api, set(users))
    print("outcomes:", {s: sum(1 for v in best.values() if v == s) for s in RANK}, flush=True)
    if "--check" in sys.argv:
        return
    print(f"Status CSV: {STATUS}", flush=True)
    new = not STATUS.exists()
    with STATUS.open("a", newline="") as handle:
        writer = csv.writer(handle)
        if new:
            writer.writerow(["id", "status", "detail", "time"])
        done = 0
        for user, (run, conv) in sorted(users.items()):
            records = [json.loads(line) for line in (ROOT / "fixtures" / conv / "corpus.jsonl").read_text().splitlines()]
            for index, record in enumerate(records):
                rid = f"r{index + 1:04}"
                if best.get((user, rid)) == "SUCCEEDED":
                    continue
                body = {"messages": [{"role": "user", "content": record["text"]}], "user_id": user,
                        "agent_id": "wirecat-bench", "metadata": {"rid": rid}, "infer": True}
                try:
                    api.request("POST", "/v3/memories/add/", body)
                    status, detail = "sent", ""
                except RuntimeError as error:
                    status, detail = "error", str(error)[:200]
                writer.writerow([f"{user}|{rid}", status, detail, datetime.now(UTC).isoformat(timespec="seconds")])
                handle.flush()
                done += 1
                if done % 10 == 0:
                    print(f"-- {done} re-added", flush=True)
        print(f"re-added {done}", flush=True)


if __name__ == "__main__":
    main()
