"""Recall@10 of each Gemma weight file: every record's own text, and memo's chunk text without the sender line."""
import json, sys
from pathlib import Path
import numpy as np
H = Path(__file__).resolve().parent
corpus = [json.loads(l) for l in (Path.home() / ".cache/wirecat-bench/kg-fixture-v3/corpus.jsonl").read_text().splitlines()]
chunks = json.loads((H / "chunks.json").read_text())
Q = json.loads((H / "queries.json").read_text())
rw = [i for i, q in enumerate(Q) if q["reworded"]]
def recall(qv, M, ids, sel):
    out = []
    for i in sel:
        s = M @ qv[i]; top = []
        for j in np.argsort(-s, kind="stable"):
            for r in ids[j]:
                if r not in top: top.append(r)
            if len(top) >= 10: break
        out.append(len(set(top[:10]) & set(Q[i]["sources"])) / len(Q[i]["sources"]))
    return round(float(np.mean(out)), 3)
for w in sys.argv[1:]:
    qv = np.array(json.loads((H / f"prec-{w}-queries.json").read_text()), dtype=np.float32)
    bare = np.fromfile(H / f"prec-{w}-bare.f32", dtype=np.float32).reshape(len(corpus), -1)
    a = np.fromfile(H / f"prec-{w}-chunksA.f32", dtype=np.float32).reshape(len(chunks), -1)
    rid = [[r["id"]] for r in corpus]; cid = [c["ids"] for c in chunks]
    print(f"{w}: record text reworded@10 {recall(qv, bare, rid, rw)} all46@10 {recall(qv, bare, rid, range(len(Q)))} | "
          f"memo chunks, no sender: reworded@10 {recall(qv, a, cid, rw)} all46@10 {recall(qv, a, cid, range(len(Q)))}")
