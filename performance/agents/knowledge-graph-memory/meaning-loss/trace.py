"""Per-question table from a traced run: each source's rank in its lane's meaning list, fused list and final reply."""
import json, sys
from pathlib import Path

S = Path(__file__).resolve().parent
B = Path.home() / ".cache/wirecat-bench"
run = S / "runs" / sys.argv[1]
names = {f"r{i + 1:04}": json.loads(l)["id"] for i, l in enumerate((B / "kg-fixture-v3/corpus.jsonl").read_text().splitlines())}
ident = {v: k for k, v in names.items()}
kinds = {json.loads(l)["id"]: json.loads(l)["kind"] for l in (B / "kg-fixture-v3/corpus.jsonl").read_text().splitlines()}
vec = {(r["q"], r["src"]): r for r in json.loads((S / "vec-rows.json").read_text())}
plain = {q["id"]: q["question"] for q in json.loads((B / "kg-fixture-v3/queries.json").read_text())}
other = {q["id"]: q["question"] for q in json.loads((B / "kg-fixture-v3-paraphrased/queries.json").read_text())}
oracle = {r["id"]: r["required_citations"] for r in json.loads((B / "kg-fixture-v3/oracle.json").read_text())}
FORMAT = {"answer", "as", "amount", "like", "eur", "12", "500", "yyyy", "mm", "dd", "or", "cancelled", "if", "it", "not",
          "take", "place", "with", "number"}


def pos(lst, title):
    titles = [x[0] if isinstance(x, list) else x for x in lst]
    return titles.index(title) + 1 if title in titles else None


print("| q | source | lane | vec rank (all) | vec rank (lane) | cosine | meaning rank | words rank | fused rank | final | top10 |")
print("|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|")
for qid in oracle:
    if not oracle[qid] or plain[qid] == other[qid]:
        continue
    steps = {}
    for line in (run / f"{qid}.trace.jsonl").read_text().splitlines():
        t = json.loads(line)
        steps[(t["lane"], t["step"])] = t
    final = [i.get("title") for i in json.loads((run / f"{qid}.json").read_text())["items"]]
    for src in oracle[qid]:
        lane = "mail" if kinds[src] == "mail" else "notes"
        t = ident[src]
        v = vec[(qid, src)]
        m = pos(steps.get((lane, "meaning"), {}).get("list", []), t)
        w = pos(steps.get((lane, "words"), {}).get("list", []), t)
        f = pos(steps.get((lane, "fused"), {}).get("list", []), t)
        fin = final.index(t) + 1 if t in final else None
        print(f"| {qid} | {t} | {lane} | {v['global_rank']} | {v['lane_rank']} | {v['cos']:.3f} | {m or '-'} | {w or '-'} | {f or '-'} | {fin or '-'} | {'y' if fin and fin <= 10 else 'n'} |")
