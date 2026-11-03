"""Token count of each file with a pinned tiktoken encoding; prints JSON. Run through uv, as run.ts does."""

import json
import sys
from importlib.metadata import version

import tiktoken

ENCODING = "o200k_base"
encoding = tiktoken.get_encoding(ENCODING)
counts = {}
for path in sys.argv[1:]:
    with open(path, encoding="utf-8") as file:
        counts[path] = len(encoding.encode(file.read(), disallowed_special=()))
print(json.dumps({"encoding": ENCODING, "tiktoken": version("tiktoken"), "tokens": counts}))
