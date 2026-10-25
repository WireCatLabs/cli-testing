"""Offline synthetic shortlist scoring; no archive, provider, model download or generated answer."""
import argparse
from collections import Counter
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import platform
import re
import statistics
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--model', choices=['bm25', 'mmarco', 'bge-int8'], required=True)
parser.add_argument('--cache', type=Path)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--threads', type=int, default=4)
parser.add_argument('--repeats', type=int, default=3)
args = parser.parse_args()
assert 1 <= args.threads <= 8 and 1 <= args.repeats <= 10
assert not args.output.exists(), 'refuse to overwrite a run'
root = Path(__file__).resolve().parent
fixture = root / 'smoke-fixture.json'
cases = json.loads(fixture.read_text())['cases']
catalog = root / 'models.json'

def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def memory():
    return {line.split(':')[0]: int(line.split()[1]) * 1024
            for line in Path('/proc/self/status').read_text().splitlines()
            if line.startswith(('VmRSS:', 'VmHWM:'))}

def bm25(query, documents):
    tokens = lambda text: re.findall(r'\w+', text.casefold())
    bags = [Counter(tokens(text)) for text in documents]
    lengths = [sum(bag.values()) for bag in bags]
    average = sum(lengths) / len(lengths)
    scores = []
    for bag, length in zip(bags, lengths):
        score = 0
        for word in set(tokens(query)):
            count = bag[word]
            frequency = sum(word in other for other in bags)
            idf = math.log(1 + (len(bags) - frequency + .5) / (frequency + .5))
            score += idf * count * 2.2 / (count + 1.2 * (.25 + .75 * length / average))
        scores.append(score)
    return scores

versions = {}
load_start = time.perf_counter()
model = None
if args.model == 'bm25':
    score = bm25
else:
    import numpy as np
    import onnxruntime as ort
    from tokenizers import Tokenizer
    assert args.cache is not None
    model = next(item for item in json.loads(catalog.read_text())['models'] if item['id'] == args.model)
    cache = args.cache / args.model
    for file in model['files']:
        assert sha(cache / file['name']) == file['sha256'], file['name']
    tokenizer = Tokenizer.from_file(str(cache / 'tokenizer.json'))
    tokenizer.no_padding()
    tokenizer.no_truncation()
    options = ort.SessionOptions()
    options.intra_op_num_threads = args.threads
    options.inter_op_num_threads = 1
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    weights = next(file['name'] for file in model['files'] if file['name'].endswith('.onnx'))
    session = ort.InferenceSession(str(cache / weights), sess_options=options, providers=['CPUExecutionProvider'])
    inputs = {item.name for item in session.get_inputs()}
    assert inputs <= {'input_ids', 'attention_mask', 'token_type_ids'}

    def score(query, documents):
        scores = []
        for document in documents:
            encoding = tokenizer.encode(query, document)
            assert len(encoding.ids) <= model['max_tokens'], 'overlength pair; no silent clipping'
            values = {'input_ids': encoding.ids, 'attention_mask': [1] * len(encoding.ids),
                      'token_type_ids': encoding.type_ids}
            output = session.run(None, {key: np.array([values[key]], dtype=np.int64) for key in inputs})[0]
            assert output.size == 1 and np.isfinite(output).all()
            scores.append(float(output.reshape(-1)[0]))
        return scores

    versions = {name: importlib.metadata.version(name) for name in ['numpy', 'onnxruntime', 'tokenizers']}
load_ms = (time.perf_counter() - load_start) * 1000
rows, times = [], []
for case in cases:
    documents = [document['text'] for document in case['documents']]
    repeats = []
    for _ in range(args.repeats):
        started = time.perf_counter()
        scores = score(case['query'], documents)
        repeats.append((time.perf_counter() - started) * 1000)
    times.extend(repeats)
    order = sorted(range(len(scores)), key=lambda index: (-scores[index], index))
    grades = [case['documents'][index]['grade'] for index in order]
    dcg = lambda values: sum((2 ** value - 1) / math.log2(index + 2) for index, value in enumerate(values[:3]))
    rows.append({'id': case['id'], 'language': case['language'], 'kind': case['kind'],
                 'order': [case['documents'][index]['id'] for index in order], 'scores': scores,
                 'answerable': 2 in grades, 'answer_at_1': grades[0] == 2, 'answer_at_3': 2 in grades[:3],
                 'ndcg_at_3': dcg(grades) / dcg(sorted(grades, reverse=True)), 'elapsed_ms': repeats})
answerable = [row for row in rows if row['answerable']]
result = {'purpose': 'Synthetic feasibility smoke; authored/exposed, not production quality evidence',
          'model': args.model, 'model_revision': model['revision'] if model else None,
          'asset_bytes': model['asset_bytes'] if model else 0, 'threads': args.threads, 'batch_size': 1,
          'fixture_sha256': sha(fixture), 'worker_sha256': sha(Path(__file__)), 'catalog_sha256': sha(catalog),
          'python': platform.python_version(), 'platform': platform.platform(), 'versions': versions,
          'setup_and_verification_ms': load_ms, 'cases': len(rows), 'answerable_cases': len(answerable),
          'answer_at_1': sum(row['answer_at_1'] for row in answerable) / len(answerable),
          'answer_at_3': sum(row['answer_at_3'] for row in answerable) / len(answerable),
          'mean_ndcg_at_3': statistics.mean(row['ndcg_at_3'] for row in rows),
          'scoring_p50_ms': statistics.median(times), 'scoring_max_ms': max(times),
          'memory': memory(), 'no_abstention_implemented': True, 'rows': rows}
args.output.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if key != 'rows'}))
