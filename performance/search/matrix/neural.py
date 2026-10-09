"""Offline native-CPU scoring worker; each model gets its own process and memory measurement."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import resource
import sys
import time

os.environ['TOKENIZERS_PARALLELISM'] = 'false'
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', required=True, type=Path)
parser.add_argument('--cache', required=True, type=Path)
parser.add_argument('--manifest', required=True, type=Path)
parser.add_argument('--output', required=True, type=Path)
parser.add_argument('--embedding', action='store_true')
parser.add_argument('--batch-size', type=int, default=16)
parser.add_argument('--threads', type=int, default=4)
parser.add_argument('--shortlists', type=Path)
args = parser.parse_args()
assert 1 <= args.batch_size <= 64 and 1 <= args.threads <= 8

def rss():
    lines = Path('/proc/self/status').read_text().splitlines()
    return {line.split(':')[0]: int(line.split()[1])*1024 for line in lines if line.startswith(('VmRSS:', 'VmHWM:'))}

def sha(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

manifest = json.loads(args.manifest.read_text())
for file in manifest['files']:
    assert sha(args.cache/file['name']) == file['sha256'], file['name']
data = json.loads(args.input.read_text())
messages = {m['id']: m['text'] for m in data['messages']}
shortlists = json.loads(args.shortlists.read_text()) if args.shortlists else None
baseline = rss()
start = time.perf_counter()
tokenizer = Tokenizer.from_file(str(args.cache/'tokenizer.json'))
tokenizer.no_truncation()
tokenizer.no_padding()
options = ort.SessionOptions()
options.intra_op_num_threads = args.threads
options.inter_op_num_threads = 1
options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
onnx = next(file['name'] for file in manifest['files'] if file['name'].endswith('.onnx'))
session = ort.InferenceSession(str(args.cache/onnx), sess_options=options, providers=['CPUExecutionProvider'])
load_ms = (time.perf_counter()-start)*1000
inputs = {item.name for item in session.get_inputs()}
assert inputs <= {'input_ids', 'attention_mask', 'token_type_ids'}
assert 'input_ids' in inputs and 'attention_mask' in inputs
assert args.embedding or session.get_outputs()[0].name == 'logits'
pad_id = tokenizer.token_to_id('[PAD]')
if pad_id is None:
    pad_id = tokenizer.token_to_id('<pad>')
assert pad_id is not None
max_tokens = manifest.get('maxTokens', 512)

def infer(texts):
    encodings = tokenizer.encode_batch(texts)
    assert all(len(e.ids) <= max_tokens for e in encodings), 'overlength input; no silent truncation'
    width = max(len(e.ids) for e in encodings)
    ids = np.full((len(encodings), width), pad_id, dtype=np.int64)
    attention = np.zeros_like(ids)
    types = np.zeros_like(ids)
    for i, encoding in enumerate(encodings):
        ids[i, :len(encoding.ids)] = encoding.ids
        types[i, :len(encoding.ids)] = encoding.type_ids
        attention[i, :len(encoding.ids)] = 1
    feeds = {'input_ids': ids, 'attention_mask': attention}
    if 'token_type_ids' in inputs:
        feeds['token_type_ids'] = types
    output = session.run(None, feeds)[0]
    if args.embedding:
        assert output.ndim == 3
        vectors = (output*attention[..., None]).sum(axis=1)/attention.sum(axis=1)[:, None]
        vectors /= np.maximum(np.linalg.norm(vectors, axis=1, keepdims=True), 1e-12)
        assert np.isfinite(vectors).all()
        return vectors
    assert output.size == len(texts)
    scores = output.reshape(-1).astype(float)
    assert np.isfinite(scores).all()
    return scores

rows = []
if args.embedding:
    needed = sorted({c['id'] for row in data['rows'] if row['rerankable'] for c in row['candidates']})
    vector_map = {}
    start = time.perf_counter()
    for offset in range(0, len(needed), args.batch_size):
        ids = needed[offset:offset+args.batch_size]
        vectors = infer(['passage: '+messages[mid] for mid in ids])
        vector_map.update(zip(ids, vectors))
    index_ms = (time.perf_counter()-start)*1000
    for i, row in enumerate(data['rows']):
        if not row['rerankable'] or not row['candidates']:
            continue
        start = time.perf_counter()
        query = infer(['query: '+row['text']])[0]
        scores = [float(query @ vector_map[c['id']]) for c in row['candidates']]
        rows.append(dict(id=row['id'], ids=[c['id'] for c in row['candidates']], scores=scores,
                         elapsedMs=(time.perf_counter()-start)*1000))
    encoded_messages = len(needed)
    equivalence = None
else:
    config = json.loads((args.cache/'config.json').read_text())
    assert config.get('sbert_ce_default_activation_function') == 'torch.nn.modules.linear.Identity'
    assert len(config['id2label']) == 1
    example = next(row for row in data['rows'] if row['rerankable'] and len(row['candidates']) >= 8)
    pairs = [(example['text'], messages[c['id']]) for c in example['candidates'][:8]]
    single = np.array([infer([pair])[0] for pair in pairs])
    batched = infer(pairs)
    max_error = float(np.max(np.abs(single-batched)))
    # Dynamic int8 scales can differ when padding/batching changes the activations.
    equivalence = dict(maxAbsoluteLogitDifference=max_error,
                       sameOrdering=bool(np.array_equal(np.argsort(-single, kind='stable'), np.argsort(-batched, kind='stable'))),
                       pairs=8, singleScores=single.tolist(), batchedScores=batched.tolist())
    for i, row in enumerate(data['rows']):
        if not row['rerankable'] or not row['candidates']:
            continue
        candidates = row['candidates']
        if shortlists:
            chosen = set(shortlists[row['id']])
            candidates = [c for c in candidates if c['id'] in chosen]
        start = time.perf_counter()
        scores = []
        for offset in range(0, len(candidates), args.batch_size):
            pairs = [(row['text'], messages[c['id']]) for c in candidates[offset:offset+args.batch_size]]
            scores.extend(float(s) for s in infer(pairs))
        rows.append(dict(id=row['id'], ids=[c['id'] for c in candidates], scores=scores,
                         elapsedMs=(time.perf_counter()-start)*1000))
        if (i+1) % 12 == 0:
            print(f'{manifest.get("repository", manifest.get("id"))}: {i+1}/{len(data["rows"])} query groups', file=sys.stderr, flush=True)
    index_ms, encoded_messages = 0, 0
output = dict(schemaVersion=1, inputSha256=sha(args.input), workerSha256=sha(Path(__file__)),
              model=manifest, python=sys.version, numpy=np.__version__, onnxruntime=ort.__version__,
              providers=session.get_providers(), batchSize=args.batch_size, threads=args.threads,
              loadMs=load_ms, baselineMemory=baseline, finalMemory=rss(),
              maxResidentBytes=rss()['VmHWM'],
              resourceUsageMaxRssBytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024,
              indexMs=index_ms, encodedMessages=encoded_messages, batchEquivalenceProbe=equivalence,
              scoredPairs=sum(len(r['ids']) for r in rows) if not args.embedding else 0, rows=rows)
args.output.write_text(json.dumps(output, indent=2)+'\n')
print(f'Completed {args.output}: load {load_ms:.1f}ms, peak {output["maxResidentBytes"]/1e6:.1f}MB', file=sys.stderr, flush=True)
