#!/usr/bin/env python3
"""Post 3 table: per model, from the status CSV (latest row per id), the judged chunks and the spend CSV; plus post 1's
Hermes + WireCat reference rows from copies of its answers in /var/tmp/locomo-bench-p3/ref."""

import csv
import json
import re
import statistics
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path("/var/tmp/locomo-bench-p3")
QUESTIONS = {q["id"]: q for q in json.loads((ROOT / "questions.json").read_text())["questions"]}
P1_NETWORK = Path("/var/tmp/locomo-bench/runs/integrity/network.json")
SUBSET = set()  # filled in main: the questions Grok answered


def evidence_sessions(q):
    return {int(e.split(":")[0].lstrip("D")) for e in q["evidence"] if re.fullmatch(r"D\d+:\d+", e)}


def ours():
    with (ROOT / "runs/status.csv").open() as handle:
        latest = {row["id"]: row for row in csv.DictReader(handle)}
    spend = defaultdict(float)
    with (ROOT / "runs/spend.csv").open() as handle:
        for row in csv.DictReader(handle):
            spend[row["model"]] += float(row["real_usd"])
    models = defaultdict(list)
    for key, row in latest.items():
        model, qid = key.split("|")
        models[model].append((qid, row))
    table = []
    for model, rows in models.items():
        n = correct = cited = malformed = failed = malformed_q = failed_q = no_memo = errors = net = 0
        seconds, est, example = [], 0.0, None
        sub_n = sub_correct = 0
        for qid, row in rows:
            d = json.loads(row["detail"])
            n += 1
            if row["status"] == "error":
                errors += 1
                continue
            hit = bool(d.get("net")) and any(m in d["net"] for m in ("locomo", "huggingface", "git clone"))
            net += hit
            correct += 0 if hit else int(d.get("correct") or 0)
            if qid in SUBSET:
                sub_n += 1
                sub_correct += 0 if hit else int(d.get("correct") or 0)
            cited += bool(set(d.get("cited") or []) & evidence_sessions(QUESTIONS[qid]))
            malformed += d.get("malformed", 0)
            failed += d.get("failed", 0)
            malformed_q += bool(d.get("malformed"))
            failed_q += bool(d.get("failed"))
            seconds.append(d.get("seconds") or 0)
            est += d.get("est_usd") or 0
            chunk = json.loads((Path(d["dir"]) / "answers.json").read_text())
            calls = next((a["tool_calls"] for a in chunk if a["id"] == qid), [])
            no_memo += not any("memo " in str(c.get("arguments", "")) for c in calls)
        table.append({"model": model, "questions": n, "correct": correct, "cited": cited, "malformed_calls": malformed,
                      "malformed_questions": malformed_q, "failed_calls": failed, "failed_questions": failed_q,
                      "no_memo_call": no_memo, "harness_errors": errors, "dataset_fetch": net,
                      "median_s": statistics.median(seconds) if seconds else None,
                      "real_usd": round(spend[model], 4), "est_usd": round(est, 4),
                      "subset": [sub_correct, sub_n]})
    return table


def reference():
    network = {(r["arm"], r["setup"], r["run"], r["id"]): r["kind"]
               for r in (json.loads(P1_NETWORK.read_text()) if P1_NETWORK.exists() else [])}
    table = []
    for run_dir in sorted((ROOT / "ref").glob("*/wirecat/*")):
        arm, run = run_dir.parts[-3], run_dir.parts[-1]
        n = correct = cited = sub_n = sub_correct = 0
        seconds, cost = [], 0.0
        for chunk in sorted(run_dir.glob("conv-*")):
            labels = {r["id"]: r["correct"] for r in json.loads((chunk / "judged.json").read_text())["rows"]}
            for row in json.loads((chunk / "answers.json").read_text()):
                kind = network.get((arm, "wirecat", run, row["id"]))
                n += 1
                correct += 0 if kind == "dataset" else labels[row["id"]]
                if row["id"] in SUBSET:
                    sub_n += 1
                    sub_correct += 0 if kind == "dataset" else labels[row["id"]]
                cited += bool(set(row.get("sessions_cited") or []) & evidence_sessions(QUESTIONS[row["id"]]))
                seconds.append(row.get("seconds") or 0)
                usage = row.get("usage") or {}
                cost += float(usage.get("estimated_cost_usd") or row.get("cost_usd") or row.get("cost_usd_list_price")
                              or 0)
        table.append({"arm": arm, "run": run, "questions": n, "correct": correct, "cited": cited,
                      "median_s": statistics.median(seconds), "cost_usd": round(cost, 4),
                      "subset": [sub_correct, sub_n]})
    return table


if __name__ == "__main__":
    with (ROOT / "runs/status.csv").open() as handle:
        SUBSET.update(r["id"].split("|")[1] for r in csv.DictReader(handle)
                      if r["id"].startswith("x-ai/grok-4.7|") and r["status"] != "error")
    result = {"ours": ours() if (ROOT / "runs/status.csv").exists() else [], "reference": reference()}
    (ROOT / "runs/summary.json").write_text(json.dumps(result, indent=2) + "\n")
    for row in result["ours"] + result["reference"]:
        print(json.dumps(row))
    sys.exit(0)
