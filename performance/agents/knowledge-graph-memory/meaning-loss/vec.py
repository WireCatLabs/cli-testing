"""Pure vector ranks inside memo's own stored vectors (8-bit e5-small, memo's chunk texts)."""
import json, sqlite3, sys
from pathlib import Path
import numpy as np

S = Path(__file__).resolve().parent
db = sqlite3.connect(f"file:{S}/store/memo/wirecat-state/wirecat.db?mode=ro", uri=True)
chunks = json.loads((S / "chunks.json").read_text())
vec = {h: np.frombuffer(v, dtype=np.float32) for h, v in db.execute("SELECT content_hash, vector FROM embeddings")}
M = np.stack([vec[c["hash"]] for c in chunks])
ids = np.array([c["id"] for c in chunks]); kinds = np.array([c["kind"] for c in chunks])
Q = [q for q in json.loads((S / "queries.json").read_text())]


def rank_of(scores, mask, src):
    order = np.where(mask)[0][np.argsort(-scores[mask], kind="stable")]
    pos = {ids[j]: r + 1 for r, j in enumerate(order)}
    return pos.get(src), order


def recall(qs, key, k=10, mask=None):
    out = []
    for q in qs:
        s = M @ np.array(q[key], dtype=np.float32)
        _, order = rank_of(s, np.ones(len(ids), bool) if mask is None else mask, None)
        top = set(ids[order[:k]])
        out.append(len(top & set(q["sources"])) / len(q["sources"]))
    return round(float(np.mean(out)), 3)


rw = [q for q in Q if q["reworded"]]
for model in ("int8",):
    for lane in ("raw", "mail", "notes"):
        print(f"pure memo vectors, {model} query={lane}: reworded@10 {recall(rw, f'{model}_{lane}')}, all@10 {recall(Q, f'{model}_{lane}')}")
rows = []
for q in rw:
    sr = M @ np.array(q["int8_raw"], dtype=np.float32)
    sm = M @ np.array(q["int8_mail"], dtype=np.float32)
    sn = M @ np.array(q["int8_notes"], dtype=np.float32)
    for src in q["sources"]:
        j = int(np.where(ids == src)[0][0]); kind = kinds[j]
        g, _ = rank_of(sr, np.ones(len(ids), bool), src)
        if kind == "mail":
            lane_rank, _ = rank_of(sm, kinds == "mail", src); cos = float(sm[j])
        else:
            lane_rank, _ = rank_of(sn, kinds == "notes", src); cos = float(sn[j])
        rows.append({"q": q["id"], "src": src, "kind": kind, "global_rank": g, "lane_rank": lane_rank, "cos": round(cos, 4),
                     "floor_applies": kind != "mail", "passes_floor": cos > 0.8})
(S / "vec-rows.json").write_text(json.dumps(rows, indent=1))
for r in rows: print(r)
