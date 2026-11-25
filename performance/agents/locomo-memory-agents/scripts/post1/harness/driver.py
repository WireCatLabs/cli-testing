#!/usr/bin/env python3
"""Runs one arm (agent + model + setup + run name) over a question list, one conversation at a time, each into its
own folder runs/<stage>/<arm>/<setup>/<run>/<conv>. A finished folder (run.json) is skipped, so a restart resumes;
an unfinished one is removed and redone. Built-in memory of Hermes is reset per conversation chunk."""

import argparse
import json
import shutil
import subprocess
import sys
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path("/var/tmp/locomo-bench")
HARNESS = ROOT / "harness"
HINDSIGHT = {f"conv-{n}": f"wcat-p1-conv-{n}" for n in (26, 30, 41, 42, 43, 44, 47, 48, 49, 50)}
STORES = ROOT / "runs/supermemory-stores.json"
HERMES_CONFIG = {"files": "alone", "wirecat": "wirecat", "supermemory": "supermemory", "hindsight": "hindsight",
                 "honcho": "honcho", "mem0": "mem0"}


def stores_for(setup, store_set):
    if setup in ("hindsight", "honcho"):
        return HINDSIGHT
    if setup == "supermemory":
        return json.loads(STORES.read_text())[store_set]
    if setup == "mem0":
        return json.loads((ROOT / "runs/mem0-stores.json").read_text())[store_set]
    return {}


def deepseek_peak(now=None):
    """DeepSeek doubles its price Mon-Fri 01-04 and 06-10 UTC (Hermes usage_pricing.py, DeepSeek pricing page)."""
    now = now or time.gmtime()
    return now.tm_wday < 5 and (1 <= now.tm_hour < 4 or 6 <= now.tm_hour < 10)


def deepseek_balance():
    import os
    import urllib.request
    request = urllib.request.Request("https://api.deepseek.com/user/balance",
                                     headers={"Authorization": "Bearer " + os.environ["DEEPSEEK_API_KEY"]})
    with urllib.request.urlopen(request, timeout=30) as reply:
        return float(json.load(reply)["balance_infos"][0]["total_balance"])


def supermemory_set(args):
    return json.loads(STORES.read_text()).get(args.store_set or args.run, {}) if STORES.exists() else {}


def command(args, conv, ids, out):
    stores = json.dumps(stores_for(args.setup, args.store_set or args.run))
    if args.agent == "hermes":
        return ["python3", "hermes_locomo.py", "answer", "--config", HERMES_CONFIG[args.setup], "--questions", ids,
                "--run", args.run, "--stores", stores, "--output", str(out), "--model", args.model,
                "--provider", "deepseek"]
    if args.agent == "openclaw":
        return ["python3", "openclaw_locomo.py", "answer", "--agent", {"files": "files", "wirecat": "memo"}[args.setup],
                "--questions", ids, "--run", f"{args.stage}-{args.run}-{conv}", "--output", str(out),
                "--model", f"deepseek/{args.model}"]
    if args.agent == "claude":
        return ["python3", "claude_locomo.py", "--setup", args.setup, "--questions", ids, "--stores", stores,
                "--output", str(out), "--model", args.model]
    if args.agent == "deepseek":
        return ["python3", "deepseek_none.py", "--questions", ids, "--output", str(out), "--model", args.model]
    raise SystemExit(f"unknown agent {args.agent}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", required=True, help="stage2 or full")
    parser.add_argument("--agent", choices=["hermes", "openclaw", "claude", "deepseek"], required=True)
    parser.add_argument("--setup", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--run", required=True, help="w1, w2, w3 or s1")
    parser.add_argument("--store-set", help="Supermemory / Mem0 store set; default: the run name")
    parser.add_argument("--questions", required=True, help="comma list of ids, or 'all'")
    args = parser.parse_args()
    questions = json.loads((ROOT / "questions.json").read_text())["questions"]
    wanted = None if args.questions == "all" else set(args.questions.split(","))
    by_conv = defaultdict(list)
    for q in questions:
        if wanted is None or q["id"] in wanted:
            by_conv[q["conversation"]].append(q["id"])
    arm = f"{args.agent}-{args.model}"
    base = ROOT / "runs" / args.stage / arm / args.setup / args.run
    for conv, ids in sorted(by_conv.items()):
        out = base / conv
        if (out / "run.json").exists():
            have = sorted(row["id"] for row in json.loads((out / "answers.json").read_text()))
            if have != sorted(ids):
                sys.exit(f"STOP: {out} holds {len(have)} other questions than the {len(ids)} asked; use another --run")
            continue
        if out.exists():
            shutil.rmtree(out)
        while args.agent != "claude" and deepseek_peak():
            time.sleep(300)
        # The lead's floor: stop before the DeepSeek balance drops under $3.
        if args.agent != "claude" and deepseek_balance() < 4:
            print("STOP: DeepSeek balance under $4", flush=True)
            sys.exit(2)
        waited = 0
        while args.stage == "full" and args.setup == "supermemory" and conv not in supermemory_set(args):
            if waited > 3 * 3600:
                sys.exit(f"STOP: no Supermemory store for {conv} in set {args.store_set or args.run} after 3 h")
            time.sleep(60)
            waited += 60
        started = time.time()
        done = subprocess.run(command(args, conv, ",".join(ids), out), cwd=HARNESS, capture_output=True, text=True)
        base.mkdir(parents=True, exist_ok=True)
        (base / f"{conv}.log").write_text(done.stdout[-6000:] + "\n--- stderr\n" + done.stderr[-6000:])
        status = "ok" if (out / "run.json").exists() else f"FAILED exit {done.returncode}"
        print(f"{arm} {args.setup} {args.run} {conv} {status} {time.time() - started:.0f}s", flush=True)
        if status != "ok":
            sys.exit(1)


if __name__ == "__main__":
    main()
