#!/usr/bin/env python3
"""Size, token count and difficulty of a run.py fixture.

uv run --quiet --no-project --with tiktoken==0.14.0 python corpus_stats.py <fixture directory>
"""

import hashlib
import json
import re
import statistics
import sys
from collections import Counter
from pathlib import Path

import tiktoken

from run import ARCHIVE_PROJECTS


def main():
    fixture = Path(sys.argv[1])
    raw = (fixture / "corpus.jsonl").read_text()
    records = [json.loads(line) for line in raw.splitlines()]
    oracle = json.loads((fixture / "oracle.json").read_text())
    texts = [record["text"] for record in records]
    encoding = tiktoken.get_encoding("o200k_base")
    subjects = [re.search(r"for (?:the )?(.+)\?$", row["question"]).group(1) for row in oracle[0::5]]
    projects = [name for name in ARCHIVE_PROJECTS if any(name in text for text in texts)]
    print(json.dumps({
        "sha256": hashlib.sha256(raw.encode()).hexdigest(),
        "records": len(records), "questions": len(oracle),
        "kinds": dict(Counter(record["kind"] for record in records)),
        "mail_replies": sum(text.startswith("Re: ") for text in texts),
        "handovers": sum(bool(row["stale_answers"]) for row in oracle[2::5]),
        "revised_commitments": sum(bool(row["stale_answers"]) for row in oracle[3::5]),
        "records_per_project_median": statistics.median(sum(name in text for text in texts) for name in projects),
        "records_per_subject_median": statistics.median(sum(name in text for text in texts) for name in subjects),
        "text_characters": sum(len(text) for text in texts),
        "tiktoken": tiktoken.__version__, "encoding": "o200k_base",
        "tokens_record_texts": sum(len(encoding.encode(text)) for text in texts),
        "tokens_whole_jsonl": len(encoding.encode(raw)),
    }, indent=2))


if __name__ == "__main__":
    main()
