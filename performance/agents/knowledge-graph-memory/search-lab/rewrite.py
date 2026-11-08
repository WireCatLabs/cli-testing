"""Search-time question rewriting with a cheap model: paraphrases, a hypothetical record (HyDE), paraphrases that
turn relative dates into calendar dates, and the date range a question asks about. Every answer is cached, so a
rerun is never billed twice.

    uv run --with anthropic==2.6.0 python3 -I rewrite.py --v3 ~/.cache/wirecat-bench/kg-fixture-v3 \
        --v3-reworded ~/.cache/wirecat-bench/kg-fixture-v3-paraphrased \
        --lifebench ~/.cache/wirecat-bench/lifebench/fixtures/fenghaoran --cache cache/rewrites.json

The API key is read from the OS keyring (service cli-memo, account anthropic) inside this process and never printed.
"""

import argparse
import json
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import anthropic

MODEL = "claude-haiku-5-5"
PRICE_IN, PRICE_OUT = 0.10 / 1e6, 0.50 / 1e6

PROMPTS = {
    "mq": (
        "A person searches their own archive of chat messages, mails, notes, calendar entries and phone records.\n"
        "Rewrite the question below for that search. Write exactly three lines and nothing else:\n"
        "1. the question in other words\n"
        "2. the question in yet other words, as the record itself might phrase it\n"
        "3. keywords only: names, objects, and synonyms of the key terms, separated by spaces\n\n"
        "Question: {question}"
    ),
    "hyde": (
        "A person searches their own archive of chat messages, mails, notes, calendar entries and phone records.\n"
        "Write the one record from that archive that would answer the question below: one to three sentences, in the "
        "style of a real message or note, with plausible invented details where you do not know them. Write only the "
        "record.\n\nQuestion: {question}"
    ),
    "mqdate": (
        "A person searches their own archive of chat messages, mails, notes, calendar entries and phone records. "
        "Today is {as_of}.\n"
        "Rewrite the question below for that search. Replace every relative time (\"last week\", \"in January\", "
        "\"recently\") with calendar dates or months and the year. Write exactly three lines and nothing else:\n"
        "1. the question in other words, with dates made absolute\n"
        "2. the question as the record itself might phrase it\n"
        "3. keywords only: names, objects, synonyms, and the dates or months, separated by spaces\n\n"
        "Question: {question}"
    ),
    "range": (
        "Today is {as_of}. Does the question below ask about a specific time period (a day, a week, a month, a "
        "season, \"last week\", \"in January\")? If yes, write the period as two dates, start and end, in the form "
        "YYYY-MM-DD YYYY-MM-DD, using the year implied by today's date. If not, write none. Write only that.\n\n"
        "Question: {question}"
    ),
}


def api_key():
    return subprocess.run(["secret-tool", "lookup", "service", "cli-memo", "account", "anthropic"],
                          capture_output=True, text=True, check=True).stdout.strip()


def questions(args):
    out = []
    oracle = {r["id"]: r for r in json.loads((args.v3 / "oracle.json").read_text())}
    plain = json.loads((args.v3 / "queries.json").read_text())
    other = {q["id"]: q for q in json.loads((args.v3_reworded / "queries.json").read_text())}
    for q in plain:
        if oracle[q["id"]]["required_citations"]:
            out.append((q["question"], q["as_of"][:10]))
            if other[q["id"]]["question"] != q["question"]:
                out.append((other[q["id"]]["question"], q["as_of"][:10]))
    for q in json.loads((args.lifebench / "oracle.json").read_text()):
        if q["required_citations"]:
            out.append((q["question"], q["as_of"][:10]))
    return out


def key(kind, question, as_of):
    # 11 LifeBench questions repeat with another ask date, so the date-dependent kinds key on it.
    return f"{kind}\t{as_of if kind in ('mqdate', 'range') else ''}\t{question}"


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--v3", type=Path, required=True)
    parser.add_argument("--v3-reworded", type=Path, required=True)
    parser.add_argument("--lifebench", type=Path, required=True)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--kinds", default="mq,hyde,mqdate,range")
    parser.add_argument("--budget", type=float, default=1.0, help="stop before spending more dollars than this")
    args = parser.parse_args()
    cache = json.loads(args.cache.read_text()) if args.cache.exists() else {}
    todo = list(dict.fromkeys((kind, q, d) for kind in args.kinds.split(",") for q, d in questions(args)
                              if key(kind, q, d) not in cache))
    client = anthropic.Anthropic(api_key=api_key(), max_retries=4)
    lock = threading.Lock()
    spent = sum(v["cost"] for v in cache.values())

    def call(item):
        nonlocal spent
        kind, question, as_of = item
        if spent > args.budget:
            return
        started = time.time()
        response = client.messages.create(
            model=MODEL, max_tokens=400, thinking={"type": "disabled"}, output_config={"effort": "low"},
            messages=[{"role": "user", "content": PROMPTS[kind].format(question=question, as_of=as_of)}])
        ms = round((time.time() - started) * 1000)
        text = "".join(b.text for b in response.content if b.type == "text").strip()
        cost = response.usage.input_tokens * PRICE_IN + response.usage.output_tokens * PRICE_OUT
        with lock:
            spent += cost
            cache[key(kind, question, as_of)] = {"out": text, "stop": response.stop_reason, "ms": ms, "cost": cost,
                                                 "in": response.usage.input_tokens, "outtok": response.usage.output_tokens}

    with ThreadPoolExecutor(8) as pool:
        for i, _ in enumerate(pool.map(call, todo)):
            if i % 50 == 49:
                with lock:
                    args.cache.write_text(json.dumps(cache, ensure_ascii=False, indent=1))
    args.cache.write_text(json.dumps(cache, ensure_ascii=False, indent=1))
    by_kind = {}
    for k, v in cache.items():
        s = by_kind.setdefault(k.split("\t")[0], {"calls": 0, "cost": 0.0, "ms": []})
        s["calls"] += 1
        s["cost"] += v["cost"]
        s["ms"].append(v["ms"])
    for s in by_kind.values():
        s["ms"] = sorted(s["ms"])[len(s["ms"]) // 2]
        s["cost"] = round(s["cost"], 4)
    print(json.dumps({"new_calls": len(todo), "total_cost": round(spent, 4), "by_kind (median ms)": by_kind}))


if __name__ == "__main__":
    main()
