#!/usr/bin/env python3
"""A stratified question sample of one converted persona, as a fixture openclaw_lifebench.py and judge.py read.

    python3 -I pilot.py --fixture ~/.cache/wirecat-bench/lifebench/fixtures/fenghaoran \
        --qa ~/.cache/wirecat-bench/lifebench/src/life_bench_data/version2/data_en/fenghaoran/QA_all/QA.json \
        --size 50 --seed 20261108 --output ~/.cache/wirecat-bench/lifebench/pilots/fenghaoran-50

A question has one to four categories, so each is put in the stratum of its rarest one: otherwise Hidden_info (12 of
348) would mostly ride along with Single_hop and could miss the sample. Strata get seats in proportion to their size
(largest remainder), at least --min-per-stratum each; Unanswerable gets exactly --unanswerable seats, so the
declines do not carry the overall score (60 of 348 would be 9 of 50). Writes corpus.jsonl (a copy, same sha256), queries.json (as_of
is the question's ask_time), oracle.json (answer, ask_time, categories, score_points, required_citations) and
manifest.json with the seed and the realised count per category.
"""

import argparse
import hashlib
import json
import random
import shutil
from collections import Counter
from pathlib import Path


def allocate(sizes, total, minimum):
    """Largest remainder on each stratum's share of total, with a floor of minimum (capped by the stratum's size)."""
    pool = sum(sizes.values())
    quota = {name: total * size / pool for name, size in sizes.items()}
    seats = {name: min(size, max(minimum, int(quota[name]))) for name, size in sizes.items()}
    while sum(seats.values()) < total:
        name = max((n for n in sizes if seats[n] < sizes[n]), key=lambda n: (quota[n] - seats[n], n))
        seats[name] += 1
    while sum(seats.values()) > total:
        name = min((n for n in sizes if seats[n] > minimum), key=lambda n: (quota[n] - seats[n], n))
        seats[name] -= 1
    return seats


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--fixture", type=Path, required=True, help="adapter.py output for one persona")
    parser.add_argument("--qa", type=Path, required=True, help="that persona's QA_all/QA.json, for score_points")
    parser.add_argument("--size", type=int, default=50)
    parser.add_argument("--seed", type=int, default=20261108)
    parser.add_argument("--min-per-stratum", type=int, default=2)
    parser.add_argument("--unanswerable", type=int, default=5, help="fixed seats for the Unanswerable stratum")
    parser.add_argument("--output", type=Path, required=True, help="new directory")
    args = parser.parse_args()

    oracle = json.loads((args.fixture / "oracle.json").read_text())
    qa = json.loads(args.qa.read_text())
    if len(qa) != len(oracle) or any(row["question"] != item["question"] for row, item in zip(oracle, qa)):
        raise SystemExit("QA.json is not the file this fixture was converted from")
    frequency = Counter(c for row in oracle for c in row["categories"])
    strata = {}
    for row in oracle:
        rarest = min(row["categories"], key=lambda c: (frequency[c], c))
        strata.setdefault(rarest, []).append(row["id"])
    answerable = {name: len(ids) for name, ids in strata.items() if name != "Unanswerable"}
    seats = allocate(answerable, args.size - args.unanswerable, args.min_per_stratum)
    seats["Unanswerable"] = args.unanswerable
    rng = random.Random(args.seed)
    chosen = set()
    for name in sorted(strata):
        chosen.update(rng.sample(sorted(strata[name]), seats[name]))

    by_id = {row["id"]: (row, item) for row, item in zip(oracle, qa)}
    picked = [by_id[qid] for qid in sorted(chosen)]
    queries = [{"id": row["id"], "question": row["question"], "as_of": item["ask_time"]} for row, item in picked]
    truth = [{"id": row["id"], "question": row["question"], "ask_time": item["ask_time"], "answer": item["answer"],
              "categories": item["question_type"], "score_points": item["score_points"],
              "required_citations": row["required_citations"]} for row, item in picked]

    args.output.mkdir(parents=True, exist_ok=False)
    shutil.copyfile(args.fixture / "corpus.jsonl", args.output / "corpus.jsonl")
    (args.output / "queries.json").write_text(json.dumps(queries, ensure_ascii=False, indent=2) + "\n")
    (args.output / "oracle.json").write_text(json.dumps(truth, ensure_ascii=False, indent=2) + "\n")
    source = json.loads((args.fixture / "manifest.json").read_text())
    manifest = {
        "persona": source["persona"], "owner": source["owner"], "records": source["records"],
        "corpus_sha256": hashlib.sha256((args.output / "corpus.jsonl").read_bytes()).hexdigest(),
        "questions_in_persona": len(oracle), "size": len(picked), "seed": args.seed,
        "stratified_by": "rarest category of each question", "min_per_stratum": args.min_per_stratum,
        "unanswerable_seats": args.unanswerable,
        "strata": {name: {"in_persona": len(strata[name]), "picked": seats[name]} for name in sorted(strata)},
        "questions_by_category": dict(Counter(c for row in truth for c in row["categories"]).most_common()),
        "persona_questions_by_category": dict(frequency.most_common()),
        "ids": [row["id"] for row in truth],
    }
    if manifest["corpus_sha256"] != source["sha256"]:
        raise SystemExit("the copied corpus does not match the fixture's manifest")
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({k: manifest[k] for k in ("size", "seed", "strata", "questions_by_category")}, indent=2))


if __name__ == "__main__":
    main()
