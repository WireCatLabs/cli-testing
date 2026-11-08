#!/usr/bin/env python3
"""LifeBench_eval's LLM judge on the answers openclaw_lifebench.py wrote, and the cost estimate.

    python3 -I judge.py judge --fixture <pilot> --run memo=<answer dir> [--run files=<dir>] --output <judge.json>
    python3 -I judge.py validate --items judge-validation.json --output <validation.json>
    python3 -I judge.py estimate --questions 50 --agents memo,files [--smoke <answer dir>] [--judged <judge.json>]

The default is LifeBench_eval's own judge (master 7f16350): deepseek-chat through OpenRouter
(config/datasets/lifebench.yaml:18-23, model from LLM_MODEL, llm_judge.py:140 falls back to deepseek-chat), at
temperature 0 (:339), three votes (yaml :23), CORRECT when correct votes * 2 >= votes (:259-260), up to three attempts
per vote and a failed vote counts as WRONG (:342-410), the JSON parsed from a code block, then the outer braces, then
a label regex (:412-443). Unlike it, failed votes are counted apart, so an API outage does not read as wrong answers.

judge-prompt-zh.txt is its SYSTEM_PROMPT and USER_PROMPT_TEMPLATE (:64-130) word for word, read out of the source with
ast, with one change: "被评内容为中文" (the content is Chinese) became "被评内容为英文" (the content is English).
LifeBench_eval has no English prompt. judge-prompt.txt is an English translation, used only with --prompt.

--provider anthropic runs Claude Haiku 5.5 instead (the first judge of this pilot, kept for an agreement check):
Haiku 5.5 refuses a non-default temperature and always thinks, so it runs at effort low, and a refusal or a reply
cut at max_tokens is a failed vote.

Keys are keyring entries, read in-process and never printed: openrouter/AIX125, or cli-memo/anthropic.
"""

import argparse
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
ORDER = ("Single_hop", "Multi_hop", "Temporal", "Pattern_recognition(Non-declarative)", "Knowledge_update", "Causal",
         "Conflict", "Hidden_info", "Unanswerable")
# Anthropic's price table, cached 2026-10-06 in the claude-api skill: USD per million tokens, input and output
# (thinking is billed as output). Haiku 5.5's price holds for prompts up to 100K tokens; a judge prompt is ~2K.
# OpenRouter's model list, read 2026-11-08: deepseek/deepseek-chat (DeepSeek V3) $0.32 in, $0.89 out.
PRICES = {"claude-haiku-5-5": (0.10, 0.50), "deepseek/deepseek-chat": (0.32, 0.89)}
PROVIDERS = {"openrouter": {"model": "deepseek/deepseek-chat", "key": ("openrouter", "AIX125"),
                            "prompt": "judge-prompt-zh.txt"},
             "anthropic": {"model": "claude-haiku-5-5", "key": ("cli-memo", "anthropic"),
                           "prompt": "judge-prompt-zh.txt"}}
OPENROUTER = "https://openrouter.ai/api/v1/chat/completions"
# Before any smoke run: v3 OpenClaw + memo averaged $0.038 to $0.044 a question (max $0.12); LifeBench records are
# longer and its questions multi-part, so three times that until a smoke run measures it.
FALLBACK_AGENT_USD = 0.13
FALLBACK_JUDGE_TOKENS = (2200, 250)


def prompts(name):
    text = (HERE / name).read_text()
    parts = dict(re.findall(r"=== (.+?) ===\n(.*?)(?=\n=== |\Z)", text, re.DOTALL))
    return parts["system"].strip(), parts["user"].strip(), parts["no score points"].strip()


def api_key(service, account):
    done = subprocess.run(["secret-tool", "lookup", "service", service, "account", account], capture_output=True,
                          text=True, check=False)
    if done.returncode != 0 or not done.stdout.strip():
        raise SystemExit(f"no keyring entry for service {service!r} account {account!r}")
    return done.stdout.strip()


def parse(content):
    found = re.search(r"```(?:json)?\s*(\{.*\})\s*```", content, re.DOTALL)
    if found:
        try:
            return json.loads(found.group(1))
        except json.JSONDecodeError:
            pass
    start, end = content.find("{"), content.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(content[start:end + 1])
        except json.JSONDecodeError:
            pass
    label = re.search(r'"?label"?\s*:\s*"?(CORRECT|WRONG)"?', content, re.IGNORECASE)
    if not label:
        return None
    hits = [v.lower() == "true" for v in re.findall(r'"?hit"?\s*:\s*(true|false)', content, re.IGNORECASE)]
    return {"label": label.group(1).upper(), "point_hits": [{"hit": h} for h in hits],
            "reasoning": "(regex-recovered: malformed JSON)"}


def client_for(args):
    key = api_key(*PROVIDERS[args.provider]["key"])
    if args.provider == "openrouter":
        return key
    import anthropic

    return anthropic.Anthropic(api_key=key, max_retries=2, timeout=120)


def vote(args, client, system, user):
    return (vote_openrouter if args.provider == "openrouter" else vote_anthropic)(args, client, system, user)


def vote_openrouter(args, key, system, user):
    """As llm_judge.py:328-410: system + user message, temperature 0, three attempts; cost is OpenRouter's billed one."""
    usage = {"prompt_tokens": 0, "completion_tokens": 0, "cost": 0.0}
    body = json.dumps({"model": args.model, "temperature": 0,
                       "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]})
    reason = ""
    for attempt in range(1, 4):
        request = urllib.request.Request(OPENROUTER, data=body.encode(), method="POST",
                                         headers={"Content-Type": "application/json",
                                                  "Authorization": f"Bearer {key}"})
        try:
            with urllib.request.urlopen(request, timeout=180) as reply:
                data = json.loads(reply.read())
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            reason = f"{type(error).__name__} {getattr(error, 'code', '')}".strip()
            time.sleep(2 ** attempt)
            continue
        for field in ("prompt_tokens", "completion_tokens", "cost"):
            usage[field] += (data.get("usage") or {}).get(field, 0)
        content = ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
        parsed = parse(content) if content else None
        label = str((parsed or {}).get("label", "")).strip().upper()
        if label in ("CORRECT", "WRONG"):
            hits = parsed.get("point_hits") if isinstance(parsed.get("point_hits"), list) else []
            return label, hits, str(parsed.get("reasoning", "")), usage
        reason = "empty, unparseable or bad label"
        time.sleep(attempt)
    return None, [], reason, usage


def vote_anthropic(args, client, system, user):
    """One vote: (label or None, point_hits, reasoning, usage)."""
    import anthropic

    usage = {"prompt_tokens": 0, "completion_tokens": 0}
    reason = ""
    for attempt in range(1, 4):
        try:
            reply = client.messages.create(model=args.model, max_tokens=4000, system=system,
                                           output_config={"effort": args.effort},
                                           messages=[{"role": "user", "content": user}])
        except (anthropic.APIConnectionError, anthropic.RateLimitError, anthropic.InternalServerError) as error:
            reason = type(error).__name__
            time.sleep(2 ** attempt)
            continue
        usage["prompt_tokens"] += reply.usage.input_tokens
        usage["completion_tokens"] += reply.usage.output_tokens
        if reply.stop_reason in ("refusal", "max_tokens"):
            reason = f"stop_reason {reply.stop_reason}"
            continue
        content = "".join(block.text for block in reply.content if block.type == "text")
        parsed = parse(content) if content else None
        label = str((parsed or {}).get("label", "")).strip().upper()
        if label in ("CORRECT", "WRONG"):
            hits = parsed.get("point_hits") if isinstance(parsed.get("point_hits"), list) else []
            return label, hits, str(parsed.get("reasoning", "")), usage
        reason = "empty, unparseable or bad label"
        time.sleep(attempt)
    return None, [], reason, usage


def judged_answer(row):
    """The parsed answer; the reply's own text when it had no JSON, so a broken reply is never read as a refusal."""
    if row.get("problem"):
        return (row.get("final_text") or "").strip() or "(no answer)"
    return row["answer"]


def judge_one(args, client, templates, truth, generated):
    system, user_template, no_points = templates
    points = truth["score_points"]
    rendered = "\n".join(f"    {i}. {(p or {}).get('description', '')}" for i, p in enumerate(points, 1)) or no_points
    user = user_template.format(question=truth["question"], ask_time=truth["ask_time"] or "（未提供）",
                                question_types=", ".join(truth["categories"]) or "（未标注）",
                                reference_answer=truth["answer"],
                                score_points=rendered, generated_answer=generated)
    votes = [vote(args, client, system, user) for _ in range(args.votes)]
    correct = sum(label == "CORRECT" for label, *_ in votes)
    is_correct = correct * 2 >= args.votes
    hits = []
    for index, point in enumerate(points):
        count = sum(bool(h[index].get("hit") if isinstance(h[index], dict) else h[index])
                    for _, h, _, _ in votes if index < len(h))
        hits.append({"description": point.get("description", ""), "hit": count * 2 >= args.votes})
    total = sum(float(p.get("score") or 0) for p in points)
    weighted = sum(float(p.get("score") or 0) for p, h in zip(points, hits) if h["hit"]) / total if total else None
    representative = next((v for v in votes if (v[0] == "CORRECT") == is_correct), votes[0])
    return {"is_correct": is_correct, "votes": {"correct": correct, "wrong": sum(v[0] == "WRONG" for v in votes),
                                                "failed": sum(v[0] is None for v in votes)},
            "weighted_score": weighted, "point_hits": hits, "reasoning": representative[2],
            "usage": {f: sum(v[3].get(f, 0) for v in votes) for f in ("prompt_tokens", "completion_tokens", "cost")}}


def table(results, oracle):
    groups = defaultdict(list)
    for row in results:
        groups["All"].append(row)
        for category in oracle[row["id"]]["categories"]:
            groups[category].append(row)
    lines = ["| Category | Questions | Correct | Accuracy | Weighted score |", "| --- | ---: | ---: | ---: | ---: |"]
    for name in ("All", *ORDER):
        rows = groups.get(name)
        if not rows:
            continue
        scored = [r["weighted_score"] for r in rows if r["weighted_score"] is not None]
        weighted = f"{sum(scored) / len(scored):.2f}" if scored else "-"
        right = sum(r["is_correct"] for r in rows)
        lines.append(f"| {name} | {len(rows)} | {right} | {right / len(rows):.2f} | {weighted} |")
    return "\n".join(lines)


def run_judge(args):
    oracle = {row["id"]: row for row in json.loads((args.fixture / "oracle.json").read_text())}
    if args.output.exists():
        raise SystemExit(f"{args.output} exists")
    client = client_for(args)
    templates = prompts(args.prompt)
    report = {"judge_model": args.model, "provider": args.provider, "votes": args.votes, "prompt": args.prompt,
              "runs": {}}
    if args.provider == "anthropic":
        report["effort"] = args.effort
    price_in, price_out = PRICES.get(args.model, (args.price_in, args.price_out))
    for spec in args.run:
        name, folder = spec.split("=", 1)
        rows = json.loads((Path(folder).expanduser() / "per-question.json").read_text())
        def one(row, name=name):
            truth = oracle[row["id"]]
            verdict = judge_one(args, client, templates, truth, judged_answer(row))
            print(f"{name} {row['id']} {'CORRECT' if verdict['is_correct'] else 'WRONG'} {verdict['votes']}",
                  file=sys.stderr)
            return {"id": row["id"], "categories": truth["categories"], "question": truth["question"],
                    "reference": truth["answer"], "answer": judged_answer(row),
                    "agent_usd": row.get("list_price_usd_estimate"), **verdict}

        with ThreadPoolExecutor(args.workers) as pool:
            results = list(pool.map(one, rows))
        tokens = {f: sum(r["usage"][f] for r in results) for f in ("prompt_tokens", "completion_tokens")}
        judge_usd = (tokens["prompt_tokens"] * price_in + tokens["completion_tokens"] * price_out) / 1e6
        agent_usd = sum(r["agent_usd"] or 0 for r in results)
        billed = sum(r["usage"].get("cost", 0) for r in results)
        report["runs"][name] = {"questions": len(results), "judge_tokens": tokens, "judge_usd": judge_usd,
                                "judge_usd_billed": billed,
                                "agent_usd": agent_usd, "failed_votes": sum(r["votes"]["failed"] for r in results),
                                "results": results}
        print(f"\n{name}: {len(results)} questions, agent ${agent_usd:.4f}, judge ${judge_usd:.4f} "
              f"({tokens['prompt_tokens']} in, {tokens['completion_tokens']} out), "
              f"failed votes {report['runs'][name]['failed_votes']}\n")
        print(table(results, oracle))
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")


def run_estimate(args):
    agents = [a for a in args.agents.split(",") if a]
    per_agent, source = FALLBACK_AGENT_USD, "fallback, no smoke run measured"
    if args.smoke:
        costs = [r["list_price_usd_estimate"] for s in args.smoke
                 for r in json.loads((Path(s) / "per-question.json").read_text())
                 if r.get("list_price_usd_estimate") is not None]
        if costs:
            per_agent, source = sum(costs) / len(costs), f"mean of {len(costs)} smoke question(s)"
    tokens_in, tokens_out = FALLBACK_JUDGE_TOKENS
    if args.judged:
        runs = json.loads(Path(args.judged).read_text())["runs"].values()
        count = sum(r["questions"] for r in runs) * args.votes
        if count:
            tokens_in = sum(r["judge_tokens"]["prompt_tokens"] for r in runs) / count
            tokens_out = sum(r["judge_tokens"]["completion_tokens"] for r in runs) / count
    price_in, price_out = PRICES.get(args.model, (args.price_in, args.price_out))
    judge = args.questions * len(agents) * args.votes * (tokens_in * price_in + tokens_out * price_out) / 1e6
    answers = args.questions * len(agents) * per_agent
    # Agent cost per question varies two to three times between questions (v3: mean $0.04, max $0.12).
    print(f"Estimate: {args.questions} questions x {len(agents)} agent(s) ({', '.join(agents)})")
    print(f"  answers ${answers:.2f} at ${per_agent:.3f} a question ({source}); could be up to x2")
    print(f"  judge   ${judge:.2f} ({args.model}, {args.votes} votes, ~{tokens_in:.0f} in / {tokens_out:.0f} out "
          "tokens a vote)")
    print(f"  total   ${answers + judge:.2f}")


def run_validate(args):
    """Hand-written answers with the label a careful reader gives them: does the judge agree?"""
    if args.output.exists():
        raise SystemExit(f"{args.output} exists")
    items = json.loads(args.items.read_text())
    client = client_for(args)
    templates = prompts(args.prompt)
    rows = []
    for item in items:
        verdict = judge_one(args, client, templates, item, item["generated"])
        rows.append({"id": item["id"], "kind": item["kind"], "expected": item["expected"],
                     "judged": "CORRECT" if verdict["is_correct"] else "WRONG", **verdict})
        mark = "ok" if rows[-1]["judged"] == item["expected"] else "DISAGREES"
        print(f"{item['id']} {item['kind']}: expected {item['expected']}, judged {rows[-1]['judged']} "
              f"{verdict['votes']} {mark}", file=sys.stderr)
    tokens = {f: sum(r["usage"][f] for r in rows) for f in ("prompt_tokens", "completion_tokens")}
    price_in, price_out = PRICES.get(args.model, (args.price_in, args.price_out))
    report = {"judge_model": args.model, "provider": args.provider, "prompt": args.prompt, "votes": args.votes,
              "items": len(rows),
              "agree": sum(r["judged"] == r["expected"] for r in rows),
              "split_votes": sum(0 < r["votes"]["correct"] < args.votes for r in rows),
              "failed_votes": sum(r["votes"]["failed"] for r in rows), "judge_tokens": tokens,
              "judge_usd": (tokens["prompt_tokens"] * price_in + tokens["completion_tokens"] * price_out) / 1e6,
              "results": rows}
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k != "results"}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("judge", "validate", "estimate"):
        part = sub.add_parser(name)
        part.add_argument("--provider", default="openrouter", choices=sorted(PROVIDERS))
        part.add_argument("--model", help="default: deepseek/deepseek-chat, or claude-haiku-5-5 with anthropic")
        part.add_argument("--prompt", help="default judge-prompt-zh.txt; judge-prompt.txt is the English copy")
        part.add_argument("--effort", default="low", choices=("low", "medium", "high"), help="anthropic only")
        part.add_argument("--votes", type=int, default=3)
        part.add_argument("--price-in", type=float, default=0.32, help="USD per million input tokens, unknown model")
        part.add_argument("--price-out", type=float, default=0.89, help="USD per million output tokens")
    for name in ("judge", "validate"):
        part = sub.choices[name]
        part.add_argument("--output", type=Path, required=True)
    judge = sub.choices["judge"]
    judge.add_argument("--fixture", type=Path, required=True)
    judge.add_argument("--run", action="append", required=True, metavar="NAME=DIR")
    judge.add_argument("--workers", type=int, default=1, help="questions judged at once; votes stay in order")
    sub.choices["validate"].add_argument("--items", type=Path, required=True)
    estimate = sub.choices["estimate"]
    estimate.add_argument("--questions", type=int, required=True)
    estimate.add_argument("--agents", required=True)
    estimate.add_argument("--smoke", action="append", help="answer dirs whose measured cost replaces the fallback")
    estimate.add_argument("--judged", help="a judge.json whose tokens replace the fallback")
    args = parser.parse_args()
    args.model = args.model or PROVIDERS[args.provider]["model"]
    args.prompt = args.prompt or PROVIDERS[args.provider]["prompt"]
    if args.votes < 1 or args.votes % 2 == 0:
        raise SystemExit("--votes must be odd")
    {"judge": run_judge, "validate": run_validate, "estimate": run_estimate}[args.command](args)


if __name__ == "__main__":
    main()
