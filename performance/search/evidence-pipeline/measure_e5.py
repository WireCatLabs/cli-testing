"""E5 alone: model load, per-unit index time, index bytes and peak RSS, without any pair model loaded."""
import json
from pathlib import Path
import sys
import time

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

cache, split = Path(sys.argv[1]) / 'e5-small', sys.argv[2]
root = Path(__file__).resolve().parent
texts = [unit['text'] for path in sorted((root / 'corpus' / split).glob('*.json'))
         for unit in json.loads(path.read_text())['units']]
started = time.perf_counter()
tokenizer = Tokenizer.from_file(str(cache / 'tokenizer.json'))
options = ort.SessionOptions()
options.intra_op_num_threads = 4
options.inter_op_num_threads = 1
session = ort.InferenceSession(str(cache / 'onnx/model_quantized.onnx'), sess_options=options,
                               providers=['CPUExecutionProvider'])
load_ms = (time.perf_counter() - started) * 1000
started = time.perf_counter()
vectors = []
for text in texts:
    ids = tokenizer.encode('passage: ' + text).ids[:512]
    feed = {'input_ids': np.array([ids]), 'attention_mask': np.ones((1, len(ids)), dtype=np.int64),
            'token_type_ids': np.zeros((1, len(ids)), dtype=np.int64)}
    hidden = session.run(None, {item.name: feed[item.name] for item in session.get_inputs()})[0][0].mean(axis=0)
    vectors.append(hidden / np.linalg.norm(hidden))
index_ms = (time.perf_counter() - started) * 1000
matrix = np.stack(vectors).astype(np.float32)
peak = next(int(line.split()[1]) * 1024 for line in Path('/proc/self/status').read_text().splitlines()
            if line.startswith('VmHWM:'))
print(json.dumps({'split': split, 'units': len(texts), 'load_ms': round(load_ms), 'index_ms': round(index_ms),
                  'ms_per_unit': round(index_ms / len(texts), 2), 'index_bytes': matrix.nbytes, 'peak_rss': peak}))
