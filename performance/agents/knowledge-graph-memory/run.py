#!/usr/bin/env python3
"""Generate a synthetic memory corpus and score normalized, cited engine answers."""

import argparse
import hashlib
import json
import platform
import random
import re
from pathlib import Path

PEOPLE = ["Ari Vale", "Bo Reed", "Cy Moss", "Dee Lake", "Eli Pine", "Fay Stone", "Gio Fern", "Hal Cove", "Ira Brook", "Jo Birch"]
PROJECTS = ["Amber Kite", "Birch Compass", "Cedar Lantern", "Dune Harbor", "Elm Beacon", "Flint Meadow", "Grove Atlas", "Hazel Bridge", "Iris Summit", "Juniper Valley"]
KINDS = ["telegram", "mail", "notes", "meetings"]


def source_ref(kind, number):
    if kind == "telegram":
        return f"msg:telegram/synthetic/team/{number}"
    if kind == "mail":
        return f"msg:email/synthetic%40example.test/thread-{number}/{number}"
    if kind == "notes":
        return f"document:{number}"
    return f"meeting:synthetic/{number}/cue/1"


def corpus():
    records, questions = [], []

    def add(kind, date, text):
        record = {"id": source_ref(kind, len(records) + 1), "kind": kind, "timestamp": date, "text": text}
        records.append(record)
        return record["id"]

    def ask(question, answer, citations, stale=None):
        questions.append({"id": f"q{len(questions) + 1:02}", "question": question,
                          "as_of": "2026-10-20T00:00:00Z", "answers": [answer],
                          "required_citations": citations, "stale_answers": stale or []})

    for index, (person, project) in enumerate(zip(PEOPLE, PROJECTS, strict=True)):
        old, new = f"2026-11-{index + 1:02}", f"2026-12-{index + 11:02}"
        first = add("telegram", "2026-10-01T09:00:00Z", f"{person}: We agreed the {project} delivery date is {old}.")
        changed = add("mail", "2026-10-10T10:00:00Z", f"Confirmed decision for {project}: replace {old} with {new}. The earlier deadline is cancelled.")
        owner = add("notes", "2026-10-03T12:00:00Z", f"{project} responsibility: {person} is the delivery owner. Keep this separate from project mentions.")
        handoff = add("meetings", "2026-10-05T14:00:00Z", f"For {project}, {person} agreed to deliver the accessibility review. This is a commitment, not a suggestion.")
        add("telegram", "2026-10-12T15:00:00Z", f"Could we move {project} to 2027-01-15? This is a suggestion only, no decision was made.")
        add("mail", "2026-10-13T10:00:00Z", f"Draft discussion about {project}: someone mentioned {PEOPLE[(index + 1) % 10]}, who is not the delivery owner.")
        add("notes", "2026-10-14T12:00:00Z", f"{project} reference: the original delivery date appears in the old October thread; use the confirmed replacement for current plans.")
        add("meetings", "2026-10-15T14:00:00Z", f"{project} update: the accessibility review is still open. No approved budget figure is recorded.")
        ask(f"What is the current confirmed delivery date for {project}?", new, [changed], [old, "2027-01-15"])
        ask(f"What was the original delivery date agreed for {project}, before it changed?", old, [first])
        ask(f"Who is the confirmed delivery owner of {project}?", person, [owner])
        ask(f"What did {person} commit to delivering for {project}?", "accessibility review", [handoff])
        ask(f"What approved budget amount was agreed for {project}?", "unknown", [])

    rng = random.Random(20261024)
    topics = ["test report", "calendar invite", "lunch plan", "draft design", "travel checklist", "dependency review", "room booking", "status note"]
    while len(records) < 2000:
        number = len(records)
        kind = KINDS[number % 4]
        person = rng.choice(PEOPLE)
        topic = rng.choice(topics)
        add(kind, f"2026-09-{number % 28 + 1:02}T08:00:00Z",
            f"Archive item {number}: {person} discussed the {topic} for a separate sandbox exercise, reference batch {rng.randrange(10000)}. No delivery decision or budget approval.")
    assert len(questions) == 50 and len({record["id"] for record in records}) == 2000
    return records, questions


def normalized(value):
    return re.sub(r"\s+", " ", value.strip().casefold())


def score(records, questions, predictions):
    known = {record["id"] for record in records}
    by_id = {row["id"]: row for row in predictions}
    expected = {question["id"] for question in questions}
    if len(by_id) != len(predictions) or set(by_id) != expected:
        raise ValueError("predictions must contain every question exactly once, with no extra ids")
    counts = {"correct": 0, "cited_correctly": 0, "stale": 0}
    for question in questions:
        row = by_id[question["id"]]
        answer = normalized(row["answer"])
        citations = row["citations"]
        if not isinstance(citations, list) or not all(isinstance(ref, str) for ref in citations):
            raise ValueError("citations must be a list of source ids")
        correct = answer in {normalized(value) for value in question["answers"]}
        supported = all(ref in known for ref in citations) and set(question["required_citations"]) == set(citations)
        if not question["required_citations"]:
            supported = citations == []
        counts["correct"] += correct
        counts["cited_correctly"] += correct and supported
        counts["stale"] += answer in {normalized(value) for value in question["stale_answers"]}
    return counts


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="new directory; existing paths are refused")
    parser.add_argument("--predictions", type=Path, help="normalized answers from one engine, JSON array")
    parser.add_argument("--engine", default="external engine", help="recorded engine name and exact version")
    parser.add_argument("--self-check", action="store_true", help="validate the corpus and scorer, without running any engine")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    records, questions = corpus()
    source = "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records)
    (args.output / "corpus.jsonl").write_text(source)
    write_json(args.output / "queries.json", [{key: row[key] for key in ["id", "question", "as_of"]} for row in questions])
    write_json(args.output / "oracle.json", questions)
    write_json(args.output / "manifest.json", {
        "fixture_version": 1, "seed": 20261024, "records": len(records), "questions": len(questions),
        "source_counts": {kind: sum(record["kind"] == kind for record in records) for kind in KINDS},
        "sha256": hashlib.sha256(source.encode()).hexdigest(), "python": platform.python_version(),
    })
    print("| Run | Records | Questions | Correct | Correct with sources | Stale answers |")
    print("|---|---:|---:|---:|---:|---:|")
    if args.self_check:
        predictions = [{"id": row["id"], "answer": row["answers"][0], "citations": row["required_citations"]} for row in questions]
        result = score(records, questions, predictions)
        assert result == {"correct": 50, "cited_correctly": 50, "stale": 0}
        wrong = json.loads(json.dumps(predictions))
        wrong[0]["answer"] = questions[0]["stale_answers"][0]
        wrong[1]["citations"] = ["made-up-source"]
        wrong[4]["answer"] = "1000"
        assert score(records, questions, wrong) == {"correct": 48, "cited_correctly": 47, "stale": 1}
        print("| Harness self-check (oracle answers) | 2000 | 50 | 50 | 50 | 0 |")
        write_json(args.output / "self-check.json", result)
    if args.predictions:
        result = score(records, questions, json.loads(args.predictions.read_text()))
        write_json(args.output / "scores.json", {"engine": args.engine, **result})
        print(f"| {args.engine.replace('|', '/')} | 2000 | 50 | {result['correct']} | {result['cited_correctly']} | {result['stale']} |")
    else:
        for engine in ["Memo", "Hindsight", "Graphiti", "Cognee"]:
            print(f"| {engine} (not run) | 2000 | 50 | — | — | — |")


if __name__ == "__main__":
    main()
