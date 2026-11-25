#!/usr/bin/env python3
"""Post 3 runner: one model through post 1's Hermes + WireCat arm over a stage's questions, one conversation chunk
at a time (post 1's unit: built-in memory is reset per chunk). Each chunk is judged with post 1's judge, and every
question gets one row in the status CSV, flushed at once. A restart skips questions the CSV already holds.
Real spend comes from OpenRouter's credits endpoint before and after each chunk; the run stops at the cap."""

import argparse
import csv
import json
import os
import shutil
import subprocess
import sys
import time
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

import orkey

ROOT = Path("/var/tmp/locomo-bench-p3")
HARNESS = ROOT / "harness"
# A repeat run (P3_RUN=r2) keeps its own status, spend and budget, so run 1's answers are neither skipped nor redone.
RUN = os.environ.get("P3_RUN", "")
SUFFIX = f"-{RUN}" if RUN else ""
STATUS = ROOT / f"runs/status{SUFFIX}.csv"
SPEND = ROOT / f"runs/spend{SUFFIX}.csv"
BUDGET = ROOT / f"runs/budget{SUFFIX}.json"
QUESTIONS = ROOT / "questions.json"
# Post 1's judge, which marks an empty answer wrong; the original run used a copy without that rule.
JUDGE = Path("/var/tmp/locomo-bench/scripts/judge.py")
CAP_USD = float(os.environ.get("P3_CAP", "15.0"))
# Stage 2 and 5 are post 1's stage-2 questions (the first two, then all five); stage 50 is every question.
P1_STAGE2 = ["conv-41-c1-1", "conv-42-c2-1", "conv-43-c3-1", "conv-44-c4-1", "conv-47-c2-1"]
FIELDS = ["id", "status", "detail", "time"]


def stage_ids(stage, questions):
    if stage == 2:
        return P1_STAGE2[:2]
    if stage == 5:
        return P1_STAGE2
    if stage == 25:
        # The cut for an expensive model: the first 25 of the fixed question order, stage-5 questions kept.
        order = P1_STAGE2 + [q["id"] for q in questions if q["id"] not in P1_STAGE2]
        return order[:25]
    return [q["id"] for q in questions]


def slug(model):
    return model.replace("/", "_")


def done_rows():
    if not STATUS.exists():
        return {}
    with STATUS.open() as handle:
        # The latest row of an id wins; an "error" row (harness failure) is run again.
        rows = {row["id"]: row for row in csv.DictReader(handle)}
    return {key: row for key, row in rows.items() if row["status"] in ("ok", "no_answer")}


def append(path, fields, row):
    new = not path.exists()
    with path.open("a", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        if new:
            writer.writeheader()
        writer.writerow(row)
        handle.flush()


def spent_so_far():
    _, used = orkey.credits()
    budget = json.loads(BUDGET.read_text())
    return used - budget["baseline_usage"], used


def home_free_gb():
    # The run writes only under /var/tmp/locomo-bench-p3 (HOME, HERMES_HOME, memo stores), so that disk is the one to watch.
    return shutil.disk_usage("/var/tmp/locomo-bench-p3").free / 1e9


NET = ("curl", "wget", "http://", "https://", "git clone", "pip ", "locomo", "huggingface", "urllib", "requests")


def net_use(row):
    """Post 1's rule: an agent that fetched the LoCoMo dataset read the gold answers; its answer counts as wrong."""
    text = " ".join(str(c.get("arguments", "")) for c in row.get("tool_calls") or []).lower()
    return [m for m in NET if m in text]


def tool_problems(row):
    """Calls the model sent that Hermes could not run as sent, and calls that ran and failed."""
    malformed, failed = [], []
    for call in row.get("tool_calls") or []:
        if "raw" in call or call.get("name") in (None, "", "invalid_tool_call"):
            malformed.append(call)
            continue
        try:
            json.loads(call.get("arguments") or "{}")
        except json.JSONDecodeError:
            if len(call.get("arguments") or "") < 300:
                malformed.append(call)
    for result in row.get("tool_results") or []:
        head = result.get("head") or ""
        if "does not exist. Available tools" in head or "Invalid JSON" in head or "Skipped: another tool call" in head:
            malformed.append(result)
        elif (result.get("exit_code") not in (None, 0)) or result.get("error"):
            failed.append(result)
    return malformed, failed


LOGS = ROOT / "bench/hermes/wirecat/hermes-home/logs"
LOG_MARKERS = ("Unknown tool", "Auto-repaired", "Invalid JSON", "Truncated tool", "Max retries", "invalid tool call",
               "does not exist. Available tools")


def log_sizes():
    return {name: (LOGS / name).stat().st_size if (LOGS / name).exists() else 0
            for name in ("agent.log", "errors.log", "gateway.log")}


def log_slice(before, out):
    """The Hermes log lines a chunk wrote that name a bad tool call (the shared process logs here)."""
    hits = []
    for name, start in before.items():
        path = LOGS / name
        if not path.exists():
            continue
        with path.open("rb") as handle:
            handle.seek(start)
            text = handle.read().decode("utf-8", "replace")
        hits += [f"{name}: {line}" for line in text.splitlines() if any(m in line for m in LOG_MARKERS)]
    (out / "tool-log-hits.txt").write_text("\n".join(hits) + ("\n" if hits else ""))
    return hits


def run_chunk(model, conv, ids, out, timeout):
    command = ["python3", "hermes_locomo.py", "answer", "--config", "wirecat", "--questions", ",".join(ids),
               "--run", "p3", "--output", str(out), "--model", model, "--provider", "openrouter",
               "--timeout", str(timeout)]
    process = subprocess.Popen(command, cwd=HARNESS, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    log = []
    for line in process.stdout:
        log.append(line)
        print("   ", line.rstrip()[:240], flush=True)
    process.wait()
    (out.parent / f"{out.name}.log").write_text("".join(log)[-20000:])
    return process.returncode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True)
    parser.add_argument("--stage", type=int, choices=[2, 5, 25, 50], required=True)
    parser.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args()
    print(f"status CSV: {STATUS}\nspend CSV: {SPEND}", flush=True)
    questions = json.loads(QUESTIONS.read_text())["questions"]
    by_id = {q["id"]: q for q in questions}
    if not BUDGET.exists():
        _, used = orkey.credits()
        BUDGET.write_text(json.dumps({"baseline_usage": used, "at": datetime.now(UTC).isoformat()}) + "\n")
    done = done_rows()
    todo = [i for i in stage_ids(args.stage, questions) if f"{args.model}|{i}" not in done]
    chunks = defaultdict(list)
    for qid in todo:
        chunks[by_id[qid]["conversation"]].append(qid)
    print(f"{args.model} stage {args.stage}: {len(todo)} to run in {len(chunks)} chunks", flush=True)
    print(subprocess.run(["free", "-g"], capture_output=True, text=True).stdout, flush=True)
    print(subprocess.run(["df", "-h", "/home", "/var/tmp"], capture_output=True, text=True).stdout, flush=True)
    finished = 0
    largest = max([float(r["real_usd"]) for r in csv.DictReader(SPEND.open())] or [0]) if SPEND.exists() else 0.0
    for conv, ids in sorted(chunks.items()):
        while home_free_gb() < 3:
            print(f"/var/tmp has {home_free_gb():.1f} GB free; waiting", flush=True)
            time.sleep(300)
        before, used_before = spent_so_far()
        if before + largest >= CAP_USD:
            print(f"STOP: spent ${before:.3f}; with the largest chunk so far (${largest:.3f}) it would reach "
                  f"the ${CAP_USD} cap", flush=True)
            sys.exit(3)
        sizes = log_sizes()
        out = ROOT / "runs" / slug(args.model) / f"{RUN or ''}s{args.stage}-{conv}-{int(time.time())}"
        out.parent.mkdir(parents=True, exist_ok=True)
        started = time.time()
        code = run_chunk(args.model, conv, ids, out, args.timeout)
        answers = json.loads((out / "answers.json").read_text()) if (out / "answers.json").exists() else []
        judged = {}
        if answers:
            done_judge = subprocess.run(["python3", "-I", str(JUDGE), str(out)], capture_output=True, text=True)
            if done_judge.returncode == 0:
                judged = {r["id"]: r for r in json.loads((out / "judged.json").read_text())["rows"]}
            else:
                print("judge failed:", done_judge.stderr.strip()[-300:], flush=True)
        hits = log_slice(sizes, out) if out.exists() else []
        after, used_after = spent_so_far()
        largest = max(largest, used_after - used_before)
        append(SPEND, ["model", "stage", "conv", "questions", "usage_before", "usage_after", "real_usd",
                       "estimated_usd", "seconds", "time"],
               {"model": args.model, "stage": args.stage, "conv": conv, "questions": len(ids),
                "usage_before": f"{used_before:.6f}", "usage_after": f"{used_after:.6f}",
                "real_usd": f"{used_after - used_before:.6f}",
                "estimated_usd": f"{sum((a.get('usage') or {}).get('estimated_cost_usd') or 0 for a in answers):.6f}",
                "seconds": round(time.time() - started), "time": datetime.now(UTC).isoformat(timespec="seconds")})
        rows = {a["id"]: a for a in answers}
        for qid in ids:
            row = rows.get(qid)
            if row is None:
                status, detail = "error", {"reason": f"no answer row (runner exit {code})", "dir": str(out)}
            else:
                malformed, failed = tool_problems(row)
                usage = row.get("usage") or {}
                status = "ok" if row.get("exit") == 0 and row.get("answer") else "no_answer"
                detail = {"dir": str(out), "correct": (judged.get(qid) or {}).get("correct"),
                          "answer": row.get("answer"), "cited": row.get("sessions_cited"),
                          "tools": len(row.get("tool_calls") or []), "malformed": len(malformed),
                          "failed": len(failed), "seconds": row.get("seconds"), "exit": row.get("exit"),
                          "est_usd": usage.get("estimated_cost_usd"), "turn_exit": usage.get("turn_exit_reason"),
                          "oracle_seen": row.get("oracle_seen"), "chunk_log_hits": len(hits),
                          "net": net_use(row)}
            append(STATUS, FIELDS, {"id": f"{args.model}|{qid}", "status": status,
                                    "detail": json.dumps(detail, ensure_ascii=False),
                                    "time": datetime.now(UTC).isoformat(timespec="seconds")})
            finished += 1
        print(f"{args.model} {conv}: {len(ids)} done ({finished}/{len(todo)}), chunk ${after - before:.4f}, "
              f"total spent ${after:.3f}", flush=True)


if __name__ == "__main__":
    main()
