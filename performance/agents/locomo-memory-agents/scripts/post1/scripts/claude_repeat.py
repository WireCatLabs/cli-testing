#!/usr/bin/env python3
"""Runs 2 and 3 of Claude Code (files, WireCat) on the 200 LoCoMo questions, same harness as s1 (NEED-120 A).
Writes one status row per (setup, run, conversation); a rerun skips rows marked done. Judges each finished part."""
import csv
import json
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path


ROOT = Path("/var/tmp/wcat-p1")
HARNESS = ROOT / "harness/claude_locomo.py"
JUDGE = ROOT / "scripts/judge.py"
QUESTIONS = ROOT / "questions.json"
OUT = ROOT / "runs/repeat/claude-sonnet"
STATUS = ROOT / "runs/repeat/status.csv"
SETUPS = ["files", "wirecat"]
RUNS = ["s2", "s3"]
LANES = 4


def openai_key():
    # From the keyring into this process only, never printed.
    done = subprocess.run(["secret-tool", "lookup", "service", "openai", "account", "default"],
                          capture_output=True, text=True, check=False)
    if done.returncode != 0 or not done.stdout.strip():
        raise SystemExit("no keyring entry for service openai account default")
    return done.stdout.strip()


def done_keys():
    if not STATUS.exists():
        return set()
    with STATUS.open() as f:
        return {(r["setup"], r["run"], r["conv"]) for r in csv.DictReader(f) if r["status"] == "done"}


def write_row(row):
    new = not STATUS.exists()
    with STATUS.open("a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["setup", "run", "conv", "status", "detail", "time"])
        if new:
            w.writeheader()
        w.writerow(row)
        f.flush()


def part(job, ids, env):
    setup, run, conv = job
    place = OUT / setup / run / conv
    if place.exists():
        place.rename(place.with_name(f"{conv}.partial-{int(time.time())}"))
    place.parent.mkdir(parents=True, exist_ok=True)
    with (place.parent / f"{conv}.log").open("w") as log:
        done = subprocess.run([sys.executable, str(HARNESS), "--setup", setup, "--questions", ",".join(ids),
                               "--output", str(place)], cwd=ROOT / "harness", stdout=log, stderr=log)
    if done.returncode != 0:
        return {"status": "failed", "detail": f"harness exit {done.returncode}"}
    judged = subprocess.run([sys.executable, str(JUDGE), str(place)], env=env, capture_output=True, text=True)
    if judged.returncode != 0:
        return {"status": "failed", "detail": "judge failed"}
    rows = json.loads((place / "judged.json").read_text())["rows"]
    return {"status": "done", "detail": f"{sum(r['correct'] for r in rows)}/{len(rows)}"}


def main():
    print(f"status: {STATUS}", flush=True)
    STATUS.parent.mkdir(parents=True, exist_ok=True)
    questions = json.loads(QUESTIONS.read_text())["questions"]
    by_conv = {}
    for q in questions:
        by_conv.setdefault(q["conversation"], []).append(q["id"])
    env = {"PATH": "/usr/bin:/bin", "OPENAI_API_KEY": openai_key()}
    skip = done_keys()
    jobs = [(s, r, c) for r in RUNS for s in SETUPS for c in sorted(by_conv) if (s, r, c) not in skip]
    print(f"{len(jobs)} parts to run, {len(skip)} done before", flush=True)

    def go(job):
        started = time.time()
        result = part(job, by_conv[job[2]], env)
        row = {"setup": job[0], "run": job[1], "conv": job[2], **result,
               "time": datetime.now(UTC).isoformat(timespec="seconds")}
        write_row(row)
        print(f"{job} {result['status']} {result['detail']} {time.time() - started:.0f}s", flush=True)

    with ThreadPoolExecutor(LANES) as pool:
        list(pool.map(go, jobs))


if __name__ == "__main__":
    main()
