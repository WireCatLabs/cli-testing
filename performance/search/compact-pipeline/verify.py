"""Recompute smoke metrics and check the measured input/model/worker fingerprints offline."""
import hashlib
import json
import math
from pathlib import Path
import statistics

root = Path(__file__).resolve().parent
fixture = json.loads((root / 'smoke-fixture.json').read_text())
cases = {case['id']: case for case in fixture['cases']}

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

for name in ['bm25', 'mmarco', 'bge-int8']:
    result = json.loads((root / 'results' / f'{name}.json').read_text())
    assert result['fixture_sha256'] == sha(root / 'smoke-fixture.json')
    assert result['worker_sha256'] == sha(root / 'smoke.py')
    assert result['catalog_sha256'] == sha(root / 'models.json')
    assert {row['id'] for row in result['rows']} == set(cases)
    metrics = []
    for row in result['rows']:
        case = cases[row['id']]
        labels = {document['id']: document['grade'] for document in case['documents']}
        assert set(row['order']) == set(labels)
        grades = [labels[key] for key in row['order']]
        dcg = lambda values: sum((2 ** value - 1) / math.log2(index + 2) for index, value in enumerate(values[:3]))
        expected = {'answerable': 2 in grades, 'answer_at_1': grades[0] == 2,
                    'answer_at_3': 2 in grades[:3],
                    'ndcg_at_3': dcg(grades) / dcg(sorted(grades, reverse=True))}
        for key, value in expected.items():
            assert math.isclose(row[key], value), (name, row['id'], key)
        metrics.append(expected)
    answerable = [row for row in metrics if row['answerable']]
    assert result['answerable_cases'] == len(answerable) == 8
    for key in ['answer_at_1', 'answer_at_3']:
        assert math.isclose(result[key], statistics.mean(row[key] for row in answerable))
    assert math.isclose(result['mean_ndcg_at_3'], statistics.mean(row['ndcg_at_3'] for row in metrics))
    print(name, 'verified', result['cases'], 'cases;', result['answer_at_1'], 'answer@1')
preparation = json.loads((root / 'results' / 'preparation.json').read_text())
assert all(row['preparer_sha256'] == sha(root / 'prepare.mjs') for row in preparation['models'])
print('Preparation fingerprints verified; no model or archive opened')
