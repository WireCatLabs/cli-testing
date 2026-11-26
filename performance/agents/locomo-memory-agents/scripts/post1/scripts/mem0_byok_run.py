"""Mem0, once its free retrieval quota is back (2026-12-02): one command for everything.

1. One search to check the quota; stops on HTTP 429.
2. A fresh Mem0 user id per run (w1, w2, w3, s1) and conversation: each session added with infer on, as the other
   stores got them (adds only; listing would spend retrievals). Waits 20 minutes for extraction.
3. Hermes + Mem0: three runs with deepseek-flash on 50 questions and one with deepseek-v4-pro on the 20-question
   strong subset; Claude Code + Mem0 MCP on 50 questions (store set s1, its writes are denied). After the first
   chunk it projects the searches of the rest and stops if they would pass the 1,000 a month quota.
4. The summary.
Run:  python3 -I /var/tmp/locomo-bench/scripts/mem0_run.py
"""
import json
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, "/var/tmp/locomo-bench/harness")
from provider_retrieval import MEM0, Api, keyring_secret  # noqa: E402

ROOT = Path("/var/tmp/locomo-bench")
STORES = ROOT / "runs/mem0-stores.json"
LOG = ROOT / "runs/ingest/mem0-full.jsonl"
CONVS = ["conv-26", "conv-30", "conv-41", "conv-42", "conv-43", "conv-44", "conv-47", "conv-48", "conv-49", "conv-50"]
# BYOK run (2026-11-24): a $3 OpenRouter key pays extraction, so one weak run and one strong store set.
RUNS = {"w1": "deepseek-flash", "s1": "deepseek-v4-pro"}
STRONG = (ROOT / "strong-subset-ids.txt").read_text().strip()
QUOTA = 1000
SEARCH_TOOLS = ("search", "get_memories", "get_all", "list")


def quota_ok(api):
    try:
        api.request("POST", "/v3/memories/search/", {"query": "probe", "filters": {"user_id": "wcat-p1-probe"},
                                                     "top_k": 1}, attempts=1)
        return True
    except RuntimeError as error:
        print(f"Mem0 not ready: {str(error)[:200]}")
        return False


def ingest(api, run, conv):
    user = f"wcat-p1-{run}-{conv}"
    records = [json.loads(line) for line in (ROOT / "fixtures" / conv / "corpus.jsonl").read_text().splitlines()]
    started, failed = time.time(), 0
    for index, record in enumerate(records):
        body = {"messages": [{"role": "user", "content": record["text"]}], "user_id": user,
                "agent_id": "wirecat-bench", "metadata": {"rid": f"r{index + 1:04}"}, "infer": True}
        try:
            api.request("POST", "/v3/memories/add/", body)
        except RuntimeError:
            failed += 1
    with LOG.open("a") as log:
        log.write(json.dumps({"run": run, "conv": conv, "user_id": user, "adds": len(records), "failed": failed,
                              "submit_s": round(time.time() - started, 1)}) + "\n")
    return run, conv, user


def main():
    api = Api(MEM0, "Token " + keyring_secret("mem0"))
    if not quota_ok(api):
        sys.exit(1)
    stores = json.loads(STORES.read_text()) if STORES.exists() else {}
    jobs = [(run, conv) for run in RUNS for conv in CONVS if conv not in stores.get(run, {})]
    with ThreadPoolExecutor(max_workers=4) as pool:
        for run, conv, user in pool.map(lambda job: ingest(api, *job), jobs):
            stores.setdefault(run, {})[conv] = user
            STORES.write_text(json.dumps(stores, indent=2) + "\n")
    if jobs:
        print("waiting 20 minutes for Mem0's extraction", flush=True)
        time.sleep(1200)
    subprocess.run(["python3", "hermes_locomo.py", "prepare", "--config", "mem0", "--conversations", ",".join(CONVS)],
                   cwd=ROOT / "harness", check=True)
    lanes = [["--agent", "hermes", "--model", model, "--run", run, "--questions", STRONG if run == "s1" else "all"]
             for run, model in RUNS.items()]
    lanes.append(["--agent", "claude", "--model", "sonnet", "--run", "s1", "--questions", "all"])
    # BYOK lifts reads to 10,000 a month, so no quota probe. Claude goes before Hermes on s1: Hermes writes each turn.
    lanes = [lanes[0], lanes[2], lanes[1]]
    for lane in lanes:
        print("lane:", " ".join(lane), flush=True)
        done = subprocess.run(["python3", "driver.py", "--stage", "full", "--setup", "mem0", *lane], cwd=ROOT / "harness")
        print("lane exit", done.returncode, flush=True)
    subprocess.run(["python3", "summarize.py", "full"], cwd=ROOT / "harness", check=True)


if __name__ == "__main__":
    main()
