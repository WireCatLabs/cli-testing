#!/usr/bin/env python3
"""Turn one LifeBench 2.0 English persona into the fixture memo_baseline.py and eval_embeddings.py read.

    python3 -I adapter.py --data ~/.cache/wirecat-bench/lifebench/src/life_bench_data/version2/data_en \
        --persona fenghaoran --output ~/.cache/wirecat-bench/lifebench/fixtures/fenghaoran

Writes corpus.jsonl (id, kind, timestamp, text), queries.json, oracle.json (required_citations are the corpus ids of
the question's gold evidence), categories.json and manifest.json. Only the phone_data files and QA_all/QA.json are
read; the generator's own files (daily_event, event_tree, daily_draft, persona) are not part of what a phone holds.
"""

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

SOURCES = ("agent_chat", "calendar", "call", "contact", "fitness_health", "note", "photo", "push", "sms")
# Generator bookkeeping, not something the phone shows; keeping it would hand the search the answer key's links.
HIDDEN = {"type", "daily_event_id", "event_id", "phone_id", "summarized_info"}


def stamp(record):
    """LifeBench wall-clock time read as UTC, so a date never shifts; records with only a day sit at noon."""
    if record.get("datetime"):
        return record["datetime"].replace(" ", "T") + "Z"
    if record.get("date"):
        # 87 of the 8,177 assistant chats carry a time in their date field.
        day = record["date"]
        return day.replace(" ", "T") + "Z" if " " in day else day + "T12:00:00Z"
    return "2025-01-01T00:00:00Z"


def flatten(value, prefix=""):
    if isinstance(value, dict):
        return [line for key, item in value.items() if key not in HIDDEN for line in flatten(item, f"{prefix}{key} ")]
    if isinstance(value, list):
        return [line for item in value for line in flatten(item, prefix)]
    if value in ("", None, 0, 0.0):
        return []
    return [f"{prefix.strip().replace('_', ' ')}: {value}"]


def render(kind, r, owner):
    if kind == "sms":
        way = f"SMS from {r['contactName']} to {owner}" if r["message_type"] == "Receive" else \
            f"SMS from {owner} to {r['contactName']}"
        return f"{way} ({r['phoneNumber']}), {r['datetime']}:\n{r['message_content']}"
    if kind == "call":
        return (f"Phone call with {r['contactName']} ({r['phoneNumber']}), {r['datetime']} to {r['datetime_end']}, "
                f"{r['call_result']}, direction code {r['direction']}.")
    if kind == "calendar":
        return (f"Calendar event: {r['title']}\nFrom {r['start_time']} to {r['end_time']} "
                f"(created {r['datetime']}).\n{r['description']}")
    if kind == "note":
        return f"Note: {r['title']}\n{r['datetime']}\n{r['content']}"
    if kind == "push":
        return (f"Notification from {r['source']}: {r['title']}\n{r['datetime']}, {r['push_status']}, "
                f"opens {r['jump_path']}\n{r['content']}")
    if kind == "photo":
        place = ", ".join(str(v) for v in r["location"].values() if v)
        tags = ", ".join(r.get("imageTag") or [])
        return (f"Photo {r['title']}, {r['datetime']}, at {place}.\n{r['caption']}\nPeople: {r['faceRecognition']}\n"
                f"Tags: {tags}\nText in the photo: {r.get('ocrText') or 'none'}")
    if kind == "agent_chat":
        turns = []
        for turn in r["conversation"].values():
            turns += [f"{owner}: {turn['user']['content']}", f"Assistant: {turn['assistant']['content']}"]
        return f"Chat with the phone assistant, {r['date']}\n" + "\n".join(turns)
    if kind == "contact":
        return "Contact: " + "\n".join(flatten(r))
    if kind == "fitness_health":
        return f"Health and fitness, {r['date']}\n" + "\n".join(flatten({k: v for k, v in r.items() if k != "date"}))
    raise ValueError(kind)


def title(kind, r):
    """What a mail subject or a note's file name would say; memo_clean.py uses it instead of a bare rNNNN."""
    if kind == "sms":
        words = r["message_content"].split()
        return " ".join(words[:8]) + ("…" if len(words) > 8 else "")
    if kind == "call":
        return f"Call with {r['contactName']} {r['datetime'][:16]}"
    if kind == "agent_chat":
        return f"Assistant chat {r['date']}"
    if kind == "contact":
        return f"Contact {r['name']}"
    if kind == "fitness_health":
        return f"Health {r['date']}"
    name = {"calendar": "Calendar", "note": "Note", "push": "Notification", "photo": "Photo"}[kind]
    return f"{name} {r['datetime'][:10]} {r['title']}"[:120]


def same(record, evidence):
    """Evidence is a copy of the record; nine personas' copies drop the empty summarized_info field."""
    keys = (set(record) | set(evidence)) - {"summarized_info"}
    return all(record.get(key) == evidence.get(key) for key in keys)


def load(data, persona):
    folder = data / persona
    owner = json.loads((folder / "persona.json").read_text())["name"]
    rows = []
    for kind in SOURCES:
        for r in json.loads((folder / "phone_data" / f"{kind}.json").read_text()):
            rows.append({"source": kind, "phone_id": r["phone_id"], "timestamp": stamp(r),
                         "text": render(kind, r, owner), "title": title(kind, r), "raw": r})
    rows.sort(key=lambda row: (row["timestamp"], row["source"], row["phone_id"]))
    first = {}
    for index, row in enumerate(rows):
        if row["source"] == "sms":
            # memo_baseline threads mail by the 1-based position of a thread's first record, read from the id.
            thread = first.setdefault(row["raw"]["contactName"], index + 1)
            row["id"] = f"lifebench:{persona}/sms/thread-{thread}/{row['phone_id']}"
            row["kind"] = "mail"
            them = {"name": row["raw"]["contactName"], "phone": row["raw"]["phoneNumber"]}
            me = {"name": owner, "phone": "owner"}
            row["sender"], row["recipient"] = (them, me) if row["raw"]["message_type"] == "Receive" else (me, them)
        else:
            row["id"] = f"lifebench:{persona}/{row['source']}/{row['phone_id']}"
            row["kind"] = row["source"]
    return owner, rows


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--data", type=Path, required=True, help="LifeBench version2/data_en")
    parser.add_argument("--persona", required=True)
    parser.add_argument("--output", type=Path, required=True, help="new directory")
    args = parser.parse_args()
    owner, rows = load(args.data, args.persona)
    by_key = {(row["source"], row["phone_id"]): row for row in rows}
    qa = json.loads((args.data / args.persona / "QA_all/QA.json").read_text())

    queries, oracle, categories = [], [], []
    unresolved = after_ask = 0
    for number, item in enumerate(qa, 1):
        qid = f"{args.persona}-q{number:03}"
        cited = []
        for evidence in item.get("evidence") or []:
            row = by_key.get((evidence["type"], evidence["phone_id"]))
            if row is None or not same(row["raw"], evidence):
                unresolved += 1
                continue
            after_ask += row["timestamp"][:10] > item["ask_time"]
            if row["id"] not in cited:
                cited.append(row["id"])
        as_of = item["ask_time"] + "T23:59:59Z"
        queries.append({"id": qid, "question": item["question"], "as_of": as_of})
        oracle.append({"id": qid, "question": item["question"], "as_of": as_of, "answers": [item["answer"]],
                       "required_citations": cited, "categories": item["question_type"]})
        categories.append({"id": qid, "categories": item["question_type"]})
    if unresolved:
        raise SystemExit(f"{unresolved} evidence items match no record")

    args.output.mkdir(parents=True, exist_ok=False)
    corpus = "".join(json.dumps({k: row[k] for k in ("id", "kind", "timestamp", "title", "sender", "recipient", "text") if k in row}, ensure_ascii=False) + "\n"
                     for row in rows)
    (args.output / "corpus.jsonl").write_text(corpus)
    for name, value in (("queries", queries), ("oracle", oracle), ("categories", categories)):
        (args.output / f"{name}.json").write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    category_count = Counter(c for item in qa for c in item["question_type"])
    manifest = {
        "source": "LifeBench 2.0 data_en (Apache-2.0), github.com/1754955896/LifeBench branch lifebench2.0",
        "persona": args.persona, "owner": owner, "records": len(rows),
        "records_by_source": dict(Counter(row["source"] for row in rows)),
        "questions": len(qa), "questions_by_category": dict(category_count),
        "questions_without_evidence": sum(not row["required_citations"] for row in oracle),
        "unanswerable_without_evidence": sum(not row["required_citations"] and "Unanswerable" in row["categories"]
                                             for row in oracle),
        "evidence_items": sum(len(item.get("evidence") or []) for item in qa),
        "distinct_cited_records": len({c for row in oracle for c in row["required_citations"]}),
        "cited_records_dated_after_ask_time": after_ask,
        "sha256": hashlib.sha256(corpus.encode()).hexdigest(),
    }
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest))


if __name__ == "__main__":
    main()
