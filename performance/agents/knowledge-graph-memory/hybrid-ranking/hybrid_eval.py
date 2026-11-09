"""Recall@1/5/10 of memo `search all` over an already seeded store, for one fixture and query rewrite."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from memo_baseline import Memo, mail_name, name_of, or_query

p = argparse.ArgumentParser()
p.add_argument("--memo", required=True)
p.add_argument("--store", type=Path, required=True)
p.add_argument("--fixture", type=Path, required=True)
p.add_argument("--rewrite", choices=["verbatim", "or"], default="verbatim")
p.add_argument("--reworded", action="store_true", help="only the questions kinds.json marks paraphrased")
p.add_argument("--only", default="")
p.add_argument("--out", type=Path)
a = p.parse_args()

records = [json.loads(line) for line in (a.fixture / "corpus.jsonl").read_text().splitlines()]
names = {name_of(i): r["id"] for i, r in enumerate(records)}

queries = json.loads((a.fixture / "queries.json").read_text())
oracle = {r["id"]: set(r["required_citations"]) for r in json.loads((a.fixture / "oracle.json").read_text())}
if a.reworded:
    para = {k["id"] for k in json.loads((a.fixture / "kinds.json").read_text()) if k.get("paraphrased")}
    queries = [q for q in queries if q["id"] in para]
queries = [q for q in queries if oracle[q["id"]]]
memo = Memo(a.memo, a.store)
extra = ["--only", a.only] if a.only else []
rows = []
for q in queries:
    text = q["question"] if a.rewrite == "verbatim" else or_query(q["question"])
    reply, secs = memo.json("search", "all", text, "--limit", "10", *extra)
    items = reply["items"]
    hits = [names.get(i.get("title", "")) or names.get(mail_name(i.get("ref", "")), "?") for i in items]
    rows.append({"id": q["id"], "hits": hits,
                 "found_by": [i.get("found_by") or i.get("foundBy") for i in items], "seconds": secs})
rec = {}
for k in (1, 5, 10):
    rec[k] = sum(len(oracle[r["id"]] & set(r["hits"][:k])) / len(oracle[r["id"]]) for r in rows) / len(rows)
print(f"n={len(rows)} @1={rec[1]:.2f} @5={rec[5]:.2f} @10={rec[10]:.2f} "
      f"p50={sorted(r['seconds'] for r in rows)[len(rows) // 2]:.2f}s")
if a.out:
    a.out.write_text(json.dumps({"recall": rec, "rows": rows}, indent=1))
