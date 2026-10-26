"""The evidence pipeline's holdout pairs (rerank_pairs.py: 9 questions x 50) scored by Python's native ONNX Runtime,
timed per question. Usage: python python_native.py <evidence-pipeline dir> <mmarco dir> <threads> <out.json>"""
import json
import pathlib
import random
import sys
import time

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

root, model_dir, threads, out = pathlib.Path(sys.argv[1]), sys.argv[2], int(sys.argv[3]), sys.argv[4]
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
      passage = f"[{titles[u['source']]} · {u.get('author')} · {u['at'][:10]}] {u['text']}"
      pairs.append({"q": q["id"], "query": q["text"], "passage": passage, "grade": q["grades"].get(uid, 0)})
tok = Tokenizer.from_file(f"{model_dir}/tokenizer.json")
tok.no_padding()
tok.no_truncation()
options = ort.SessionOptions()
options.intra_op_num_threads = threads
options.inter_op_num_threads = 1
started = time.perf_counter()
session = ort.InferenceSession(f"{model_dir}/onnx/model_quint8_avx2.onnx", sess_options=options,
                               providers=["CPUExecutionProvider"])
load_ms = (time.perf_counter() - started) * 1000
names = {i.name for i in session.get_inputs()}
per_question = {}
tokens = []
for p in pairs:
  started = time.perf_counter()
  e = tok.encode(p["query"], p["passage"])
  ids = e.ids if len(e.ids) <= 512 else e.ids[:511] + e.ids[-1:]
  tokens.append(len(ids))
  feed = {"input_ids": ids, "attention_mask": [1] * len(ids), "token_type_ids": e.type_ids[:len(ids)]}
  p["python"] = float(session.run(None, {k: np.array([feed[k]], dtype=np.int64) for k in names})[0].reshape(-1)[0])
  per_question[p["q"]] = per_question.get(p["q"], 0) + (time.perf_counter() - started) * 1000
json.dump({"onnxruntime": ort.__version__, "threads": threads, "load_ms": load_ms,
           "median_tokens": sorted(tokens)[len(tokens) // 2], "per_question_ms": per_question, "pairs": pairs},
          open(out, "w"), ensure_ascii=False)
print(json.dumps({"load_ms": round(load_ms), "median_tokens": sorted(tokens)[len(tokens) // 2],
                  "per_question_ms": sorted(round(v) for v in per_question.values())}))
