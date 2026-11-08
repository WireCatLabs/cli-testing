"""Pure vector recall@10 over the store's chunks: weights (int8 memo / fp32) x passage text (memo's / record's own)."""
import json, sqlite3
from pathlib import Path
import numpy as np

S = Path(__file__).resolve().parent
chunks = json.loads((S / "chunks.json").read_text())
ids = np.array([c["id"] for c in chunks])
Q = json.loads((S / "queries.json").read_text())
rw = [q for q in Q if q["reworded"]]
db = sqlite3.connect(f"file:{S}/store/memo/wirecat-state/wirecat.db?mode=ro", uri=True)
vec = {h: np.frombuffer(v, dtype=np.float32) for h, v in db.execute("SELECT content_hash, vector FROM embeddings")}
stored = np.stack([vec[c["hash"]] for c in chunks])


def load(name):
    p = S / f"corpus-{name}.f32"
    return np.fromfile(p, dtype=np.float32).reshape(-1, 384) if p.exists() else None


def recall(M, qs, key):
    out = []
    for q in qs:
        top = set(ids[np.argsort(-(M @ np.array(q[key], dtype=np.float32)), kind="stable")[:10]])
        out.append(len(top & set(q["sources"])) / len(q["sources"]))
    return round(float(np.mean(out)), 3)


mats = {"int8 stored (memo text)": (stored, "int8"), "int8 memo text (re-embedded)": (load("int8-memo"), "int8"),
        "int8 memo text, r-title cut": (load("int8-nor"), "int8"),
        "int8 memo text, sender cut": (load("int8-nosender"), "int8"),
        "int8 memo text, both cut": (load("int8-neither"), "int8"),
        "int8 record text": (load("int8-bare"), "int8"), "fp32 memo text": (load("fp32-memo"), "fp32"),
        "fp32 record text": (load("fp32-bare"), "fp32")}
re = load("int8-memo")
if re is not None:
    print("stored vs re-embedded int8 memo text, min cosine:", float(np.min(np.sum(stored * re, axis=1))))
for label, (M, model) in mats.items():
    if M is None:
        continue
    print(f"{label:32s} reworded@10 raw-q {recall(M, rw, model + '_raw')}  mail-lane-q {recall(M, rw, model + '_mail')}"
          f"   all46@10 raw-q {recall(M, Q, model + '_raw')}")
