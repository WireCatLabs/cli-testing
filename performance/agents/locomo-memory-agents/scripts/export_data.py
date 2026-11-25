#!/usr/bin/env python3
"""Turns a bench's run folders into the per-answer JSONL files in data/. Keeps the answer, the judge's label and
counts; drops tool-call arguments, tool results, session ids and the LoCoMo question and gold text (CC BY-NC 4.0:
regenerate them with post1/scripts/pick_questions.py). Usage:
python3 -I export_data.py --bench /var/tmp/locomo-bench --bench-p3 /var/tmp/locomo-bench-p3 --out ../data"""

import argparse
import json
import re
from collections import Counter
from pathlib import Path

# Post 1 publishes stage "full" for every arm except OpenClaw, whose rows come from the sandboxed rerun "full-iso2".
POST1 = {"full": lambda arm: not arm.startswith("openclaw-"), "full-iso2": lambda arm: arm.startswith("openclaw-")}
# Post 3's runner flags these markers in tool-call arguments; these three mean the agent fetched the dataset.
P3_NET = ("curl", "wget", "http://", "https://", "git clone", "pip ", "locomo", "huggingface", "urllib", "requests")
P3_DATASET = ("locomo", "huggingface", "git clone")
CHUNK = re.compile(r"(r2)?(s\d+)-(conv-\d+)-\d+")


def cost_of(row):
    usage = row.get("usage") or {}
    for value in (usage.get("estimated_cost_usd"), row.get("cost_usd"), row.get("cost_usd_list_price")):
        if value is not None:
            return round(float(value), 6)
    return 0.0


def row_out(base, row, judged):
    calls = row.get("tool_calls")
    if isinstance(calls, int):
        # OpenClaw rows hold a call count and the distinct tool names, not one entry per call.
        count, tools = calls, sorted(row.get("tools") or [])
    else:
        names = Counter(str(t.get("name", "")) for t in calls or [] if isinstance(t, dict))
        count, tools = sum(names.values()), dict(sorted(names.items()))
    label = judged[row["id"]]
    return {**base, "conversation": row["conversation"], "id": row["id"], "category": row["category"],
            "answer": row["answer"], "label": label["label"], "correct": label["correct"],
            "sessions_cited": row.get("sessions_cited") or [], "seconds": row.get("seconds"),
            "cost_usd": cost_of(row), "tool_calls": count, "tools": tools}


def labels(chunk):
    return {r["id"]: r for r in json.loads((chunk / "judged.json").read_text())["rows"]}


def post1(bench):
    network = {(r["stage"], r["arm"], r["setup"], r["run"], r["id"]): r["kind"]
               for r in json.loads((bench / "runs/integrity/network.json").read_text())}
    for stage, keep in POST1.items():
        for answers in sorted((bench / "runs" / stage).glob("*/*/*/*/answers.json")):
            arm, setup, run, _ = answers.parent.relative_to(bench / "runs" / stage).parts
            if not keep(arm):
                continue
            judged = labels(answers.parent)
            for row in json.loads(answers.read_text()):
                base = {"stage": stage, "arm": arm, "setup": setup, "run": run}
                yield {**row_out(base, row, judged), "network": network.get((stage, arm, setup, run, row["id"]))}


def post3(bench_p3):
    for answers in sorted((bench_p3 / "runs").glob("*/*/answers.json")):
        match = CHUNK.fullmatch(answers.parent.name)
        if not match:
            continue
        repeat, stage, _ = match.groups()
        judged = labels(answers.parent)
        for row in json.loads(answers.read_text()):
            text = " ".join(str(c.get("arguments", "")) for c in row.get("tool_calls") or []).lower()
            hits = [m for m in P3_NET if m in text]
            kind = "dataset" if any(m in hits for m in P3_DATASET) else "web" if hits else None
            base = {"model": answers.parent.parent.name, "run": "r2" if repeat else "r1", "stage": stage}
            yield {**row_out(base, row, judged), "network": kind}


def write(path, rows):
    rows = list(rows)
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows))
    print(path, len(rows))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bench", type=Path, required=True)
    parser.add_argument("--bench-p3", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    write(args.out / "post1-answers.jsonl", post1(args.bench))
    write(args.out / "post3-answers.jsonl", post3(args.bench_p3))


if __name__ == "__main__":
    main()
