"""Evaluate frozen text-pair scores; relevance labels enter only this offline step."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import statistics
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--scores', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
area = Path(__file__).resolve().parents[1]
queries = {}
baselines = {}
provenance = {}
for dataset, fixture, report in [('original', 'fixture.json', 'fixed-original.json'), ('fresh', 'fresh.json', 'fixed-fresh.json'), ('frozen', 'ranking-frozen.json', 'fixed-frozen.json')]:
    f = area / 'model-free' / fixture
    r = area / 'model-free/results/ranking-2026-10-11' / report
    corpus = json.loads(f.read_text())
    rows = json.loads(r.read_text())['rows']
    for q in corpus['queries']:
        queries[f"{dataset}/{q['id']}"] = dict(q, dataset=dataset)
    for row in rows:
        if row['mode'] == 'discover':
            baselines[f"{dataset}/{row['id']}"] = row
    provenance[dataset] = dict(fixtureSha256=hashlib.sha256(f.read_bytes()).hexdigest(), baselineSha256=hashlib.sha256(r.read_bytes()).hexdigest())

def metrics(ids, q):
    relevant = q['relevant']
    answers = {mid for mid, grade in relevant.items() if grade == 2}
    position = next((i for i, mid in enumerate(ids[:10]) if mid in answers), None)
    dcg = lambda grades: sum(((2 ** g - 1) / math.log2(i + 2) for i, g in enumerate(grades[:10])))
    return dict(answerAt1=float(position == 0) if answers else None, answerAt3=float(position is not None and position < 3) if answers else None, answerAt10=float(position is not None) if answers else None, mrrAt10=(1 / (position + 1) if position is not None else 0) if answers else None, evidenceRecallAt10=sum((mid in relevant for mid in ids[:10])) / len(relevant) if relevant else None, ndcgAt10=dcg([relevant.get(mid, 0) for mid in ids[:10]]) / dcg(sorted(relevant.values(), reverse=True)) if relevant else None, falseHits=len(ids[:10]) if not relevant else 0, falseHitsAt12=len(ids[:12]) if not relevant else 0, answerAt12=float(any((mid in answers for mid in ids[:12]))) if answers else None, evidenceRecallAt12=sum((mid in relevant for mid in ids[:12])) / len(relevant) if relevant else None)

def aggregate(rows):
    result = dict(queries=len(rows), answerable=sum((r['metrics']['answerAt10'] is not None for r in rows)))
    for key in ['answerAt1', 'answerAt3', 'answerAt10', 'mrrAt10', 'evidenceRecallAt10', 'ndcgAt10', 'answerAt12', 'evidenceRecallAt12']:
        xs = [r['metrics'][key] for r in rows if r['metrics'][key] is not None]
        result[key] = statistics.mean(xs) if xs else None
    result['falseHits'] = sum((r['metrics']['falseHits'] for r in rows))
    result['falseHitsAt12'] = sum((r['metrics']['falseHitsAt12'] for r in rows))
    measured = [r['elapsedMs'] for r in rows if r['elapsedMs'] is not None]
    if measured:
        measured.sort()
        result['rankingP50Ms'] = measured[len(measured) // 2]
        result['rankingP95Ms'] = measured[min(len(measured) - 1, int(len(measured) * 0.95))]
    return result
results = []
base_rows = [dict(id=qid, language=queries[qid]['language'], ids=r['candidateIds'], metrics=metrics(r['candidateIds'], queries[qid]), elapsedMs=None) for qid, r in baselines.items()]

def summaries(rows):
    return {dataset: {lang: aggregate([r for r in rows if queries[r['id']]['dataset'] == dataset and (lang == 'all' or r['language'] == lang)]) for lang in ['all', 'en', 'ru']} for dataset in ['original', 'fresh', 'frozen']}
baseline_summary = summaries(base_rows)
for path in sorted(args.scores.glob('*.json')):
    worker = json.loads(path.read_text())
    scores = {r['id']: r for r in worker['rows']}
    for policy in ['neural', 'rrf', 'preserve-top3', 'supplement-top10']:
        for gate in ['diagnostic-all-languages', 'english-only']:
            rows = []
            for qid, base in baselines.items():
                q = queries[qid]
                pool = base['candidateIds']
                row = scores.get(qid)
                eligible = row is not None and (gate != 'english-only' or q['language'] == 'en')
                ids = list(pool)
                elapsed = None
                if eligible:
                    mids = [mid.removeprefix(qid + '/') for mid in row['ids']]
                    assert set(mids) <= set(pool) and len(mids) == len(set(mids))
                    assert all((math.isfinite(s) for s in row['scores']))
                    order = sorted(range(len(mids)), key=lambda i: (-row['scores'][i], i))
                    neural = [mids[i] for i in order]
                    if policy == 'supplement-top10':
                        ids = pool[:10] + [mid for mid in neural if mid not in set(pool[:10])][:2]
                        ids += [mid for mid in pool if mid not in set(ids)]
                    elif policy == 'preserve-top3':
                        ids = pool[:3] + [mid for mid in neural if mid not in set(pool[:3])] + [mid for mid in pool[3:] if mid not in set(mids)]
                    elif policy == 'neural':
                        ids = neural + [mid for mid in pool if mid not in set(mids)]
                    else:
                        nr = {mid: i + 1 for i, mid in enumerate(neural)}
                        br = {mid: i + 1 for i, mid in enumerate(pool)}
                        ids = sorted(pool, key=lambda mid: -(1 / (60 + br[mid]) + (1 / (60 + nr[mid]) if mid in nr else 0)))
                    elapsed = row['elapsedMs']
                assert set(ids) == set(pool) and len(ids) == len(pool)
                rows.append(dict(id=qid, language=q['language'], ids=ids[:12], metrics=metrics(ids, q), elapsedMs=elapsed))
            summary = summaries(rows)
            results.append(dict(name=path.stem, policy=policy, languageGate=gate, summary=summary, rows=rows, assetsBytes=worker['model']['assetBytes'], loadMs=worker['loadMs'], peakWorkerBytes=worker['maxResidentBytes'], scoredPairs=worker['scoredPairs'], batchEquivalenceProbe=worker['batchEquivalenceProbe'], qualifiesAt10=policy != 'supplement-top10' and all((summary[d]['all'][k] >= baseline_summary[d]['all'][k] - 1e-12 for d in ['original', 'fresh', 'frozen'] for k in ['answerAt1', 'answerAt3', 'answerAt10', 'mrrAt10', 'evidenceRecallAt10', 'ndcgAt10'])), scoresSha256=hashlib.sha256(path.read_bytes()).hexdigest(), inputSha256=worker['inputSha256'], workerSha256=worker['workerSha256']))
report = dict(protocol='No training or label-based score floors; raw neural ordering and equal RRF(k=60); exploratory preserve-top3 and supplement-top10 added after initial evidence loss; raw RU diagnostic and EN-only baseline fallback.', provenance=provenance, evaluatorSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), baseline=baseline_summary, variants=results)
args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
for r in results:
    if r['languageGate'] == 'english-only':
        print(r['name'], r['policy'], [(key, round(r['summary'][key]['all']['answerAt1'], 3), round(r['summary'][key]['all']['answerAt10'], 3)) for key in ['original', 'fresh', 'frozen']])
