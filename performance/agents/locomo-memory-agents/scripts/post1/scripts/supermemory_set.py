"""A fresh Supermemory store per conversation for one run (the lead's ruling of 2026-11-23: the Hermes plugin writes
to its store while it answers). Runs provider_retrieval.py per conversation, in parallel; skips a conversation whose
results.json exists; writes the tag map that the driver reads."""
import fcntl
import json
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HARNESS = Path("/var/tmp/locomo-bench/harness")
FIXTURES = Path("/var/tmp/locomo-bench/fixtures")
OUT = Path("/var/tmp/locomo-bench/runs/ingest/supermemory")
STORES = Path("/var/tmp/locomo-bench/runs/supermemory-stores.json")


def ingest(name, conv):
    tag = f"wcat_p1_{name}_{conv.replace('conv-', 'c')}".replace("-", "_")
    folder = OUT / name / conv
    if (folder / "results.json").exists():
        return conv, tag, "kept", 0
    started = time.time()
    done = subprocess.run(["python3", "provider_retrieval.py", "--service", "supermemory", "--fixture",
                           str(FIXTURES / conv), "--output", str(folder), "--tag", tag, "--rewrites", "verbatim",
                           "--wait-minutes", "45"], cwd=HARNESS, capture_output=True, text=True)
    (OUT / name / f"{conv}.log").write_text(done.stdout[-4000:] + done.stderr[-4000:])
    return conv, tag, f"exit {done.returncode}", round(time.time() - started)


def main(name, convs):
    (OUT / name).mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(lambda conv: ingest(name, conv), convs))
    with open(STORES.with_suffix(".lock"), "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        stores = json.loads(STORES.read_text()) if STORES.exists() else {}
        stores.setdefault(name, {}).update({conv: tag for conv, tag, status, _ in results if status == "exit 0"
                                            or status == "kept"})
        STORES.write_text(json.dumps(stores, indent=2) + "\n")
    for row in results:
        print(*row, flush=True)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2].split(","))
