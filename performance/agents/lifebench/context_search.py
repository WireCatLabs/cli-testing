#!/usr/bin/env python3
"""Search a store memo_clean.py built, for another fixture's questions over the same corpus, without rebuilding it.

    PATH=<memo bin>:$PATH python3 -I -B context_search.py --baseline <kg>/memo_baseline.py --store <memo_clean output> \
        --fixture <pilot> --label "hybrid (embeddinggemma), question verbatim" --limit 40 --output <per-query.json>

Hits map back to records through the names memo_clean gives the corpus (written to a scratch folder and dropped),
so the fixture's corpus must be the one the store was built from: its sha256 is checked against the store's.
"""

import argparse
import hashlib
import json
import sys
import tempfile
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
    raw.mkdir(parents=True)
    queries = json.loads((args.fixture / "queries.json").read_text())
    rows = baseline.query_all(memo, names, queries, "hits", [], lambda text: text, raw)
    unmapped = sum(hit.startswith("unmapped:") for row in rows for hit in row["hits"])
    args.output.write_text(json.dumps({args.label: rows}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"questions": len(rows), "unmapped_hits": unmapped, "label": args.label}))


if __name__ == "__main__":
    main()
