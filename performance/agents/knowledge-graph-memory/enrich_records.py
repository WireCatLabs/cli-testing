"""Write-time rewriting, as Honcho and Hindsight do it, but kept beside the record instead of replacing it.

A language model reads each record and adds two things under the original text: standalone facts (Honcho's
deriver: one fact each, names in full, relative dates made absolute; plus the status a Hindsight fact keeps:
confirmed, proposed, rejected or cancelled) and two questions a person might ask about it in other words
(doc2query). The record keeps its id and its own text, so a search hit still cites the record.

    python3 enrich_records.py --fixture ~/.cache/wirecat-bench/kg-fixture-v3 --output ~/.cache/wirecat-bench/kg-fixture-v3-enriched

The OpenAI key is read from the keyring entry openai/default inside this process and never printed. Only
synthetic records may go through it.
"""

import argparse
import json
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

MODEL = "gpt-4o-mini"
# gpt-4o-mini list prices per token, November 2026: https://developers.openai.com/api/docs/pricing
PRICE = {"input": 0.15e-6, "cached": 0.075e-6, "output": 0.60e-6}
BATCH = 20
PROMPT = """For each record below, write what a memory system would store about it.

For each record:
- facts: one to three standalone sentences, each stating exactly one fact. Name people, projects and things in
  full, leave no pronoun unresolved, and turn relative dates into absolute ones using the record's date. Keep
  amounts, dates and times exactly. Say whether the fact is confirmed, only proposed, rejected or cancelled.
  Small talk with no fact gets an empty list.
- questions: two questions a person might ask whose answer is in this record, in everyday words that differ
  from the record's own words (synonyms, plainer terms). Empty for small talk.

Reply with JSON only: {"records": [{"i": <index>, "facts": [...], "questions": [...]}]}, one entry per record.

Records:
"""


def api_key():
    return subprocess.run(["secret-tool", "lookup", "service", "openai", "account", "default"],
                          capture_output=True, text=True, check=True).stdout.strip()


def ask(key, batch):
    lines = "\n".join(f'[{i}] {record["timestamp"][:10]} ({record["kind"]}): {record["text"]}'
                      for i, record in enumerate(batch))
    body = {"model": MODEL, "temperature": 0, "response_format": {"type": "json_object"},
            "messages": [{"role": "user", "content": PROMPT + lines}]}
    request = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=json.dumps(body).encode(),
                                     headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(request, timeout=120) as reply:
                data = json.loads(reply.read())
            parsed = {row["i"]: row for row in json.loads(data["choices"][0]["message"]["content"])["records"]}
            return parsed, data["usage"]
        except (urllib.error.URLError, TimeoutError, KeyError, ValueError) as error:
            # The error text never holds the key: it is in a header, and urllib does not print headers.
            last = f"{type(error).__name__}: {str(error)[:200]}"
            time.sleep(2 ** attempt)
    raise RuntimeError(f"batch failed six times: {last}")


def enriched(record, row):
    facts = [str(fact) for fact in (row or {}).get("facts") or []]
    questions = [str(question) for question in (row or {}).get("questions") or []]
    extra = "".join(f"\nFact: {fact}" for fact in facts) + "".join(f"\nAsked as: {q}" for q in questions)
    return {**record, "text": record["text"] + extra}


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="new fixture folder; existing paths are refused")
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    records = [json.loads(line) for line in (args.fixture / "corpus.jsonl").read_text().splitlines()]
    batches = [records[start:start + BATCH] for start in range(0, len(records), BATCH)]
    key = api_key()
    started = time.time()
    with ThreadPoolExecutor(args.workers) as pool:
        replies = list(pool.map(lambda batch: ask(key, batch), batches))
    del key
    out, usage, missing = [], {"prompt_tokens": 0, "completion_tokens": 0, "cached_tokens": 0}, 0
    for batch, (rows, used) in zip(batches, replies, strict=True):
        usage["prompt_tokens"] += used["prompt_tokens"]
        usage["completion_tokens"] += used["completion_tokens"]
        usage["cached_tokens"] += (used.get("prompt_tokens_details") or {}).get("cached_tokens", 0)
        for i, record in enumerate(batch):
            missing += i not in rows
            out.append(enriched(record, rows.get(i)))
    (args.output / "corpus.jsonl").write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in out))
    for name in ("queries.json", "oracle.json", "kinds.json", "subset-mem0.json"):
        if (args.fixture / name).exists():
            shutil.copy2(args.fixture / name, args.output / name)
    uncached = usage["prompt_tokens"] - usage["cached_tokens"]
    cost = uncached * PRICE["input"] + usage["cached_tokens"] * PRICE["cached"] + usage["completion_tokens"] * PRICE["output"]
    manifest = {**json.loads((args.fixture / "manifest.json").read_text()), "enriched_by": MODEL, "prompt": PROMPT,
                "batch": BATCH, "usage": usage, "cost_usd": round(cost, 4), "records_without_reply": missing,
                "seconds": round(time.time() - started, 1)}
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({key: manifest[key] for key in ("usage", "cost_usd", "records_without_reply", "seconds")}))


if __name__ == "__main__":
    main()
