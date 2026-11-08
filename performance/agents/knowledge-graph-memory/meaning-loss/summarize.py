"""Recompute recall@10 of every saved run from its replies in runs/<label>/; writes results.jsonl."""
import json
from pathlib import Path

S = Path(__file__).resolve().parent
B = Path.home() / ".cache/wirecat-bench"
names = {f"r{i + 1:04}": json.loads(l)["id"] for i, l in enumerate((B / "kg-fixture-v3/corpus.jsonl").read_text().splitlines())}
plain = {q["id"]: q["question"] for q in json.loads((B / "kg-fixture-v3/queries.json").read_text())}
other = {q["id"]: q["question"] for q in json.loads((B / "kg-fixture-v3-paraphrased/queries.json").read_text())}
oracle = {r["id"]: set(r["required_citations"]) for r in json.loads((B / "kg-fixture-v3/oracle.json").read_text())}
asked = [q for q in plain if oracle[q]]
reworded = [q for q in asked if plain[q] != other[q]]
out = []
for run in sorted(p for p in (S / "runs").iterdir() if p.is_dir()):
    rows, words_only, slots = {}, 0, 0
    for q in asked:
        items = json.loads((run / f"{q}.json").read_text())["items"]
        rows[q] = [names.get(i.get("title", ""), i.get("ref")) for i in items][:10]
        slots += len(items[:10])
        words_only += sum(i.get("found_by") == ["words"] for i in items[:10])
    score = lambda qs: round(sum(len(oracle[q] & set(rows[q])) / len(oracle[q]) for q in qs) / len(qs), 3)
    out.append({"run": run.name, "reworded@10": score(reworded), "all46@10": score(asked),
                "words_only_slots": f"{words_only}/{slots}",
                "per_q": {q: f"{len(oracle[q] & set(rows[q]))}/{len(oracle[q])}" for q in reworded}})
(S / "results.jsonl").write_text("".join(json.dumps(r) + "\n" for r in out))
for r in out:
    print(f'{r["run"]:28} {r["reworded@10"]:6} {r["all46@10"]:6} {r["words_only_slots"]}')
