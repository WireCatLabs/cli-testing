"""Exact-rare-word guard: questions whose only exact link to their record is a number no other record holds.

usage: guard.py <label> <memo bin> <store copy dir> [ENV=value ...]
Pass bar, set before any run: the record is in the top 3 of `memo search all`.
"""
import json, sys
from pathlib import Path

KG = Path("/home/leemour/Projects/AI/cli-testing/.claude/worktrees/kg-10k/performance/agents/knowledge-graph-memory")
sys.path.insert(0, str(KG))
from memo_baseline import Memo, mail_name  # noqa: E402

B = Path.home() / ".cache/wirecat-bench"
HERE = Path(__file__).resolve().parent
# (the record's opening words, the question)
GUARD = [
    ("Invoice 8784.", "Did the tooling bill numbered 8784 reach accounting?"),
    ("Invoice 6690.", "Who sent the bill 6690 for the harbour tools?"),
    ("Invoice 2832.", "Has bill 2832 been passed on to the money people?"),
    ("Invoice 9952.", "Which project is charge 9952 for?"),
    ("Invoice 1178.", "Who asked for 1178 to be forwarded?"),
    ("Newsletter 6277:", "What was in bulletin 6277 about seating?"),
    ("Newsletter 3428:", "Which issue of the company bulletin, 3428, covered unreliable tests?"),
    ("Newsletter 7251:", "Did digest 7251 mention customer requests?"),
]


def main(label, binary, store, *pairs):
    memo = Memo(binary, Path(store))
    memo.env.update(dict(pair.split("=", 1) for pair in pairs))
    names = {f"r{i + 1:04}": json.loads(l)["text"] for i, l in enumerate((B / "kg-fixture-v3/corpus.jsonl").read_text().splitlines())}
    rows = []
    for opening, question in GUARD:
        want = {name for name, text in names.items() if text.startswith(opening)}
        reply, _ = memo.json("search", "all", question, "--limit", "10")
        got = [mail_name(i.get("ref", "")) or i.get("title") for i in reply["items"]]
        rank = next((n + 1 for n, name in enumerate(got) if name in want), None)
        rows.append({"q": question, "rank": rank, "found_by": next((i.get("found_by") for i in reply["items"] if (mail_name(i.get("ref", "")) or i.get("title")) in want), None)})
    passed = sum(1 for r in rows if r["rank"] is not None and r["rank"] <= 3)
    out = HERE / "runs" / f"guard-{label}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(rows, indent=1))
    print(json.dumps({"guard": label, "top3": f"{passed}/{len(rows)}", "ranks": [r["rank"] for r in rows]}))


if __name__ == "__main__":
    main(*sys.argv[1:])
