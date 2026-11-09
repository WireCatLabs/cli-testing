"""A Russian copy of part of the v3 set: the 46 questions with a source record, their records, the records the
English runs ranked near them, and random v3 records up to --size. Claude Haiku translates; every batch is saved
under <out>/cache before the next one starts, so a stopped build resumes and never pays for a batch twice.

    ANTHROPIC_API_KEY=… uv run --with anthropic python3 -I build_ru.py --v3 ~/.cache/wirecat-bench/kg-fixture-v3 \
        --paraphrased ~/.cache/wirecat-bench/kg-fixture-v3-paraphrased --neighbours results --out <folder>

Writes four fixtures under <out>, each one a folder eval_models.py reads: en (the subset in English, the control),
ru (records and questions in Russian), mixed (English records, Russian questions), and the reworded questions of
each next to them (en-paraphrased, ru-paraphrased). Without a key it only picks the subset and says how many
batches are left.
"""

import argparse
import hashlib
import json
import os
import random
from pathlib import Path

MODEL = "claude-haiku-5-5"
PRICE_IN, PRICE_OUT = 0.10 / 1e6, 0.50 / 1e6
BATCH = 40
SEED = 20261109
PROMPT = """Translate each item into Russian the way a Russian-speaking colleague would write it: natural, idiomatic \
work Russian, not word for word. Chat messages stay chatty, emails stay polite, notes stay terse, questions sound \
like a person asking. Keep every name of a person, company, project, product or place exactly as written, in Latin \
letters. Keep amounts, currencies, dates, times, ids and e-mail addresses unchanged. Do not add or drop facts. \
Return one translation per item with the same id."""
SCHEMA = {"type": "object", "additionalProperties": False, "required": ["items"],
          "properties": {"items": {"type": "array", "items": {
              "type": "object", "additionalProperties": False, "required": ["id", "text"],
              "properties": {"id": {"type": "string"}, "text": {"type": "string"}}}}}}


def jsonl(path):
    return [json.loads(line) for line in path.read_text().splitlines()]


def pick(v3, neighbours, size):
    records = jsonl(v3 / "corpus.jsonl")
    oracle = json.loads((v3 / "oracle.json").read_text())
    keep = {c for row in oracle for c in row["required_citations"]}
    for path in sorted(neighbours.glob("v3-*.json")):
        if path.stem.split("-", 1)[1] in ("embeddinggemma-300m", "bge-m3"):
            for rows in json.loads(path.read_text())["runs"].values():
                keep.update(hit for row in rows for hit in row["hits"])
    rest = sorted(r["id"] for r in records if r["id"] not in keep)
    random.Random(SEED).shuffle(rest)
    keep.update(rest[: max(0, size - len(keep))])
    return [r for r in records if r["id"] in keep]


def translate(client, items, cache, spent, cap):
    key = hashlib.sha256(json.dumps([PROMPT, MODEL, items], ensure_ascii=False).encode()).hexdigest()[:20]
    path = cache / f"{key}.json"
    if path.exists():
        return json.loads(path.read_text())["items"], 0.0
    if client is None:
        return None, 0.0
    if spent >= cap:
        raise SystemExit(f"stopped at ${spent:.3f}: the cap is ${cap}")
    response = client.messages.create(
        model=MODEL, max_tokens=16000, system=PROMPT,
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
        messages=[{"role": "user", "content": json.dumps(items, ensure_ascii=False)}])
    if response.stop_reason != "end_turn":
        raise SystemExit(f"batch {key}: stop_reason {response.stop_reason}")
    out = json.loads(next(b.text for b in response.content if b.type == "text"))["items"]
    cost = response.usage.input_tokens * PRICE_IN + response.usage.output_tokens * PRICE_OUT
    by_id = {o["id"]: o for o in out}
    if set(by_id) == {i["id"] for i in items} and len(out) == len(items):
        out = [by_id[i["id"]] for i in items]
    elif len(items) > 1:
        # Haiku merged or dropped an item in batch 239bfd1e twice running; halves are cached under their own keys.
        half = len(items) // 2
        first, first_cost = translate(client, items[:half], cache, spent + cost, cap)
        second, second_cost = translate(client, items[half:], cache, spent + cost + first_cost, cap)
        return first + second, cost + first_cost + second_cost
    else:
        raise SystemExit(f"batch {key}: the one item's id came back changed")
    path.write_text(json.dumps({"items": out, "usage": {"input": response.usage.input_tokens,
                                                        "output": response.usage.output_tokens, "cost": cost}},
                               ensure_ascii=False))
    return out, cost


def write(folder, corpus, queries, oracle):
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "corpus.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in corpus))
    (folder / "queries.json").write_text(json.dumps(queries, ensure_ascii=False, indent=1))
    (folder / "oracle.json").write_text(json.dumps(oracle, ensure_ascii=False, indent=1))


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--v3", type=Path, required=True)
    parser.add_argument("--paraphrased", type=Path, required=True)
    parser.add_argument("--neighbours", type=Path, required=True, help="folder with the v3 runs' result files")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--size", type=int, default=3000)
    parser.add_argument("--cap", type=float, default=0.9, help="dollars; no new batch starts above it")
    args = parser.parse_args()
    cache = args.out / "cache"
    cache.mkdir(parents=True, exist_ok=True)
    client = None
    if os.environ.get("ANTHROPIC_API_KEY"):
        import anthropic
        client = anthropic.Anthropic()
    records = pick(args.v3, args.neighbours, args.size)
    oracle = [row for row in json.loads((args.v3 / "oracle.json").read_text()) if row["required_citations"]]
    asked = {row["id"] for row in oracle}
    plain = [q for q in json.loads((args.v3 / "queries.json").read_text()) if q["id"] in asked]
    other = {q["id"]: q for q in json.loads((args.paraphrased / "queries.json").read_text())}
    reworded = [other[q["id"]] for q in plain if other[q["id"]]["question"] != q["question"]]
    jobs = [[{"id": r["id"], "text": r["text"]} for r in records[i:i + BATCH]] for i in range(0, len(records), BATCH)]
    jobs += [[{"id": q["id"], "text": q["question"]} for q in plain],
             [{"id": q["id"], "text": q["question"]} for q in reworded]]
    spent = sum(json.loads(p.read_text())["usage"]["cost"] for p in cache.glob("*.json"))
    done, pending = {}, 0
    for job in jobs:
        out, cost = translate(client, job, cache, spent, args.cap)
        spent += cost
        if out is None:
            pending += 1
        else:
            done[json.dumps([i["id"] for i in job])] = {o["id"]: o["text"] for o in out}
    summary = {"records": len(records), "questions": len(plain), "reworded": len(reworded), "batches": len(jobs),
               "pending": pending, "spent_dollars": round(spent, 4)}
    print(json.dumps(summary))
    if pending:
        return
    record_ru = {k: v for job in jobs[:-2] for k, v in done[json.dumps([i["id"] for i in job])].items()}
    plain_ru = done[json.dumps([q["id"] for q in plain])]
    other_ru = done[json.dumps([q["id"] for q in reworded])]
    ru_corpus = [{**r, "text": record_ru[r["id"]]} for r in records]
    ru_plain = [{**q, "question": plain_ru[q["id"]]} for q in plain]
    ru_other = [{**q, "question": other_ru.get(q["id"], plain_ru[q["id"]])} for q in plain]
    en_other = [other[q["id"]] for q in plain]
    write(args.out / "en", records, plain, oracle)
    write(args.out / "en-paraphrased", records, en_other, oracle)
    write(args.out / "ru", ru_corpus, ru_plain, oracle)
    write(args.out / "ru-paraphrased", ru_corpus, ru_other, oracle)
    write(args.out / "mixed", records, ru_plain, oracle)
    write(args.out / "mixed-paraphrased", records, ru_other, oracle)
    (args.out / "summary.json").write_text(json.dumps(summary, indent=1) + "\n")


if __name__ == "__main__":
    main()
