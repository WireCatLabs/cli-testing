"""Run every question through memo `search all` with the HYB_DEBUG bundle patch and keep each source's own lists."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from memo_baseline import Memo, name_of, or_query

memo_js, rewrite = sys.argv[1], sys.argv[4]
store, fixture, out = Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[5])
records = [json.loads(line) for line in (fixture / "corpus.jsonl").read_text().splitlines()]
names = {name_of(i): r["id"] for i, r in enumerate(records)}


def record_of(key):
    """A mail hit by its ref (the Takeout id holds the record's index); a note by its title."""
    if key.startswith("msg:email/"):
        return records[int(key.rsplit("/", 1)[1]) - 1_000_000_000_000_000]["id"]
    return names.get(key, "?")
oracle = {r["id"]: r["required_citations"] for r in json.loads((fixture / "oracle.json").read_text())}
kinds = fixture / "kinds.json"
para = {k["id"] for k in json.loads(kinds.read_text()) if k.get("paraphrased")} if kinds.exists() else set()
log = out.with_suffix(".log")
memo = Memo(memo_js, store)
memo.env["HYB_DEBUG"] = str(log)
rows = []
for q in json.loads((fixture / "queries.json").read_text()):
    if not oracle[q["id"]]:
        continue
    text = q["question"] if rewrite == "verbatim" else or_query(q["question"])
    log.write_text("")
    reply, _ = memo.json("search", "all", text, "--limit", "10")
    lists = [json.loads(line) for line in log.read_text().splitlines()]
    for one in lists:
        for key in ("tier", "words"):
            if key in one:
                one[key] = [record_of(t) for t in one[key]]
        one["near"] = [[record_of(t), c] for t, c in one["near"]]
    rows.append({"id": q["id"], "reworded": q["id"] in para, "sources": oracle[q["id"]],
                 "final": [record_of(i["ref"] if i["ref"].startswith("msg:email/") else i.get("title") or "")
                           for i in reply["items"]], "lists": lists})
out.write_text(json.dumps(rows))
print(out, len(rows))
