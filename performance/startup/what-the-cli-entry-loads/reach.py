"""usage: python3 reach.py <trace.tsv> — files the traced entry reaches, and how many remain with the MCP SDK and
zod cut off. The trace is graph-hook.mjs output: one `parent<TAB>child` line per resolved import."""
import collections
import re
import sys

edges = collections.defaultdict(list)
for line in open(sys.argv[1]):
    parent, child = line.rstrip("\n").split("\t")
    edges[parent].append(child)
roots = [u for u in {c for cs in edges.values() for c in cs} if u.endswith("/dist/cli/index.js")]


def reach(blocked):
    seen, stack = set(), list(roots)
    while stack:
        node = stack.pop()
        if node in seen or blocked(node):
            continue
        seen.add(node)
        stack += edges[node]
    return seen


sdk = re.compile(r"@modelcontextprotocol|/zod/")
print(f"reached: {len(reach(lambda n: False))}")
print(f"without the MCP SDK and zod: {len(reach(lambda n: bool(sdk.search(n))))}")
