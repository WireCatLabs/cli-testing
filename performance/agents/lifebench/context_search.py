#!/usr/bin/env python3
"""Search a store memo_clean.py built, for another fixture's questions over the same corpus, without rebuilding it.

    PATH=<memo bin>:$PATH python3 -I -B context_search.py --baseline <kg>/memo_baseline.py --store <memo_clean output> \
        --fixture <pilot> --label "hybrid (embeddinggemma), question verbatim" --limit 40 --output <per-query.json>

Hits map back to records through the names memo_clean gives the corpus (written to a scratch folder and dropped),
so the fixture's corpus must be the one the store was built from: its file names and mail are checked against it.

--before-ask adds memo's own date bound, `date<<the day after ask_time>` with --timezone UTC (cli-core
docs/search/query-language.md: a date-only bound is the start of that day, so `date<=<ask day>` would lose the
ask day itself). Any hit still dated later is dropped and counted. Each question's hits go to <output>.partial.jsonl
as it finishes; a rerun skips the questions already there.
"""

import argparse
import hashlib
import json
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import memo_clean


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--store", type=Path, required=True, help="a memo_clean.py --output folder")
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--limit", type=int, default=40)
    parser.add_argument("--memo", default="memo")
    parser.add_argument("--before-ask", action="store_true", help="only records dated on or before ask_time")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit(f"{args.output} exists")
    corpus = (args.fixture / "corpus.jsonl").read_bytes()
    built = sorted(args.store.glob("data/notes/*.md"))
    if not built:
        raise SystemExit(f"{args.store} holds no memo_clean sources")
    baseline = memo_clean.load_baseline(args.baseline)
    memo_clean.install(baseline, args.limit)
    records = [json.loads(line) for line in corpus.decode().splitlines()]
    with tempfile.TemporaryDirectory() as scratch:
        names = baseline.write_sources(records, Path(scratch) / "data")
        written = sorted(p.name for p in (Path(scratch) / "data/notes").glob("*.md"))
        mbox = hashlib.sha256((Path(scratch) / "data/mail.mbox").read_bytes()).hexdigest()
    if written != [p.name for p in built] or mbox != hashlib.sha256(
            (args.store / "data/mail.mbox").read_bytes()).hexdigest():
        raise SystemExit("the fixture's corpus is not the one this store was built from")
    memo = baseline.Memo(args.memo, args.store.resolve() / "memo")
    raw = args.output.parent / f"{args.output.stem}-raw"
    raw.mkdir(parents=True, exist_ok=True)
    partial = args.output.with_suffix(".partial.jsonl")
    done = {row["id"]: row for row in map(json.loads, partial.read_text().splitlines())} if partial.exists() else {}
    queries = json.loads((args.fixture / "queries.json").read_text())
    extra = ["--timezone", "UTC"] if args.before_ask else []
    with partial.open("a") as sink:
        for query in queries:
            if query["id"] in done:
                continue
            text, bound = query["question"], None
            if args.before_ask:
                bound = (date.fromisoformat(query["as_of"][:10]) + timedelta(days=1)).isoformat()
                text = f"{text} date<{bound}"
            raw_path = raw / f"{query['id']}.json"
            hits, seconds, complete = baseline.search(memo, names, text, extra, raw_path)
            stamps = [item.get("timestamp") or "" for item in json.loads(raw_path.read_text())["items"]]
            late = [i for i, stamp in enumerate(stamps) if bound and stamp[:10] >= bound]
            row = {"id": query["id"], "query": text, "hits": [h for i, h in enumerate(hits) if i not in late],
                   "seconds": seconds, "complete": complete, "dropped_after_ask": len(late)}
            sink.write(json.dumps(row, ensure_ascii=False) + "\n")
            sink.flush()
            done[query["id"]] = row
    rows = [done[query["id"]] for query in queries]
    unmapped = sum(hit.startswith("unmapped:") for row in rows for hit in row["hits"])
    args.output.write_text(json.dumps({args.label: rows}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"questions": len(rows), "unmapped_hits": unmapped, "label": args.label,
                      "dropped_after_ask": sum(row["dropped_after_ask"] for row in rows)}))


if __name__ == "__main__":
    main()
