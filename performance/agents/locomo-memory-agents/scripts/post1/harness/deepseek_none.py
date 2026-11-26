#!/usr/bin/env python3
"""Control arm: a DeepSeek model with no memory and no tools, one plain API call per question, the same prompt as
the agents with the 'answer only if you already know' line of the Claude Code control."""

import argparse
import json
import os
import time
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

from claude_locomo import WHERE
from hermes_locomo import FIXTURES, PROMPT, ROOT, sessions_cited
from hermes_runner import parse

# usage_pricing.py in Hermes 0.23.3, DeepSeek's pricing page snapshot of 2026-09-10 (off-peak, USD per 1M tokens).
PRICES = {"deepseek-flash": (0.15, 0.60, 0.003), "deepseek-v4-pro": (0.66, 1.98, 0.022)}


def ask(model, prompt):
    body = {"model": model, "messages": [{"role": "user", "content": prompt}]}
    req = urllib.request.Request("https://api.deepseek.com/chat/completions", data=json.dumps(body).encode(),
                                 headers={"Authorization": "Bearer " + os.environ["DEEPSEEK_API_KEY"],
                                          "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as reply:
        return json.load(reply)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--questions", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model", default="deepseek-flash")
    args = parser.parse_args()
    questions = {q["id"]: q for q in json.loads((ROOT / "questions.json").read_text())["questions"]}
    args.output.mkdir(parents=True, exist_ok=False)
    rows = []
    for qid in args.questions.split(","):
        q = questions[qid]
        manifest = json.loads((FIXTURES / q["conversation"] / "manifest.json").read_text())
        prompt = PROMPT.format(a=manifest["speakers"]["a"], b=manifest["speakers"]["b"], where=WHERE["none"],
                               question=q["question"])
        started = time.perf_counter()
        data = ask(args.model, prompt)
        usage = data.get("usage", {})
        cached = usage.get("prompt_cache_hit_tokens", 0)
        price_in, price_out, price_cache = PRICES[args.model]
        cost = ((usage.get("prompt_tokens", 0) - cached) * price_in + cached * price_cache
                + usage.get("completion_tokens", 0) * price_out) / 1e6
        reply = parse(data["choices"][0]["message"].get("content") or "")
        rows.append({"id": qid, "conversation": q["conversation"], "category": q["category_name"],
                     "question": q["question"], "gold": q["answer"], "answer": (reply or {}).get("answer", ""),
                     "sessions_cited": sessions_cited(reply), "seconds": round(time.perf_counter() - started, 1),
                     "usage": {**usage, "estimated_cost_usd": cost}, "tool_calls": []})
    (args.output / "answers.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
    (args.output / "run.json").write_text(json.dumps({"agent": "deepseek-api", "setup": "none", "model": args.model,
                                                      "date": datetime.now(UTC).isoformat(timespec="seconds")})
                                          + "\n")


if __name__ == "__main__":
    main()
