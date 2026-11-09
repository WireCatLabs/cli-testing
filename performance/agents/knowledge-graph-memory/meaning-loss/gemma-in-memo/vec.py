"""Plain vector recall@10 with memo's Gemma (4-bit): over memo's stored chunk vectors, and over each record's own text."""
import json, sqlite3, sys
from pathlib import Path
import numpy as np

H = Path(__file__).resolve().parent
store = Path(sys.argv[1])
B = Path.home() / ".cache/wirecat-bench"
corpus = [json.loads(l) for l in (B / "kg-fixture-v3/corpus.jsonl").read_text().splitlines()]
chunks = json.loads((H / "chunks.json").read_text())
Q = json.loads((H / "queries.json").read_text())
db = sqlite3.connect(f"file:{store}/memo/wirecat-state/wirecat.db?mode=ro", uri=True)
vec = {h: np.frombuffer(v, dtype=np.float32) for h, v in db.execute("SELECT content_hash, vector FROM embeddings")}
M = np.stack([vec[c["hash"]] for c in chunks])
rid = [[r["id"]] for r in corpus]


def ranked(q, key, mat, ids, k=10):
    s = mat @ np.array(q[key], dtype=np.float32)
    top = []
    for j in np.argsort(-s, kind="stable"):
        for i in ids[j]:
            if i not in top:
                top.append(i)
        if len(top) >= k:
            break
    return top[:k]


def recall(qs, key, mat, ids):
    return round(float(np.mean([len(set(ranked(q, key, mat, ids)) & set(q["sources"])) / len(q["sources"]) for q in qs])), 3)


rw = [q for q in Q if q["reworded"]]
cids = [c["ids"] for c in chunks]
print("questions", len(Q), "reworded", len(rw), "chunks", len(chunks))
mats = [("memo stored chunks", M, cids)]
if (H / "bare-q4.f32").exists():
    mats.insert(0, ("record text alone", np.fromfile(H / "bare-q4.f32", dtype=np.float32).reshape(len(corpus), -1), rid))
for label, mat, ids in mats:
    for key in ("raw", "meaning"):
        print(f"{label}, query={key}: reworded@10 {recall(rw, key, mat, ids)} all46@10 {recall(Q, key, mat, ids)}")
print("reworded sources with no chunk:", [s for q in rw for s in q["sources"] if not any(s in c for c in cids)])
print("mail chunks holding two records:", sum(len(c) > 1 for c in cids))
