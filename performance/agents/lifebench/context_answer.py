#!/usr/bin/env python3
"""LifeBench's leaderboard flow on a pilot fixture: context once, one model call answers, no agent loop.

    python3 -I context_answer.py --fixture <pilot> --setup gold --output <dir>
    python3 -I context_answer.py --fixture <pilot> --setup "memo=<per-query.json>#<run label>" --output <dir>

answer-prompt-zh.txt is LifeBench_eval master 7f16350 src/utils/direct_evidence_baseline.py:73-93 word for word (the
gold-evidence baseline; each memory system's adapter has its own prompt, this is the one no system owns). Like it:
temperature 0, max_tokens 32768, three attempts (:150-183), "（无证据记录）" (no evidence records) when a question has
none (:127-130). Its default answer model is deepseek-v4-flash (:67), the leaderboard's base model; here
deepseek/deepseek-v4-flash on OpenRouter. Two differences: the ask time follows the question as "提问时间：<date>"
(the baseline passes no date; Mem0's adapter passes its last session date), and each record is this fixture's text
under "[E<n>] <source> | <time> | <title>", not LifeBench's own format_evidence.

memo: the hits of one run in a memo_clean.py per-query.json, mapped to records, first --top distinct ones (40 is
LifeBench_eval's config/systems/mem0.yaml search.top_k). gold: the question's evidence records.
--reuse <answers dir> copies that run's answer for every question whose context records are the same, in the same
order, and asks the model only for the others (rows say "reused": true). Each answer goes to
<output>/per-question.partial.jsonl as it finishes; a rerun with the same arguments skips the questions already there.
The key is the keyring entry openrouter/AIX125, read in-process and never printed.
"""

import argparse
import http.client
import json
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from judge import OPENROUTER, api_key

HERE = Path(__file__).resolve().parent
# OpenRouter returns each call's billed cost (usage.cost); its model list, read 2026-11-08, is the fallback:
# deepseek/deepseek-v4-flash $0.091 in, $0.182 out per million tokens.
PRICES = {"deepseek/deepseek-v4-flash": (0.091, 0.182)}


def prompts():
    text = (HERE / "answer-prompt-zh.txt").read_text()
    parts = dict(re.findall(r"=== (.+?) ===\n(.*?)(?=\n=== |\Z)", text, re.DOTALL))
    return parts["system"].strip(), parts["user"].strip(), parts["no evidence"].strip()


def render(records, ids, empty):
    if not ids:
        return empty
    return "\n".join(f"[E{i}] {records[rid]['kind']} | {records[rid]['timestamp'][:16]} | "
                     f"{records[rid].get('title') or ''}\n{records[rid]['text']}" for i, rid in enumerate(ids))


def contexts(args, oracle, records):
    if args.setup == "gold":
        return {qid: row["required_citations"] for qid, row in oracle.items()}, "gold evidence"
    _, spec = args.setup.split("=", 1)
    path, label = spec.split("#", 1)
    rows = {row["id"]: row for row in json.loads(Path(path).expanduser().read_text())[label]}
    chosen = {}
    for qid in oracle:
        distinct = [hit for hit in dict.fromkeys(rows[qid]["hits"]) if hit in records]
        chosen[qid] = distinct[:args.top]
    return chosen, f"{path}#{label}, first {args.top} distinct records"


def ask(key, model, system, user):
    body = json.dumps({"model": model, "temperature": 0, "max_tokens": 32768,
                       "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]})
    error = ""
    for attempt in range(1, 4):
        request = urllib.request.Request(OPENROUTER, data=body.encode(), method="POST",
                                         headers={"Content-Type": "application/json",
                                                  "Authorization": f"Bearer {key}"})
        try:
            with urllib.request.urlopen(request, timeout=600) as reply:
                data = json.loads(reply.read())
            return (((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "",
                    data.get("usage") or {}, None)
        except (OSError, http.client.HTTPException, json.JSONDecodeError) as caught:
            error = f"{type(caught).__name__} {getattr(caught, 'code', '')}".strip()
            time.sleep(2 ** attempt)
    return "", {}, error


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--setup", required=True, help="gold, or memo=<per-query.json>#<run label>")
    parser.add_argument("--top", type=int, default=40)
    parser.add_argument("--model", default="deepseek/deepseek-v4-flash")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--reuse", type=Path, help="an earlier answers dir; same context, same answer")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if (args.output / "per-question.json").exists():
        raise SystemExit(f"{args.output} is complete")
    args.output.mkdir(parents=True, exist_ok=True)
    records = {r["id"]: r for r in map(json.loads, (args.fixture / "corpus.jsonl").read_text().splitlines())}
    oracle = {row["id"]: row for row in json.loads((args.fixture / "oracle.json").read_text())}
    chosen, source = contexts(args, oracle, records)
    system, template, empty = prompts()
    key = api_key("openrouter", "AIX125")
    partial = args.output / "per-question.partial.jsonl"
    done = {r["id"]: r for r in map(json.loads, partial.read_text().splitlines())} if partial.exists() else {}
    earlier = ({r["id"]: r for r in json.loads((args.reuse / "per-question.json").read_text())} if args.reuse else {})
    lock = threading.Lock()

    def one(qid):
        if qid in done:
            return done[qid]
        old = earlier.get(qid)
        if old and old["context_records"] == chosen[qid] and not old["problem"]:
            row = {**old, "reused": True}
        else:
            row = {**answer_one(qid), "reused": False}
        with lock, partial.open("a") as sink:
            sink.write(json.dumps(row, ensure_ascii=False) + "\n")
        return row

    def answer_one(qid):
        truth = oracle[qid]
        question = f"{truth['question']}\n提问时间：{truth['ask_time']}"
        user = template.format(evidence=render(records, chosen[qid], empty), question=question)
        started = time.perf_counter()
        text, usage, error = ask(key, args.model, system, user)
        return {"id": qid, "exit": 0 if not error else "error", "seconds": round(time.perf_counter() - started, 2),
                "answer": text.strip() or "(no answer)", "problem": error or (None if text.strip() else "empty"),
                "final_text": text, "context_records": chosen[qid], "usage": usage,
                "list_price_usd_estimate": usage.get("cost", (usage.get("prompt_tokens", 0) * PRICES[args.model][0]
                                                     + usage.get("completion_tokens", 0) * PRICES[args.model][1]) / 1e6)}

    with ThreadPoolExecutor(args.workers) as pool:
        rows = list(pool.map(one, list(oracle)))
    (args.output / "per-question.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
    meta = {"setup": args.setup, "context": source, "model": args.model, "questions": len(rows),
            "reused_from": str(args.reuse) if args.reuse else None, "reused": sum(bool(r.get("reused")) for r in rows),
            "usd": sum(r["list_price_usd_estimate"] for r in rows if not r.get("reused")), "failures": [r["id"] for r in rows if r["problem"]],
            "records_per_question": sorted(len(r["context_records"]) for r in rows)}
    (args.output / "run.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(json.dumps({k: v for k, v in meta.items() if k != "records_per_question"}, indent=2))


if __name__ == "__main__":
    main()
