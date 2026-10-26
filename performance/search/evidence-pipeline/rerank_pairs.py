# Holdout pairs (3 questions per project, their graded units plus random ones to 50) scored by native ONNX Runtime.
# Usage: python rerank_pairs.py <evidence-pipeline dir> <model dir> <onnx file> <out.json>
import json, sys, random, pathlib, numpy as np, onnxruntime as ort
from tokenizers import Tokenizer
root = pathlib.Path(sys.argv[1]); model_dir, onnx, out = sys.argv[2], sys.argv[3], sys.argv[4]
random.seed(7)
pairs = []
for project in ("pulsefit", "meeplehaus", "zelenydvor"):
    corpus = json.loads((root / f"corpus/holdout/{project}.json").read_text())
    titles = {s["id"]: s["title"] for s in corpus["sources"]}
    units = {u["id"]: u for u in corpus["units"]}
    for q in json.loads((root / f"questions/holdout/{project}.json").read_text())[:3]:
        ids = list(q["grades"]) + random.sample(sorted(set(units) - set(q["grades"])), 50 - len(q["grades"]))
        for uid in ids[:50]:
            u = units[uid]
            pairs.append({"q": q["id"], "query": q["text"], "passage": f"[{titles[u['source']]} · {u.get('author')} · {u['at'][:10]}] {u['text']}"})
tok = Tokenizer.from_file(f"{model_dir}/tokenizer.json"); tok.no_padding(); tok.no_truncation()
o = ort.SessionOptions(); o.intra_op_num_threads = 4
s = ort.InferenceSession(f"{model_dir}/{onnx}", sess_options=o, providers=["CPUExecutionProvider"])
names = {i.name for i in s.get_inputs()}
for p in pairs:
    e = tok.encode(p["query"], p["passage"]); ids = e.ids
    if len(ids) > 512: ids = ids[:511] + ids[-1:]
    v = {"input_ids": ids, "attention_mask": [1] * len(ids), "token_type_ids": e.type_ids[:len(ids)]}
    p["native"] = float(s.run(None, {k: np.array([v[k]], dtype=np.int64) for k in names})[0].reshape(-1)[0])
json.dump(pairs, open(out, "w"), ensure_ascii=False)
print(len(pairs))
